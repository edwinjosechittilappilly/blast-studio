import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { parseDocument } from "yaml";
import { containedPath, parseCampaignRef, validateId, type CampaignRef } from "./campaigns.ts";
import type { IO } from "./io.ts";
import { PLATFORM_IDS, UserError, type PlatformId, type StudioConfig } from "./types.ts";

export const DEFAULT_PLATFORMS: PlatformId[] = ["devto", "linkedin", "x", "bluesky", "mastodon", "hn", "reddit", "github-discussion"];
export const DEFAULT_CONFIG = `# Blast Studio configuration. Keep your brand assets and unpublished work private.
studio:
  # Defaults to ~/BlastStudio; BSTUDIO_HOME overrides this setting.
  root: ~/BlastStudio
brand:
  name: My brand
  pitch: ""
  audience: ""
  voice: []
  colors: { ink: "#1a1a1a", paper: "#ffffff", accent: "#315efb", accent2: "#ed7458" }
  fonts: { display: sans-serif, text: sans-serif, mono: monospace }
  links: {}
platforms: [devto, linkedin, x, bluesky, mastodon, hn, reddit, github-discussion]
agent:
  command: [omp, -p]
  timeoutSeconds: 900
  sandbox: off
reviewer:
  command: [omp, -p, --model, '@review']
  timeoutSeconds: 900
review:
  threshold: 75
  maxRounds: 2
images:
  provider: none
voice:
  provider: none
budget:
  # Zero disables paid calls until explicitly increased.
  monthlyUsd: 0
  perProjectUsd: 0
providers:
  # Uploads to external providers require explicit consent.
  allowUpload: false
grounding:
  waive: []
marketBlaster:
  command: [mblast]
`;

export function configFile(io: IO): string {
  const home = io.env.HOME || homedir();
  return resolve(io.cwd, io.env.BSTUDIO_CONFIG || join(home, ".config", "blast-studio", "studio.yml"));
}
function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
}
function expand(path: string, home: string, cwd: string): string {
  const expanded = path === "~" ? home : path.startsWith("~/") ? join(home, path.slice(2)) : path;
  return isAbsolute(expanded) ? expanded : resolve(cwd, expanded);
}
function command(value: unknown, fallback: string[], field: string): string[] {
  if (value === undefined) return fallback;
  if (!Array.isArray(value) || !value.length || value.some((v) => typeof v !== "string" || !v))
    throw new UserError(`${field} must be a non-empty array of strings`);
  return value as string[];
}
function number(value: unknown, fallback: number, field: string, max = Infinity): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max)
    throw new UserError(`${field} must be a number between 0 and ${max}`);
  return value;
}
export function loadConfig(io: IO): StudioConfig {
  const file = configFile(io);
  let data: Record<string, unknown>;
  try {
    const doc = parseDocument(readFileSync(file, "utf8"));
    if (doc.errors.length) throw doc.errors[0];
    data = obj(doc.toJS());
  } catch (err) {
    throw new UserError(`Cannot read ${file}: ${(err as Error).message}. Run bstudio init first.`);
  }
  const home = io.env.HOME || homedir();
  const studio = obj(data.studio), brand = obj(data.brand), agent = obj(data.agent), reviewer = obj(data.reviewer);
  const review = obj(data.review), images = obj(data.images), voice = obj(data.voice), budget = obj(data.budget);
  const providers = obj(data.providers), grounding = obj(data.grounding), market = obj(data.marketBlaster);
  const root = io.env.BSTUDIO_HOME || studio.root || "~/BlastStudio";
  if (typeof root !== "string" || !root) throw new UserError("studio.root must be a path");
  const platforms = data.platforms ?? DEFAULT_PLATFORMS;
  if (!Array.isArray(platforms) || platforms.some((id) => typeof id !== "string" || !(PLATFORM_IDS as readonly string[]).includes(id)))
    throw new UserError("platforms must be a list of known platform IDs");
  const imageProvider = images.provider ?? "none", voiceProvider = voice.provider ?? "none";
  if (!["none", "gemini", "openai", "omp"].includes(String(imageProvider))) throw new UserError("Unknown images.provider");
  if (!["none", "openai"].includes(String(voiceProvider))) throw new UserError("Unknown voice.provider");
  if (providers.allowUpload !== undefined && typeof providers.allowUpload !== "boolean") throw new UserError("providers.allowUpload must be boolean");
  if (grounding.waive !== undefined && (!Array.isArray(grounding.waive) || grounding.waive.some((v) => typeof v !== "string"))) throw new UserError("grounding.waive must be a list of strings");
  if (agent.passEnv !== undefined && (!Array.isArray(agent.passEnv) || agent.passEnv.some(v => typeof v !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(v)))) throw new UserError("agent.passEnv must be a list of environment variable names");
  if (!["on", "off"].includes(String(agent.sandbox ?? "off"))) throw new UserError("agent.sandbox must be on or off");
  for (const [name, settings] of [["agent", agent], ["reviewer", reviewer]] as const) {
    if (!["subscription", "api"].includes(String(settings.billing ?? "subscription"))) throw new UserError(`${name}.billing must be subscription or api`);
    if (settings.maxUsdPerRun !== undefined && (typeof settings.maxUsdPerRun !== "number" || !Number.isFinite(settings.maxUsdPerRun) || settings.maxUsdPerRun <= 0)) throw new UserError(`${name}.maxUsdPerRun must be a positive number`);
    if (settings.billing === "api" && settings.maxUsdPerRun === undefined) throw new UserError(`${name}.maxUsdPerRun is required for API billing`);
  }
  return {
    root: expand(root, home, io.cwd), file,
    brand: { ...brand, name: typeof brand.name === "string" ? brand.name : "My brand" } as StudioConfig["brand"],
    platforms: platforms as PlatformId[],
    agent: { command: command(agent.command, ["omp", "-p"], "agent.command"), timeoutSeconds: number(agent.timeoutSeconds, 900, "agent.timeoutSeconds"), passEnv: (agent.passEnv ?? []) as string[], billing: (agent.billing ?? "subscription") as "subscription" | "api", maxUsdPerRun: agent.maxUsdPerRun as number | undefined, sandbox: (agent.sandbox ?? "off") as "on" | "off" },
    reviewer: { command: reviewer.command === null ? null : command(reviewer.command, ["omp", "-p", "--model", "@review"], "reviewer.command"), timeoutSeconds: number(reviewer.timeoutSeconds, 900, "reviewer.timeoutSeconds"), billing: (reviewer.billing ?? "subscription") as "subscription" | "api", maxUsdPerRun: reviewer.maxUsdPerRun as number | undefined },
    review: { threshold: number(review.threshold, 75, "review.threshold", 100), maxRounds: number(review.maxRounds, 2, "review.maxRounds") },
    images: { provider: imageProvider as StudioConfig["images"]["provider"], ...(typeof images.model === "string" ? { model: images.model } : {}) },
    voice: { provider: voiceProvider as StudioConfig["voice"]["provider"], ...(typeof voice.model === "string" ? { model: voice.model } : {}), ...(typeof voice.voice === "string" ? { voice: voice.voice } : {}) },
    budget: { monthlyUsd: number(budget.monthlyUsd, 0, "budget.monthlyUsd"), perProjectUsd: number(budget.perProjectUsd, 0, "budget.perProjectUsd") },
    providers: { allowUpload: providers.allowUpload === true }, grounding: { waive: (grounding.waive ?? []) as string[] },
    marketBlaster: { command: command(market.command, ["mblast"], "marketBlaster.command"), ...(typeof market.project === "string" ? { project: market.project } : {}) },
  };
}
export function projectRoot(config: StudioConfig, project: string): string {
  return containedPath(config.root, "projects", validateId(project));
}
export function campaignDir(config: StudioConfig, ref: CampaignRef | string): string {
  const identity = typeof ref === "string" ? parseCampaignRef(ref) : { project: validateId(ref.project), campaign: validateId(ref.campaign) };
  const project = projectRoot(config, identity.project);
  return containedPath(project, "campaigns", identity.campaign);
}
export function writeConfigField(config: StudioConfig, path: string[], value: unknown): void {
  if (!path.length) throw new UserError("Config field path must not be empty");
  const doc = parseDocument(readFileSync(config.file, "utf8"));
  if (doc.errors.length) throw new UserError(`Invalid YAML: ${doc.errors[0].message}`);
  doc.setIn(path, value);
  writeFileSync(config.file, doc.toString(), { mode: 0o600 });
}
