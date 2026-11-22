import { parseArgs } from "node:util";
import { loadConfig, writeConfigField } from "../config.ts";
import type { Command } from "../io.ts";
import { UserError } from "../types.ts";
import { monthToDate, providerTotals } from "../budget/ledger.ts";

export const run: Command = async (args, io) => {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { help: { type: "boolean" } } });
  if (values.help) {
    io.out("Usage: bstudio budget [show | set <usd> | set-project <usd>]\n\nExamples:\n  bstudio budget show\n  bstudio budget set 100");
    return 0;
  }
  args = positionals;
  const config = loadConfig(io);
  if (args.length === 0 || (args.length === 1 && args[0] === "show")) {
    io.out(`Monthly cap: $${config.budget.monthlyUsd}`);
    io.out(`Per-project cap: ${config.budget.perProjectUsd === 0 ? "unlimited" : `$${config.budget.perProjectUsd}`}`);
    io.out(`Month to date (UTC): $${monthToDate(config.root).toFixed(4)}`);
    for (const [provider, usd] of Object.entries(providerTotals(config.root))) io.out(`${provider}: $${usd.toFixed(4)}`);
    return 0;
  }
  if (args.length !== 2 || !["set", "set-project"].includes(args[0]) || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(args[1])) throw new UserError("usage: bstudio budget [show | set <usd> | set-project <usd>]");
  const amount = Number(args[1]);
  if (!Number.isFinite(amount) || amount < 0) throw new UserError("Budget must be a non-negative number");
  writeConfigField(config, ["budget", args[0] === "set" ? "monthlyUsd" : "perProjectUsd"], amount);
  io.out(`Budget updated: $${amount}`);
  return 0;
};
