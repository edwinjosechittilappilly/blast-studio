#!/usr/bin/env node
import { existsSync } from "node:fs";

// npm packages need compiled JavaScript; source checkouts can run TypeScript directly.
const entry = new URL("../dist/cli.js", import.meta.url);
const { main } = await import(existsSync(entry) ? entry.href : new URL("../src/cli.ts", import.meta.url).href);

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
