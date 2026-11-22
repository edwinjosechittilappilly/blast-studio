import { parseArgs } from 'node:util';
import { loadConfig, campaignDir } from '../config.ts';
import { historyEntries, restore as restoreSnapshot } from '../history.ts';
import { UserError } from '../types.ts';
import type { Command } from '../io.ts';

export const run: Command = async (args, io) => {
  const usage = 'usage: bstudio history <project>/<campaign>';
  let parsed;
  try { parsed = parseArgs({ args, allowPositionals: true, options: { help: { type: 'boolean', short: 'h' } } }); }
  catch { throw new UserError(usage); }
  if (parsed.values.help) { io.out(`${usage}\nExample: bstudio history acme/launch`); return 0; }
  if (parsed.positionals.length !== 1) throw new UserError(usage);
  const entries = historyEntries(campaignDir(loadConfig(io), parsed.positionals[0]));
  if (!entries.length) io.out('No snapshots');
  else for (const entry of entries) io.out(entry);
  return 0;
};

export const restore: Command = async (args, io) => {
  const usage = 'usage: bstudio restore <project>/<campaign> <n>';
  let parsed;
  try { parsed = parseArgs({ args, allowPositionals: true, options: { help: { type: 'boolean', short: 'h' } } }); }
  catch { throw new UserError(usage); }
  if (parsed.values.help) { io.out(`${usage}\nExample: bstudio restore acme/launch 1`); return 0; }
  const [address, number] = parsed.positionals;
  if (parsed.positionals.length !== 2 || !/^\d+$/.test(number)) throw new UserError(usage);
  restoreSnapshot(campaignDir(loadConfig(io), address), number);
  io.out(`Restored snapshot ${number}`);
  return 0;
};
