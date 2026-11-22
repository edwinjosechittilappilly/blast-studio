#!/usr/bin/env node
import { existsSync } from "node:fs";

// A source checkout runs the TypeScript directly when this Node can strip types (22.18+, 23.6+), so a dist/ left
// over from `npm pack` never shadows newer source. Older Node (23.0-23.5 need a flag) and the npm package, which
// ships no src/, run the compiled dist/.
const source = new URL("../src/cli.ts", import.meta.url);
const useSource = existsSync(source) && Boolean(process.features.typescript);
const { main } = await import(useSource ? source.href : new URL("../dist/cli.js", import.meta.url).href);

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
