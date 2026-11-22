import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../src/config.ts";
import { monthToDate, projectTotal, recordAgentRun, reserve, settle } from "../src/budget/ledger.ts";
import { generateImage } from "../src/providers/images.ts";
import { generateVoice } from "../src/providers/voice.ts";
import { run } from "../src/commands/budget.ts";
import { fakeIO, mockFetch, tempStudio } from "./helpers.ts";

function setup() {
  const dir = tempStudio({ "studio.yml": "# keep me\nbudget:\n  monthlyUsd: 2\n  perProjectUsd: 0\nimages:\n  provider: openai\n" });
  const io = fakeIO({ cwd: dir, env: { BSTUDIO_CONFIG: join(dir, "studio.yml"), BSTUDIO_HOME: dir, OPENAI_API_KEY: "test", GEMINI_API_KEY: "test" } });
  return { dir, io, config: loadConfig(io) };
}
test("reservations enforce caps concurrently and survive interruption", async () => {
  const { config } = setup(); config.budget.monthlyUsd = 1;
  const meta = { projectSlug: "one", provider: "openai", model: "test" };
  const results = await Promise.allSettled([reserve(config, 0.6, meta), reserve(config, 0.6, meta)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(monthToDate(config.root), 0.6);
  const id = (results.find(r => r.status === "fulfilled") as PromiseFulfilledResult<string>).value;
  await settle(config.root, id, 0.2, {});
  assert.equal(projectTotal(config.root, "one"), 0.2);
  await recordAgentRun(config, { model: "sub", ms: 20, usd: null });
  assert.equal(monthToDate(config.root), 0.2);
});
test("UTC month attribution and settlement", () => {
  const { config } = setup();
  const common = { id: "1", projectSlug: "p", provider: "openai", model: "m" };
  writeFileSync(join(config.root, "ledger.jsonl"), [JSON.stringify({ ...common, type: "reserved", at: "2026-10-31T23:59:59Z", usd: 1 }), JSON.stringify({ ...common, type: "settled", at: "2026-11-01T00:00:01Z", usd: 0.4 })].join("\n") + "\n");
  assert.equal(monthToDate(config.root, new Date("2026-10-31T23:59:59Z")), 0.4);
  assert.equal(monthToDate(config.root, new Date("2026-11-01T00:00:00Z")), 0);
});
test("image request shapes, cache and zero cap", async () => {
  for (const provider of ["openai", "gemini"] as const) {
    const { config, io, dir } = setup(); config.images.provider = provider;
    const png = Buffer.from([137,80,78,71,13,10,26,10,1]).toString("base64");
    const network = mockFetch(() => [200, provider === "openai" ? { data: [{ b64_json: png }] } : { candidates: [{ content: { parts: [{ inlineData: { data: png } }] } }] }]); io.fetch = network.fetch;
    const opts = { config, io, projectSlug: "one", prompt: "test", size: "1024x1024", out: join(dir, "out.png"), regen: false };
    config.budget.monthlyUsd = 0;
    await assert.rejects(generateImage(opts), /budget/i); assert.equal(network.calls.length, 0);
    config.budget.monthlyUsd = 2;
    await generateImage(opts); await generateImage(opts); assert.equal(network.calls.length, 1);
    const body = JSON.parse(network.calls[0].body);
    if (provider === "gemini") assert.deepEqual(body.generationConfig.responseModalities, ["IMAGE"]);
    else assert.equal(body.model, "gpt-image-2");
    config.images.model = "unknown"; await assert.rejects(generateImage(opts), /No price/);
  }
});
test("budget editing preserves comments", async () => {
  const { io, dir } = setup();
  await run(["set", "4.5"], io); await run(["set-project", "3"], io);
  const text = readFileSync(join(dir, "studio.yml"), "utf8");
  assert.match(text, /# keep me/); assert.match(text, /monthlyUsd: 4.5/); assert.match(text, /perProjectUsd: 3/);
});
test("upload policy and interactive provider restrictions", async () => {
  const { config, io, dir } = setup();
  const opts = { config, io, projectSlug: "one", prompt: "test", size: "1024x1024", out: join(dir, "out.png"), regen: false };
  await assert.rejects(generateImage({ ...opts, referenceImages: ["private.png"] }), /uploads are disabled/);
  config.images.provider = "omp";
  await assert.rejects(generateImage(opts), /interactive terminal/);
  io.isTTY = true; io.env.CI = "true";
  await assert.rejects(generateImage(opts), /outside CI/);
});
test("voice uses WAV speech API and reserves its character cost", async () => {
  const { config, io, dir } = setup();
  config.voice.provider = "openai";
  let calls = 0;
  io.fetch = (async (url, init) => { calls++; assert.equal(String(url), "https://api.openai.com/v1/audio/speech"); assert.equal(JSON.parse(String(init?.body)).response_format, "wav"); return new Response(Buffer.from("RIFF0000WAVE")); }) as typeof fetch;
  const result = await generateVoice({ config, io, projectSlug: "p", text: "hello", out: join(dir, "voice.wav") });
  assert.equal(readFileSync(result.file).toString("ascii", 0, 4), "RIFF");
  assert.equal(readFileSync(result.file).toString("ascii", 8, 12), "WAVE");
  assert.equal(monthToDate(config.root), result.costUsd);
  await generateVoice({ config, io, projectSlug: "p", text: "hello", out: join(dir, "cached.wav") });
  assert.equal(calls, 1);
  await generateVoice({ config, io, projectSlug: "p", text: "hello", out: join(dir, "regenerated.wav"), regen: true });
  assert.equal(calls, 2);
});

test("torn ledger is reported as a user error", () => {
  const { config } = setup();
  writeFileSync(join(config.root, "ledger.jsonl"), '{"id":');
  assert.throws(() => monthToDate(config.root), /Invalid ledger line 1/);
});

test("stale lock is recovered before reserving", async () => {
  const { config } = setup();
  writeFileSync(join(config.root, "ledger.lock"), "2147483647");
  const meta = { projectSlug: "one", provider: "openai", model: "test" };
  await Promise.all([reserve(config, 0.2, meta), reserve(config, 0.3, meta)]);
  assert.equal(monthToDate(config.root), 0.5);
});

test("failed provider calls release reservations", async () => {
  const { config, io, dir } = setup();
  io.fetch = mockFetch(() => [400, {}]).fetch;
  await assert.rejects(generateImage({ config, io, projectSlug: "one", prompt: "test", size: "1024x1024", out: join(dir, "out.png"), regen: false }), /400/);
  assert.equal(monthToDate(config.root), 0);
  config.voice.provider = "openai";
  io.fetch = mockFetch(() => [200, {}]).fetch;
  await assert.rejects(generateVoice({ config, io, projectSlug: "one", text: "hello", out: join(dir, "voice.wav") }), /invalid WAV/);
  assert.equal(monthToDate(config.root), 0);
});
