import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadEnv } from "../env.ts";
import type { IO } from "../io.ts";
import type { StudioConfig } from "../types.ts";
import { UserError } from "../types.ts";
import { reserve, settle } from "../budget/ledger.ts";
import { price } from "./images.ts";

export async function generateVoice(opts: { config: StudioConfig; io: IO; projectSlug: string; text: string; out: string; regen?: boolean }): Promise<{ file: string; costUsd: number; provider: "openai"; model: string; promptHash: string; license: string; aiGenerated: true }> {
  const { config, io, projectSlug, text, out } = opts;
  if (config.voice.provider !== "openai") throw new UserError("Set voice.provider to openai to generate speech");
  if (!text || text.length > 4096) throw new UserError("Voice text must contain 1–4096 characters");
  const model = config.voice.model ?? "tts-1", rate = price(model, "openai", "voice").usdPerCharacter;
  if (!rate || !Number.isFinite(rate)) throw new UserError(`Invalid price for ${model}`);
  const voice = config.voice.voice ?? "alloy";
  const promptHash = createHash("sha256").update(JSON.stringify({ text, model, voice })).digest("hex");
  const cacheDir = join(config.root, "cache", "voice"), cache = join(cacheDir, `${promptHash}.wav`), meta = `${cache}.json`;
  const license = "https://openai.com/policies/business-terms/";
  if (!opts.regen && existsSync(cache) && existsSync(meta)) {
    const saved = JSON.parse(readFileSync(meta, "utf8")) as { costUsd: number };
    mkdirSync(dirname(out), { recursive: true });
    copyFileSync(cache, out);
    return { file: out, costUsd: saved.costUsd, provider: "openai", model, promptHash, license, aiGenerated: true };
  }
  const key = loadEnv(config.root, io.env, io.keychain).OPENAI_API_KEY;
  if (!key) throw new UserError("Missing OPENAI_API_KEY");
  const costUsd = Array.from(text).length * rate;
  const id = await reserve(config, costUsd, { projectSlug, provider: "openai", model });
  let bytes: Buffer;
  try {
    const response = await io.fetch("https://api.openai.com/v1/audio/speech", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ model, input: text, voice, response_format: "wav" }), signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new UserError(`OpenAI speech request failed (${response.status})`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 12 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") throw new UserError("Provider returned invalid WAV audio");
  } catch (error) { await settle(config.root, id, 0); throw error; }
  await settle(config.root, id, costUsd, { characters: Array.from(text).length });
  mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
  writeFileSync(cache, bytes, { mode: 0o600 });
  writeFileSync(meta, JSON.stringify({ costUsd, provider: "openai", model, promptHash, license, aiGenerated: true }), { mode: 0o600 });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, bytes, { mode: 0o600 });
  return { file: out, costUsd, provider: "openai", model, promptHash, license, aiGenerated: true };
}
