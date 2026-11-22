import { loadConfig } from "../config.ts";
import { loadEnvWithSources } from "../env.ts";
import type { IO } from "../io.ts";
import { keychainSet, type KeychainRunner } from "../keychain.ts";
import { UserError } from "../types.ts";

type Options = {
  input?: (piped: boolean) => Promise<string>;
  runner?: KeychainRunner;
  platform?: NodeJS.Platform;
};

async function readSecret(piped: boolean): Promise<string> {
  if (piped) {
    if (process.stdin.isTTY) throw new UserError("--stdin requires piped input");
    let text = "";
    for await (const chunk of process.stdin) text += chunk;
    return text.replace(/\r?\n$/, "");
  }
  if (!process.stdin.isTTY) throw new UserError("Use --stdin to read a piped value");
  process.stdout.write("Value: ");
  const stdin = process.stdin;
  const previous = stdin.isRaw;
  stdin.setRawMode(true);
  stdin.resume();
  try {
    const { promise, resolve, reject } = Promise.withResolvers<string>();
    let value = "";
    const onData = (chunk: Buffer) => {
      for (const char of chunk.toString("utf8")) {
        if (char === "\u0003" || char === "\u0004") { cleanup(); reject(new UserError("Input cancelled")); return; }
        if (char === "\r" || char === "\n") { cleanup(); resolve(value); return; }
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else value += char;
      }
    };
    const cleanup = () => stdin.off("data", onData);
    stdin.on("data", onData);
    return await promise;
  } finally {
    stdin.setRawMode(previous);
    stdin.pause();
    process.stdout.write("\n");
  }
}

export async function run(args: string[], io: IO, options: Options = {}): Promise<number> {
  const [action, ...rest] = args;
  const config = loadConfig(io);
  const keys = ["GEMINI_API_KEY", "OPENAI_API_KEY"];
  if (action === "set") {
    const key = rest[0];
    if (!key || !keys.includes(key)) throw new UserError(`Unknown credential key; known: ${keys.join(", ")}`);
    if (rest.length > 2 || (rest[1] && rest[1] !== "--stdin")) throw new UserError("Usage: bstudio auth set <KEY> [--stdin]");
    if ((options.platform ?? process.platform) !== "darwin") throw new UserError("macOS Keychain is unavailable; use a studio .env file instead");
    const value = await (options.input ?? readSecret)(rest[1] === "--stdin");
    if (!value) throw new UserError("Credential cannot be empty");
    keychainSet(key, value, options.runner, options.platform);
    io.out(`Saved ${key} in Keychain`);
    return 0;
  }
  if (action !== "list" || rest.length) throw new UserError("Usage: bstudio auth set <KEY> [--stdin] | list");
  const { sources } = loadEnvWithSources(config.root, io.env, io.keychain, keys);
  for (const key of keys) io.out(`${key}: ${sources[key]}`);
  return 0;
}
