import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createInterface, type Interface } from "node:readline/promises";
import { run as accept, confirm } from "./commands/accept.ts";
import { run as auth } from "./commands/auth.ts";
import { briefOptions, run as brief } from "./commands/brief.ts";
import { run as blockers } from "./commands/blockers.ts";
import { run as budget } from "./commands/budget.ts";
import { run as campaign } from "./commands/campaign.ts";
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
import { run as project } from "./commands/project.ts";
import { run as render } from "./commands/render.ts";
import { run as renderPreview } from "./commands/render-preview.ts";
import { run as review } from "./commands/review.ts";
import { run as revise } from "./commands/revise.ts";
import { run as sources } from "./commands/sources.ts";
import { run as status } from "./commands/status.ts";
import { campaignDir, configFile, loadConfig } from "./config.ts";
import { migrateProjects } from "./migrate.ts";
import { recoverRenames } from "./rename.ts";
import { acquireCampaignLock, finishSpawnedJob, JobConflict, processGroupRunning, startCliJob, updateJobProcesses } from "./jobs/runner.ts";
import { campaignRef } from "./jobs/registry.ts";
import { keychainGet } from "./keychain.ts";
import type { Command, IO } from "./io.ts";
import { UserError } from "./types.ts";

const COMMANDS: Record<string, { summary: string; run: Command }> = {
  init: { summary: "initialize the private studio and global configuration", run: init },
  jobs: { summary: "inspect or cancel durable jobs: jobs [list|log <id>|cancel <id>]", run: jobs },
  project: { summary: "create, list or rename projects: project new|list|rename", run: project },
  campaign: { summary: "rename a campaign: campaign rename <project>/<campaign> <project>/<campaign>", run: campaign },
  doctor: { summary: "check tools, providers and budget", run: doctor },
  "install-skills": { summary: "link studio skills [--with-hyperframes]", run: installSkills },
  new: {
    summary: `brief + plan + make + render + review: new <project>/<campaign> ${briefOptions}`,
    run: newProject,
  },
  brief: { summary: `collect evidence: brief <project>/<campaign> ${briefOptions}`, run: brief },
  plan: { summary: "choose post types, angles and hooks: plan <project>/<campaign> [--platforms=id,...] [--assets=id,...]", run: plan },
  make: { summary: "write posts and assets: make <project>/<campaign> [--platforms=id,...] [--assets=id,...]", run: make },
  render: { summary: "render assets: render <project>/<campaign> [--regen] [--assets=id,...] [--platforms=id,...]", run: render },
  review: { summary: "gates + platform reviewer scores: review [<project>/<campaign>] [--calibrate] [--platforms=id,...]", run: review },
  revise: { summary: "apply findings or feedback: revise <project>/<campaign> [--note text] [--asset id] [--platform id] [--feedback-only]", run: revise },
  feedback: { summary: "queue and manage feedback: feedback <project>/<campaign> list|add|rm", run: feedback },
  blockers: { summary: "list or resolve blockers: blockers <project>/<campaign> [list|resolve <target> <index> --reason <text>]", run: blockers },
  history: { summary: "list snapshots: history <project>/<campaign>", run: history },
  restore: { summary: "restore a snapshot: restore <project>/<campaign> <n>", run: restore },
  accept: { summary: "human override of scores (never gates): accept <project>/<campaign> <platform> --reason <reason>", run: accept },
  confirm: { summary: "record asset rights checks: confirm <project>/<campaign> <asset-id> [--trademark-checked] [--license <license>]", run: confirm },
  budget: { summary: "paid generation caps: budget [show | set <usd> | set-project <usd>]", run: budget },
  auth: { summary: "provider keys in the macOS Keychain: auth set <KEY> [--stdin] | auth list", run: auth },
  export: { summary: "hand passed posts to Market Blaster: export <project>/<campaign> [--mb <project>] [--force] [--dir]", run: exportProject },
  mark: { summary: "record a manual post: mark <project>/<campaign> <platform> --url U", run: mark },
  status: { summary: "campaigns, verdicts, spend and source health: status [<project>/<campaign>] [--verbose]", run: status },
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
function runProgram(cmd: string, args: string[], opts: { cwd?: string; env?: Record<string, string | undefined>; input?: string; timeoutMs?: number; onOutput?: (line: string) => void; onStderr?: (text: string) => void } = {}): Promise<string> {
  const { promise, resolve, reject } = Promise.withResolvers<string>();
    const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env, detached: process.platform !== "win32", stdio: [opts.input === undefined ? "ignore" : "pipe", "pipe", "pipe"] });
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
    consume(child.stdout!, chunk => { stdout += chunk; });
    consume(child.stderr!, chunk => { stderr += chunk; });
    let forceTimer: NodeJS.Timeout | undefined;
    const timer = opts.timeoutMs ? setTimeout(() => { timedOut = true; if (child.pid) { signalGroup(child.pid, "SIGTERM"); forceTimer = setTimeout(() => signalGroup(child.pid!, "SIGKILL"), 1000); } }, opts.timeoutMs) : undefined;
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("close", (code, signal) => {
      if (child.pid && !interrupted) { subprocesses.delete(child.pid); recordProcesses?.([...subprocesses]); }
      if (timedOut && child.pid) signalGroup(child.pid, "SIGKILL");
      clearTimeout(timer); clearTimeout(forceTimer);
      if (code === 0) { if (stderr) opts.onStderr?.(stderr); resolve(stdout); return; }
      const reason = timedOut ? `timed out after ${opts.timeoutMs! / 1000}s` : `exited with ${code ?? signal}`;
      const tail = [stdout, stderr].filter(Boolean).join("\n").trim().split("\n").slice(-20).join("\n");
      reject(new Error(`${cmd} ${reason}${tail ? `:\n${tail}` : ""}`));
    });
    child.stdin?.end(opts.input);
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
  const locked = (["new", "brief", "plan", "make", "render", "review", "revise", "accept", "confirm", "export", "mark", "feedback", "restore"].includes(name) && !(name === "feedback" && args[1] === "list")) || (name === "blockers" && args.includes("resolve"));
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
    let done = false, code = 1, returned = false;
    const finish = () => { if (!done) { done = true; finishSpawnedJob(root, campaign, id, code, Boolean(interrupted), returned); } };
    abortJob = finish;
    try { code = await run(io); returned = true; return code; } finally { await stopping; subprocesses.clear(); recordProcesses = undefined; abortJob = undefined; finish(); }
  }
  const ref = campaignRef(refArg), config = loadConfig(io), root = config.root;
  campaignDir(config, ref);
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
const migratedRoots = new Map<string, Map<string, Error>>();
function targetedProjects(name: string, args: string[]): string[] {
  if (args.includes("--help") || args.includes("-h")) return [];
  if ((name === "project" || name === "campaign") && args[0] === "rename") return args.slice(1, 3).map(value => value.split("/")[0]);
  if (!["new", "brief", "plan", "make", "render", "review", "revise", "accept", "confirm", "export", "mark", "feedback", "blockers", "history", "restore", "status"].includes(name)) return [];
  const valued = ["--idea", "--note", "--url", "--pr", "--commit", "--repo", "--mb-brief", "--from", "--assets", "--platforms", "--asset", "--platform", "--reason", "--license", "--mb"];
  for (let i = 0; i < args.length; i++) {
    if (valued.includes(args[i])) { i++; continue; }
    if (!args[i].startsWith("-")) return [args[i].split("/")[0]];
  }
  return [];
}
export async function main(argv: string[], io: IO = realIO()): Promise<number> {
  const [name, ...rest] = argv;
  if (name === "--version" || name === "-v") {
    const metadata: unknown = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    if (!metadata || typeof metadata !== "object" || !("version" in metadata) || typeof metadata.version !== "string") throw new Error("Invalid package version");
    io.out(metadata.version); return 0;
  }
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
  try {
    if (existsSync(configFile(io))) {
      const config = loadConfig(io);
      let failures = migratedRoots.get(config.root);
      if (!failures) {
        failures = await recoverRenames(config, message => io.err(message));
        if (!failures.has("*")) for (const [project, error] of migrateProjects(config, message => io.err(message), new Set(failures.keys()))) if (!failures.has(project)) failures.set(project, error);
        migratedRoots.set(config.root, failures);
      }
      for (const project of targetedProjects(name, commandArgs)) {
        const failure = failures.get(project) ?? failures.get("*");
        if (failure) throw new UserError(`Migration or rename recovery incomplete for ${project}: ${failure.message}`);
      }
    }
    return await withCampaignLock(name, commandArgs, commandIO, currentIO => command.run(commandArgs, currentIO));
  } catch (err) {
    if (interrupted) return interrupted === "SIGINT" ? 130 : 143;
    if (err instanceof UserError || (err instanceof TypeError && "code" in err && typeof err.code === "string" && err.code.startsWith("ERR_PARSE_ARGS_"))) { io.err(`error: ${err.message}`); return 1; }
    throw err;
  } finally { if (managed) { process.off("SIGTERM", onTerm); process.off("SIGINT", onInt); process.off("SIGHUP", onHangup); interrupted = undefined; stopping = undefined; } readline?.close(); readline = undefined; }
}
