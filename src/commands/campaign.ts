import { parseArgs } from "node:util";
import { loadConfig } from "../config.ts";
import type { Command } from "../io.ts";
import { renameCampaign } from "../rename.ts";
import { UserError } from "../types.ts";

const usage = "usage: bstudio campaign rename <project>/<campaign> <project>/<campaign>";
const help = `${usage}\nExample: bstudio campaign rename acme/launch acme/announcement`;

export const run: Command = async (args, io) => {
  const [action, ...rest] = args;
  if (action === "--help" || action === "-h" || action === "help") { io.out(help); return 0; }
  if (action !== "rename") throw new UserError(usage);
  const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { help: { type: "boolean", short: "h" } } });
  if (values.help) { io.out(help); return 0; }
  if (positionals.length !== 2) throw new UserError(usage);
  await renameCampaign(loadConfig(io), positionals[0], positionals[1]);
  io.out(`Renamed campaign ${positionals[0]} to ${positionals[1]}`);
  return 0;
};
