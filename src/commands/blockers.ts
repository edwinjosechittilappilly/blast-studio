import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { listBlockers, resolveBlocker } from '../blockers.ts';
import { campaignDir, loadConfig } from '../config.ts';
import type { Command } from '../io.ts';
import { UserError } from '../types.ts';

const usage = 'usage: bstudio blockers <project>/<campaign> [list | resolve <post:platform|asset:id> <index> --reason <text>]';
export const run: Command = async (args, io) => {
  let parsed;
  try { parsed = parseArgs({ args, allowPositionals: true, options: { reason: { type: 'string' }, help: { type: 'boolean', short: 'h' } } }); }
  catch { throw new UserError(usage); }
  if (parsed.values.help) { io.out(usage); return 0; }
  const [address, action = 'list', target, index] = parsed.positionals;
  if (!address || (action === 'list' ? parsed.positionals.length > 2 || parsed.values.reason !== undefined : action !== 'resolve' || parsed.positionals.length !== 4 || !parsed.values.reason?.trim() || !/^(0|[1-9]\d*)$/.test(index ?? ''))) throw new UserError(usage);
  const dir = campaignDir(loadConfig(io), address);
  if (!existsSync(dir)) throw new UserError(`Campaign not found: ${address}`);
  if (action === 'list') {
    const blockers = listBlockers(dir);
    if (!blockers.length) io.out('No blockers');
    else for (const blocker of blockers) io.out(`${blocker.target} ${blocker.index}: ${blocker.text}`);
  } else {
    const resolved = resolveBlocker(dir, target, Number(index), parsed.values.reason!);
    io.out(`Resolved ${resolved.target} ${index}: ${resolved.text}`);
  }
  return 0;
};
