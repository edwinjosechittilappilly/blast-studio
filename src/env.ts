import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Env } from "./types.ts";

export function parseDotenv(text: string): Env {
  const out: Env = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    const quoted = value.match(/^(['"])(.*?)\1(?:\s*#.*)?\s*$/);
    value = quoted ? quoted[2] : value.replace(/\s+#.*$/, "").trim();
    out[match[1]] = value;
  }
  return out;
}
export function loadEnv(root: string, processEnv: Env = process.env, keychain?: (key: string) => string | undefined): Env {
  const file = join(root, ".env");
  const env: Env = existsSync(file) ? parseDotenv(readFileSync(file, "utf8")) : {};
  for (const [key, value] of Object.entries(processEnv)) if (value) env[key] = value;
  for (const key of ["GEMINI_API_KEY", "OPENAI_API_KEY"]) if (!env[key]) env[key] = keychain?.(key);
  return env;
}
