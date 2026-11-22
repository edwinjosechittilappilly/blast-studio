import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Path to an npm dependency's bin script, found the way Node resolves packages: the nearest
 * `node_modules/<pkg>` walking up from this file. npm may nest the dependency inside blast-studio
 * (source checkout, global install) or hoist it into the consumer's node_modules (local install).
 * Reads package.json from disk because some packages (mermaid-cli) don't export it.
 */
export function packageBin(pkg: string, bin: string): string | null {
  for (let dir = dirname(fileURLToPath(import.meta.url)); ; dir = dirname(dir)) {
    const manifest = join(dir, "node_modules", pkg, "package.json");
    if (existsSync(manifest)) {
      const field = (JSON.parse(readFileSync(manifest, "utf8")) as { bin?: string | Record<string, string> }).bin;
      const relative = typeof field === "string" ? field : field?.[bin];
      return relative ? join(dirname(manifest), relative) : null;
    }
    if (dir === dirname(dir)) return null;
  }
}
