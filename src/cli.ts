import { execFile } from "node:child_process";
import { createInterface, type Interface } from "node:readline/promises";
import { run as init } from "./commands/init.ts";
import { run as doctor } from "./commands/doctor.ts";
import { run as installSkills } from "./commands/install-skills.ts";
import { run as renderPreview } from "./commands/render-preview.ts";
import { keychainGet } from "./keychain.ts";
import type { Command, IO } from "./io.ts";
import { UserError } from "./types.ts";

const COMMANDS: Record<string, { summary: string; run: Command }> = {
  init: { summary: "initialize the private studio and global configuration", run: init },
  doctor: { summary: "check tools, providers and budget", run: doctor },
  "install-skills": { summary: "link studio skills [--with-hyperframes]", run: installSkills },
  "render-preview": {
    summary: "render one html/svg/mmd/d2 file offline: render-preview <file> --size WxH --out <png>",
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
    const tail = stderr.trim().split("\n").slice(-20).join("\n");
    reject(new Error(`${cmd} ${reason}${tail ? `:\n${tail}` : ""}`));
  });
  if (opts.input !== undefined) child.stdin?.end(opts.input);
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
