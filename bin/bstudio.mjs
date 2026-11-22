#!/usr/bin/env node
import { existsSync } from "node:fs";

// A source checkout runs the TypeScript directly, so a dist/ left over from `npm pack` can never shadow newer
// source. The npm package ships no src/, so installs run the compiled dist/.
const source = new URL("../src/cli.ts", import.meta.url);
const { main } = await import(existsSync(source) ? source.href : new URL("../dist/cli.js", import.meta.url).href);

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
