import { execFile } from "node:child_process";
import { createInterface, type Interface } from "node:readline/promises";
import { run as accept, confirm } from "./commands/accept.ts";
import { run as auth } from "./commands/auth.ts";
import { run as brief } from "./commands/brief.ts";
import { run as budget } from "./commands/budget.ts";
import { run as dashboard } from "./commands/dashboard.ts";
import { run as doctor } from "./commands/doctor.ts";
import { run as exportProject } from "./commands/export.ts";
import { run as feedback } from "./commands/feedback.ts";
import { run as history, restore } from "./commands/history.ts";
import { run as init } from "./commands/init.ts";
import { run as installSkills } from "./commands/install-skills.ts";
import { run as library } from "./commands/library.ts";
import { run as mark } from "./commands/mark.ts";
import { run as make } from "./commands/make.ts";
import { run as newProject } from "./commands/new.ts";
import { run as plan } from "./commands/plan.ts";
import { run as render } from "./commands/render.ts";
import { run as renderPreview } from "./commands/render-preview.ts";
import { run as review } from "./commands/review.ts";
import { run as revise } from "./commands/revise.ts";
import { run as sources } from "./commands/sources.ts";
import { run as status } from "./commands/status.ts";
import { keychainGet } from "./keychain.ts";
import type { Command, IO } from "./io.ts";
import { UserError } from "./types.ts";

const COMMANDS: Record<string, { summary: string; run: Command }> = {
  init: { summary: "initialize the private studio and global configuration", run: init },
  doctor: { summary: "check tools, providers and budget", run: doctor },
  "install-skills": { summary: "link studio skills [--with-hyperframes]", run: installSkills },
  new: {
    summary: "brief + plan + make + render + review: new <slug> [--idea text] [--note text] [--url url] [--pr number] [--commit sha] [--repo owner/repo|local] [--mb-brief path] [--force]",
    run: newProject,
  },
  brief: { summary: "collect evidence: brief <slug> [--idea text] [--note text] [--url url] [--pr number] [--commit sha] [--repo owner/repo|local] [--mb-brief path] [--force]", run: brief },
  plan: { summary: "choose post types, angles and hooks per platform: plan <slug>", run: plan },
  make: { summary: "write posts and asset sources with the agent: make <slug>", run: make },
  render: { summary: "render images, carousels, logos, diagrams and video: render <slug> [--regen] [--assets=id,...] [--platforms=id,...]", run: render },
  review: { summary: "gates + platform reviewer scores: review [<slug>] [--calibrate] [--platforms=id,...] (slug required unless calibrating)", run: review },
  revise: { summary: "apply review findings or owner feedback: revise <slug> [--note text] [--asset id] [--platform id] [--feedback-only]", run: revise },
  feedback: { summary: "queue and manage feedback: feedback <slug> list|add|rm", run: feedback },
  history: { summary: "list snapshots: history <slug>", run: history },
  restore: { summary: "restore a snapshot: restore <slug> <n>", run: restore },
  accept: { summary: "human override of scores (never gates): accept <slug> <platform> --reason <reason>", run: accept },
  confirm: { summary: "record human asset rights checks: confirm <slug> <asset-id> [--trademark-checked] [--license <license>]", run: confirm },
  budget: { summary: "paid generation caps: budget [show | set <usd> | set-project <usd>]", run: budget },
  auth: { summary: "provider keys in the macOS Keychain: auth set <KEY> [--stdin] | auth list", run: auth },
  export: { summary: "hand passed posts to Market Blaster: export <slug> [--mb <project>] [--force] [--dir]", run: exportProject },
  mark: { summary: "record a manual post (Shorts, Reels, TikTok, daily.dev): mark <slug> <platform> --url U", run: mark },
  status: { summary: "projects, verdicts, spend and source health: status [<slug>] [--verbose]", run: status },
  library: { summary: "everything you have made: library [search <query>]", run: library },
  dashboard: { summary: "local web dashboard: dashboard [--port <port>]", run: dashboard },
  sources: { summary: "keep platform packs current: sources check [--only id,...] [--write] | propose [--branch] | verify <id>...", run: sources },
  "render-preview": {
    summary: "render one html/svg/mmd/d2 file offline: render-preview <file.html|.svg|.mmd|.d2> --size WxH --out <path>",
    run: renderPreview,
  },
};
export function help(): string {
  const width = Math.max(...Object.keys(COMMANDS).map((name) => name.length));
  return ["bstudio: create and review platform-ready content", "", "Usage: bstudio <command> [options]", "",
    ...Object.entries(COMMANDS).map(([name, command]) => `  ${name.padEnd(width)}  ${command.summary}`)].join("\n");
}
function runProgram(cmd: string, args: string[], opts: { cwd?: string; env?: Record<string, string | undefined>; input?: string; timeoutMs?: number } = {}): Promise<string> {
  const { promise, resolve, reject } = Promise.withResolvers<string>();
  const child = execFile(cmd, args, { cwd: opts.cwd, env: opts.env, timeout: opts.timeoutMs ?? 0, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
    if (!error) return resolve(stdout);
    const reason = error.killed && opts.timeoutMs ? `timed out after ${opts.timeoutMs / 1000}s` : `exited with ${error.code ?? error.signal}`;
    const tail = [stdout, stderr].filter(Boolean).join("\n").trim().split("\n").slice(-20).join("\n");
    reject(new Error(`${cmd} ${reason}${tail ? `:\n${tail}` : ""}`));
  });
  // Always close stdin: agent CLIs such as `omp -p` wait for EOF on a piped stdin before starting.
  child.stdin?.end(opts.input ?? "");
  return promise;
}
let readline: Interface | undefined;
export function realIO(): IO {
  return {
    cwd: process.cwd(), env: process.env,
    out: (line) => process.stdout.write(`${line}\n`), err: (line) => process.stderr.write(`${line}\n`),
    isTTY: Boolean(process.stdin.isTTY),
    async prompt(question) {
      readline ??= createInterface({ input: process.stdin, output: process.stdout });
      try { return await readline.question(`${question} `); }
      catch (err) { if ((err as Error).name === "AbortError") return ""; throw err; }
    },
    fetch: globalThis.fetch, run: runProgram,
    keychain: process.platform === "darwin" ? (key) => keychainGet(key) : undefined,
  };
}
export async function main(argv: string[], io: IO = realIO()): Promise<number> {
  const [name, ...rest] = argv;
  if (!name || name === "--help" || name === "-h" || name === "help") { io.out(help()); return name ? 0 : 1; }
  const command = COMMANDS[name];
  if (!command) { io.err(`unknown command "${name}"\n\n${help()}`); return 1; }
  try { return await command.run(rest, io); }
  catch (err) { if (err instanceof UserError) { io.err(`error: ${err.message}`); return 1; } throw err; }
  finally { readline?.close(); readline = undefined; }
}
