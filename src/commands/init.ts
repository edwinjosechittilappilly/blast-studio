import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { configFile, DEFAULT_CONFIG, loadConfig } from "../config.ts";
import type { Command } from "../io.ts";
import { UserError } from "../types.ts";

export const run: Command = async (args, io) => {
  if (args.length) throw new UserError("usage: bstudio init");
  const file = configFile(io);
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  try {
    writeFileSync(file, DEFAULT_CONFIG, { flag: "wx", mode: 0o600 });
    io.out(`Created ${file}`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    io.out(`Kept existing ${file}`);
  }
  const config = loadConfig(io);
  mkdirSync(config.root, { recursive: true, mode: 0o700 });
  mkdirSync(join(config.root, "projects"), { recursive: true, mode: 0o700 });
  io.out(`Studio root: ${config.root}`);
  return 0;
};
