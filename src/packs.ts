import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { Ajv } from "ajv";
import { parse } from "yaml";
import { PLATFORM_IDS, UserError } from "./types.ts";
import type { PlatformId, PlatformPack, Sourced } from "./types.ts";

export interface SourceRow {
  id: string;
  platform: PlatformId | "cross-platform" | "provider" | "tool";
  url: string;
  scope: string;
  detector: { kind: "page-hash"; selector?: string } | { kind: "git-path"; repo: string; path: string; branch?: string } | { kind: "manual" };
  governs: string[];
}

const root = fileURLToPath(new URL("../", import.meta.url));
const platformDir = join(root, "platforms");

function readYaml(path: string): unknown {
  try {
    return parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new UserError(`${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function loadSources(): SourceRow[] {
  const file = join(platformDir, "sources.yml");
  const rows = readYaml(file);
  if (!Array.isArray(rows)) throw new UserError(`${file}: / must be an array`);
  const ids = new Set<string>();
  for (const [index, row] of rows.entries()) {
    const validPlatform = [...PLATFORM_IDS, "cross-platform", "provider", "tool"].includes(row?.platform);
    const detector = row?.detector;
    const validDetector = detector && (detector.kind === "manual" ||
      (detector.kind === "page-hash" && (detector.selector === undefined || typeof detector.selector === "string")) ||
      (detector.kind === "git-path" && typeof detector.repo === "string" && typeof detector.path === "string" && (detector.branch === undefined || typeof detector.branch === "string")));
    if (!row || typeof row.id !== "string" || !row.id || ids.has(row.id) || !validPlatform ||
      typeof row.url !== "string" || typeof row.scope !== "string" || !validDetector ||
      !Array.isArray(row.governs) || !row.governs.every((value: unknown) => typeof value === "string")) {
      throw new UserError(`${file}: /${index} invalid source row`);
    }
    ids.add(row.id);
  }
  return rows as SourceRow[];
}

export function loadPacks(): Map<PlatformId, PlatformPack> {
  const schemaFile = join(root, "schemas", "pack.schema.json");
  let schema: unknown;
  try {
    schema = JSON.parse(readFileSync(schemaFile, "utf8"));
  } catch (error) {
    throw new UserError(`${schemaFile}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const validate = new Ajv({ allErrors: true }).compile(schema as object);
  const sourceIds = new Set(loadSources().map((source) => source.id));
  const packs = new Map<PlatformId, PlatformPack>();
  for (const id of PLATFORM_IDS) {
    const file = join(platformDir, id, "pack.yml");
    const data = readYaml(file);
    if (!validate(data)) {
      const error = validate.errors?.[0];
      throw new UserError(`${file}: ${error?.instancePath || "/"} ${error?.message ?? "invalid pack"}`);
    }
    const pack = data as PlatformPack;
    if (pack.id !== id) throw new UserError(`${file}: /id must match directory ${id}`);
    for (const [index, source] of pack.sources.entries()) {
      if (!sourceIds.has(source)) throw new UserError(`${file}: /sources/${index} unknown source ${source}`);
    }
    const checkSources = (value: unknown, path: string): void => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) {
        value.forEach((item, index) => checkSources(item, `${path}/${index}`));
        return;
      }
      for (const [key, item] of Object.entries(value)) {
        if (key === "source" && typeof item === "string" && (!sourceIds.has(item) || !pack.sources.includes(item))) {
          throw new UserError(`${file}: ${path}/source unknown or unlisted source ${item}`);
        }
        checkSources(item, `${path}/${key}`);
      }
    };
    checkSources(pack, "");
    packs.set(id, pack);
  }
  return packs;
}

export function loadPack(id: PlatformId): PlatformPack {
  const pack = loadPacks().get(id);
  if (!pack) throw new UserError(`Unknown platform: ${id}`);
  return pack;
}

export function knownValue<T>(value: Sourced<T> | undefined): T | undefined {
  return value === undefined || value === "unknown" ? undefined : value.value;
}
