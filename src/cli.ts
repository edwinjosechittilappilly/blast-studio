import { spawn } from "node:child_process";
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
import { run as jobs } from "./commands/jobs.ts";
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
import { loadConfig } from "./config.ts";
import { acquireCampaignLock, finishSpawnedJob, JobConflict, processGroupRunning, startCliJob, updateJobProcesses } from "./jobs/runner.ts";
import { campaignRef } from "./jobs/registry.ts";
import { keychainGet } from "./keychain.ts";
import type { Command, IO } from "./io.ts";
import { UserError } from "./types.ts";

const COMMANDS: Record<string, { summary: string; run: Command }> = {
  init: { summary: "initialize the private studio and global configuration", run: init },
  jobs: { summary: "inspect or cancel durable jobs: jobs [list|log <id>|cancel <id>]", run: jobs },
  doctor: { summary: "check tools, providers and budget", run: doctor },
  "install-skills": { summary: "link studio skills [--with-hyperframes]", run: installSkills },
  new: {
    summary: "brief + plan + make + render + review: new <slug> [--idea text] [--note text] [--url url] [--pr number] [--commit sha] [--repo owner/repo|local] [--mb-brief path] [--force]",
    run: newProject,
  },
  brief: { summary: "collect evidence: brief <slug> [--idea text] [--note text] [--url url] [--pr number] [--commit sha] [--repo owner/repo|local] [--mb-brief path] [--force]", run: brief },
  plan: { summary: "choose post types, angles and hooks: plan <slug> [--platforms=id,...] [--assets=id,...]", run: plan },
  make: { summary: "write posts and assets: make <slug> [--platforms=id,...] [--assets=id,...]", run: make },
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
const subprocesses = new Set<number>();
let recordProcesses: ((pids: number[]) => void) | undefined;
let interrupted: NodeJS.Signals | undefined;
let stopping: Promise<void> | undefined;
let abortJob: (() => void) | undefined;
function signalGroup(pid: number, signal: NodeJS.Signals): void {
  try { process.kill(process.platform === "win32" ? pid : -pid, signal); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
}
function stopSubprocesses(signal: NodeJS.Signals): Promise<void> {
  interrupted = signal;
  const groups = [...subprocesses];
  for (const pid of groups) signalGroup(pid, "SIGTERM");
  if (!groups.length) return Promise.resolve();
  const { promise, resolve } = Promise.withResolvers<void>(), start = Date.now();
  const timer = setInterval(() => {
    const alive = groups.filter(processGroupRunning);
    if (Date.now() - start >= 5000) for (const pid of alive) signalGroup(pid, "SIGKILL");
    if (!alive.length) { clearInterval(timer); resolve(); }
  }, 50);
  return promise;
}
function runProgram(cmd: string, args: string[], opts: { cwd?: string; env?: Record<string, string | undefined>; input?: string; timeoutMs?: number; onOutput?: (line: string) => void } = {}): Promise<string> {
  const { promise, resolve, reject } = Promise.withResolvers<string>();
    const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env, detached: process.platform !== "win32", stdio: ["pipe", "pipe", "pipe"] });
    if (child.pid) { subprocesses.add(child.pid); recordProcesses?.([...subprocesses]); }
    let stdout = "", stderr = "", timedOut = false;
    const consume = (stream: NodeJS.ReadableStream, output: (chunk: string) => void) => {
      let partial = "";
      stream.setEncoding("utf8");
      stream.on("data", (chunk: string) => {
        output(chunk);
        if (!opts.onOutput) return;
        const lines = (partial + chunk).split(/\r?\n/); partial = lines.pop() ?? "";
        for (const line of lines) opts.onOutput(line);
      });
      stream.on("end", () => { if (partial) opts.onOutput?.(partial); });
    };
    consume(child.stdout, chunk => { stdout += chunk; });
    consume(child.stderr, chunk => { stderr += chunk; });
    let forceTimer: NodeJS.Timeout | undefined;
    const timer = opts.timeoutMs ? setTimeout(() => { timedOut = true; if (child.pid) { signalGroup(child.pid, "SIGTERM"); forceTimer = setTimeout(() => signalGroup(child.pid!, "SIGKILL"), 1000); } }, opts.timeoutMs) : undefined;
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("close", (code, signal) => {
      if (child.pid && !interrupted) { subprocesses.delete(child.pid); recordProcesses?.([...subprocesses]); }
      if (timedOut && child.pid) signalGroup(child.pid, "SIGKILL");
      clearTimeout(timer); clearTimeout(forceTimer);
      if (code === 0) { resolve(stdout); return; }
      const reason = timedOut ? `timed out after ${opts.timeoutMs! / 1000}s` : `exited with ${code ?? signal}`;
      const tail = [stdout, stderr].filter(Boolean).join("\n").trim().split("\n").slice(-20).join("\n");
      reject(new Error(`${cmd} ${reason}${tail ? `:\n${tail}` : ""}`));
    });
    child.stdin.end(opts.input ?? "");
  return promise;
}
let readline: Interface | undefined;
export function realIO(): IO {
  return {
    cwd: process.cwd(), env: process.env,
    out: (line) => process.stdout.write(`${line}\n`), err: (line) => process.stderr.write(`${line}\n`),
    log: process.env.BSTUDIO_JOB_ID ? line => process.stderr.write(`${line}\n`) : undefined,
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
/** Serialize campaign mutations across CLI and dashboard processes. */
export async function withCampaignLock(name: string, args: string[], io: IO, run: (io: IO) => Promise<number>): Promise<number> {
  const locked = ["new", "brief", "plan", "make", "render", "review", "revise", "accept", "confirm", "export", "mark", "feedback", "restore"].includes(name) && !(name === "feedback" && args[1] === "list");
  const valued = ["--idea", "--note", "--url", "--pr", "--commit", "--repo", "--mb-brief", "--from", "--assets", "--platforms", "--asset", "--platform", "--reason", "--license", "--mb"];
  let refArg: string | undefined;
  if (locked && !args.includes("--help") && !args.includes("-h")) {
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (!arg.startsWith("-")) { refArg = arg; break; }
      if (valued.includes(arg)) i++;
    }
  }
  if (!refArg) {
    if (!io.env.BSTUDIO_JOB_ID) return run(io);
    const id = io.env.BSTUDIO_JOB_ID, root = loadConfig(io).root;
    const campaign = io.env.BSTUDIO_JOB_CAMPAIGN;
    recordProcesses = pids => updateJobProcesses(root, campaign, id, pids);
    let done = false, code = 1;
    const finish = () => { if (!done) { done = true; finishSpawnedJob(root, campaign, id, code, Boolean(interrupted)); } };
    abortJob = finish;
    try { code = await run(io); return code; } finally { await stopping; subprocesses.clear(); recordProcesses = undefined; abortJob = undefined; finish(); }
  }
  const ref = campaignRef(refArg), root = loadConfig(io).root;
  try {
    if (io.env.BSTUDIO_JOB_ID) {
      const release = acquireCampaignLock(root, ref, io.env.BSTUDIO_JOB_ID);
      const id = io.env.BSTUDIO_JOB_ID;
      recordProcesses = pids => updateJobProcesses(root, ref, id, pids);
      let code = 1, done = false;
      const finish = () => { if (!done) { done = true; try { finishSpawnedJob(root, ref, id, code, Boolean(interrupted)); } finally { release(); } } };
      abortJob = finish;
      try { code = await run(io); return code; } finally { await stopping; subprocesses.clear(); recordProcesses = undefined; abortJob = undefined; finish(); }
    }
    const job = startCliJob(root, ref, name);
    recordProcesses = pids => updateJobProcesses(root, ref, job.id, pids);
    const logged = { ...io, log: job.log, out: (line: string) => { job.log(line); io.out(line); }, err: (line: string) => { job.log(line); io.err(line); } };
    let code = 1, done = false;
    const finish = () => { if (!done) { done = true; job.finish(code, Boolean(interrupted)); } };
    abortJob = finish;
    try { code = await run(logged); return code; } finally { await stopping; subprocesses.clear(); recordProcesses = undefined; abortJob = undefined; finish(); }
  } catch (error) { if (error instanceof JobConflict) throw new UserError(error.message); throw error; }
}
export async function main(argv: string[], io: IO = realIO()): Promise<number> {
  const [name, ...rest] = argv;
  if (!name || name === "--help" || name === "-h" || name === "help") { io.out(help()); return name ? 0 : 1; }
  const command = COMMANDS[name];
  if (!command) { io.err(`unknown command "${name}"\n\n${help()}`); return 1; }
  const quiet = rest.includes("--quiet"), commandArgs = rest.filter(arg => arg !== "--quiet"), commandIO = { ...io, step: name, quiet };
  const managed = io.env === process.env;
  const onSignal = (signal: NodeJS.Signals) => {
    const code = signal === "SIGINT" ? 130 : signal === "SIGHUP" ? 129 : 143;
    if (interrupted) { for (const pid of subprocesses) signalGroup(pid, "SIGKILL"); abortJob?.(); process.exit(code); }
    stopping = stopSubprocesses(signal);
    void stopping.then(() => { abortJob?.(); process.exit(code); });
  };
  const onTerm = () => onSignal("SIGTERM"), onInt = () => onSignal("SIGINT"), onHangup = () => onSignal("SIGHUP");
  if (managed) { process.on("SIGTERM", onTerm); process.on("SIGINT", onInt); process.on("SIGHUP", onHangup); }
  try { return await withCampaignLock(name, commandArgs, commandIO, currentIO => command.run(commandArgs, currentIO)); }
  catch (err) { if (interrupted) return interrupted === "SIGINT" ? 130 : 143; if (err instanceof UserError) { io.err(`error: ${err.message}`); return 1; } throw err; }
  finally { if (managed) { process.off("SIGTERM", onTerm); process.off("SIGINT", onInt); process.off("SIGHUP", onHangup); interrupted = undefined; stopping = undefined; } readline?.close(); readline = undefined; }
}
