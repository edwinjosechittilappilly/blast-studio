import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { IO } from "../src/io.ts";
import type { Env } from "../src/types.ts";

// Each test file runs in its own process; remove its temp studios when it exits.
const created: string[] = [];
process.on("exit", () => { for (const dir of created) rmSync(dir, { recursive: true, force: true }); });

export function tempStudio(files: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "bstudio-"));
  created.push(dir);
  const all = { "studio.yml": "brand:\n  name: Demo\n", ...files };
  for (const [path, content] of Object.entries(all)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

export interface FakeIO extends IO {
  stdout: string[];
  stderr: string[];
  text(): string;
}

export function fakeIO(opts: Partial<IO> & { cwd: string; env?: Env; answers?: string[] }): FakeIO {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const answers = [...(opts.answers ?? [])];
  return {
    env: {}, isTTY: false,
    fetch: (async () => { throw new Error("unexpected network call in test"); }) as typeof fetch,
    run: async (cmd) => { throw new Error(`unexpected subprocess ${cmd} in test`); },
    prompt: async () => answers.shift() ?? "",
    ...opts,
    out: (line) => stdout.push(line), err: (line) => stderr.push(line),
    stdout, stderr, text: () => [...stdout, ...stderr].join("\n"),
  };
}

export interface RecordedCall { url: string; method: string; headers: Record<string, string>; body: string }
export function mockFetch(handler: (call: RecordedCall) => [number, unknown] | Promise<[number, unknown]>):
  { fetch: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fn = async (input: string | URL | Request, init: RequestInit = {}) => {
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((value, key) => { headers[key] = value; });
    const call = { url: String(input), method: init.method ?? "GET", headers, body: String(init.body ?? "") };
    calls.push(call);
    const [status, json] = await handler(call);
    return new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } });
  };
  return { fetch: fn as typeof fetch, calls };
}
