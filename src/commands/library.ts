import { loadConfig } from '../config.ts';
import { loadLibrary } from '../library.ts';
import type { Command } from '../io.ts';
import { UserError } from '../types.ts';

export const run: Command = async (args, io) => {
  if (args.length && (args.length !== 2 || args[0] !== 'search')) throw new UserError('usage: bstudio library [search <query>]');
  const projects = loadLibrary(loadConfig(io), args[1]);
  io.out('SLUG\tINPUTS\tPLATFORMS\tASSETS\tEXPORTED');
  for (const project of projects) io.out(`${project.slug}\t${project.inputs.join(', ')}\t${project.posts.map(p => p.platform).join(', ')}\t${project.assets.map(a => a.kind).join(', ')}\t${project.exported ? 'yes' : 'no'}`);
  return 0;
};
