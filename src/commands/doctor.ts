import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

import { loadConfig } from "../config.ts";
import { loadEnv } from "../env.ts";
import type { Command } from "../io.ts";
import { UserError } from "../types.ts";

export const run: Command = async (args, io) => {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { help: { type: "boolean", short: "h" } } });
  if (values.help) { io.out("Usage: bstudio doctor\n\nExample:\n  bstudio doctor"); return 0; }
  if (positionals.length) throw new UserError("usage: bstudio doctor");
  const config = loadConfig(io);
  let failed = false;
  const major = Number(process.versions.node.split(".")[0]);
  io.out(`Node: ${process.version}${major < 22 ? " (requires Node >=22.18; install from https://nodejs.org/)" : ""}`);
  const [nodeMajor, nodeMinor] = process.versions.node.split(".").map(Number);
  if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 18)) failed = true;
  async function check(name: string, cmd: string, argv: string[], install: string, required = false): Promise<string | undefined> {
    try {
      const result = await io.run(cmd, argv, { cwd: fileURLToPath(new URL("../..", import.meta.url)), timeoutMs: 15000 });
      io.out(`${name}: ${result.trim().split(/\r?\n/)[0] || "available"}`);
      return result;
    } catch {
      io.out(`${name}: missing${required ? " (required)" : " (optional)"}; ${install}`);
      if (required) failed = true;
      return undefined;
    }
  }
  await check("FFmpeg", "ffmpeg", ["-version"], "install: brew install ffmpeg (or your OS package manager)");
  await check("Playwright Chromium", process.execPath,
    ["--input-type=module", "-e", "import { chromium } from 'playwright'; const b = await chromium.launch({headless:true}); await b.close(); console.log('available')"],
    "install: npx playwright install chromium", true);
  await check("HyperFrames", "npx", ["--no-install", "hyperframes", "--version"], "install: npm install (HyperFrames is an optional dependency)");
  await check("VHS", "vhs", ["--version"], "install: brew install vhs");
  await check("Mermaid (mmdc)", "npx", ["--no-install", "mmdc", "--version"], "install: npm install (Mermaid is an optional dependency)", true);
  await check("D2", "d2", ["--version"], "install: brew install d2");
  await check("Market Blaster", config.marketBlaster.command[0], [...config.marketBlaster.command.slice(1), "--help"],
    "install: gh repo clone edwinjosechittilappilly/market-blaster && cd market-blaster && npm install && npm link");
  const env = loadEnv(config.root, io.env, io.keychain);
  const keyNeeded: Record<string, boolean> = {
    GEMINI_API_KEY: config.images.provider === "gemini",
    OPENAI_API_KEY: config.images.provider === "openai" || config.voice.provider === "openai",
  };
  for (const [key, required] of Object.entries(keyNeeded)) {
    // Only report keys for providers you selected; unused providers need no key.
    if (!required) continue;
    io.out(`${key}: ${env[key] ? "present" : "not set (required); run: bstudio auth set " + key + " or add it to the studio .env"}`);
    if (!env[key]) failed = true;
  }
  const omp = await check("omp generate_image.enabled", "omp", ["config", "get", "generate_image.enabled"],
    "install: https://github.com/can1357/oh-my-pi; enable generate_image.enabled in omp config", config.images.provider === "omp");
  if (config.images.provider === "omp" && omp !== undefined && !/^(true|enabled)$/i.test(omp.trim())) {
    io.out("omp generate_image is disabled; enable generate_image.enabled in omp config");
    failed = true;
  }
  const projectCap = config.budget.perProjectUsd === 0 ? "no per-project cap" : `$${config.budget.perProjectUsd}/project`;
  const paidOff = config.budget.monthlyUsd === 0 ? " (paid calls disabled until you run: bstudio budget set <usd>)" : "";
  io.out(`Budget: $${config.budget.monthlyUsd}/month, ${projectCap}${paidOff}`);
  return failed ? 1 : 0;
};
