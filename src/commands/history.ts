import { loadConfig, projectDir } from '../config.ts';
import { historyEntries, restore as restoreSnapshot } from '../history.ts';
import { UserError } from '../types.ts';
import type { Command } from '../io.ts';

export const run: Command = async (args, io) => {
  if (args.length !== 1) throw new UserError('usage: bstudio history <slug>');
  const entries = historyEntries(projectDir(loadConfig(io), args[0]));
  if (!entries.length) io.out('No snapshots');
  else for (const entry of entries) io.out(entry);
  return 0;
};

export const restore: Command = async (args, io) => {
  if (args.length !== 2 || !/^\d+$/.test(args[1])) throw new UserError('usage: bstudio restore <slug> <n>');
  restoreSnapshot(projectDir(loadConfig(io), args[0]), args[1]);
  io.out(`Restored snapshot ${args[1]}`);
  return 0;
};
