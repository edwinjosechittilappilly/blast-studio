import { loadConfig } from '../config.ts';
import { parseArgs } from 'node:util';
import { loadLibrary } from '../library.ts';
import type { Command } from '../io.ts';
import { UserError } from '../types.ts';

const usage = 'usage: bstudio library [search <query>]';

export const run: Command = async (args, io) => {
  const parsed = (() => {
    try { return parseArgs({ args, allowPositionals: true, options: { help: { type: 'boolean', short: 'h' } } }); }
    catch { throw new UserError(usage); }
  })();
  if (parsed.values.help) { io.out(`${usage}\nExample: bstudio library search launch`); return 0; }
  if (parsed.positionals.length && (parsed.positionals.length !== 2 || parsed.positionals[0] !== 'search')) throw new UserError(usage);
  const projects = loadLibrary(loadConfig(io), parsed.positionals[1]);
  io.out('CAMPAIGN\tINPUTS\tPLATFORMS\tASSETS\tEXPORTED');
  for (const project of projects) io.out(`${project.slug}\t${project.inputs.join(', ')}\t${project.posts.map(p => p.platform).join(', ')}\t${project.assets.map(a => a.kind).join(', ')}\t${project.exported ? 'yes' : 'no'}`);
  return 0;
};
