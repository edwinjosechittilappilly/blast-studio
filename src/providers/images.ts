import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { loadEnv } from "../env.ts";
import type { IO } from "../io.ts";
import type { StudioConfig } from "../types.ts";
import { UserError } from "../types.ts";
import { recordAgentRun, reserve, settle } from "../budget/ledger.ts";

type Price = { provider: string; kind: string; upperUsd?: number; usdPerCharacter?: number };
export function price(model: string, provider: string, kind: string): Price {
  const table = parse(readFileSync(fileURLToPath(new URL("../../providers/prices.yml", import.meta.url)), "utf8")) as { models: Record<string, Price> };
  const entry = table.models[model];
  if (!entry || entry.provider !== provider || entry.kind !== kind) throw new UserError(`No price for ${provider} ${model}`);
  return entry;
}
export async function generateImage(opts: { config: StudioConfig; io: IO; projectSlug: string; prompt: string; size: string; out: string; regen: boolean; referenceImages?: string[] }): Promise<{ file: string; costUsd: number | null; provider: string; aiGenerated: true; model: string; promptHash: string; license: string }> {
  const { config, io, projectSlug, prompt, size, out, regen } = opts;
  const provider = config.images.provider;
  if (opts.referenceImages?.length) {
    if (!config.providers.allowUpload) throw new UserError("Reference image uploads are disabled");
    throw new UserError("Reference image uploads are not supported by this adapter");
  }
  if (provider === "none") throw new UserError("Set images.provider before generating images");
  if (provider === "omp" && (!io.isTTY || !!io.env.CI)) throw new UserError("omp image generation requires an interactive terminal outside CI");
  const dimensions = /^(\d+)x(\d+)$/.exec(size);
  if (!dimensions || Number(dimensions[1]) < 1 || Number(dimensions[2]) < 1) throw new UserError("Image size must be WIDTHxHEIGHT");
  const width = Number(dimensions[1]), height = Number(dimensions[2]);
  const aspect = width === height ? "1:1" : width > height ? "3:2" : "2:3";
  const apiSize = aspect === "1:1" ? "1024x1024" : aspect === "3:2" ? "1536x1024" : "1024x1536";
  if (prompt.length > 4000) throw new UserError("Image prompt exceeds 4000 characters");
  const model = config.images.model ?? (provider === "gemini" ? "gemini-nano-banana-2.1" : provider === "openai" ? "gpt-image-2" : "omp");
  const promptHash = createHash("sha256").update(JSON.stringify({ prompt, size, provider, model })).digest("hex");
  const cacheDir = join(config.root, "cache", "images"), cache = join(cacheDir, `${promptHash}.png`), meta = `${cache}.json`;
  const license = provider === "gemini" ? "https://ai.google.dev/gemini-api/terms" : provider === "openai" ? "https://openai.com/policies/business-terms/" : "omp subscription terms";
  mkdirSync(dirname(out), { recursive: true });
  if (!regen && existsSync(cache) && existsSync(meta)) {
    copyFileSync(cache, out);
    const saved = JSON.parse(readFileSync(meta, "utf8")) as { costUsd: number | null };
    return { file: out, costUsd: saved.costUsd, provider, aiGenerated: true, model, promptHash, license };
  }
  let bytes: Buffer, costUsd: number | null = null;
  if (provider === "omp") {
    io.out(`Generate an image interactively with omp for this prompt:\n${prompt}`);
    const path = (await io.prompt("Path to the generated PNG: ")).trim();
    bytes = readFileSync(path);
    await recordAgentRun(config, { model, ms: 0, usd: null, projectSlug, provider: "omp", usage: { images: 1 } });
  } else {
    const amount = price(model, provider, "image").upperUsd;
    if (!amount || !Number.isFinite(amount)) throw new UserError(`Invalid price for ${model}`);
    const env = loadEnv(config.root, io.env, io.keychain), key = env[provider === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY"];
    if (!key) throw new UserError(`Missing ${provider === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY"}`);
    const id = await reserve(config, amount, { projectSlug, provider, model });
    const gemini = provider === "gemini";
    let response: Response;
    try {
      response = await io.fetch(gemini ? `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent` : "https://api.openai.com/v1/images/generations", {
        method: "POST", headers: { "content-type": "application/json", ...(gemini ? { "x-goog-api-key": key } : { authorization: `Bearer ${key}` }) },
        body: JSON.stringify(gemini ? { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: aspect } } } : { model, prompt, size: apiSize, quality: "medium", output_format: "png", n: 1 }), signal: AbortSignal.timeout(120000),
      });
    } catch (error) { await settle(config.root, id, 0); throw error; }
    if (!response.ok) { await settle(config.root, id, 0); throw new UserError(`${provider} image request failed (${response.status})`); }
    let usage: unknown;
    try {
    const json: unknown = await response.json();
    const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
    const root = object(json);
    const candidates = Array.isArray(root.candidates) ? root.candidates : [];
    const first = Array.isArray(root.data) ? object(root.data[0]) : {};
    const parts = candidates.flatMap((candidate: unknown) => {
      const value = object(object(candidate).content).parts;
      return Array.isArray(value) ? value : [];
    });
    const encoded = gemini ? parts.map((part: unknown) => object(object(part).inlineData).data).find((data: unknown) => typeof data === "string" && data.length > 0) : first.b64_json;
    if (typeof encoded !== "string" || !encoded) throw new UserError("Provider returned no image");
    bytes = Buffer.from(encoded, "base64");
    if (!bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new UserError("Provider returned a non-PNG image");
    // The API does not provide a reliable dollar total; retain the priced upper bound.
    costUsd = amount;
    usage = root.usageMetadata ?? root.usage;
    } catch (error) { await settle(config.root, id, 0); throw error; }
    await settle(config.root, id, amount, usage);
  }
  if (!bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new UserError("Provider returned a non-PNG image");
  mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
  writeFileSync(cache, bytes, { mode: 0o600 });
  writeFileSync(meta, JSON.stringify({ provider, model, promptHash, costUsd, aiGenerated: true, license }), { mode: 0o600 });
  writeFileSync(out, bytes, { mode: 0o600 });
  return { file: out, costUsd, provider, aiGenerated: true, model, promptHash, license };
}
