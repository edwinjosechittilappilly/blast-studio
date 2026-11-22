import type { Command } from '../io.ts';
import { UserError } from '../types.ts';
import { check } from '../updater/check.ts';
import { propose, verify } from '../updater/propose.ts';

export const run: Command = async (args, io) => {
  const [action, ...rest] = args;
  if (action === 'check') {
    let only: string[] | undefined;
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '--write') continue;
      if (rest[i] === '--only' && rest[i + 1]) { only = rest[++i].split(',').filter(Boolean); continue; }
      throw new UserError('usage: bstudio sources check [--only id,...] [--write]');
    }
    return (await check(io, { only })).code;
  }
  if (action === 'propose') {
    if (rest.some(arg => arg !== '--branch') || rest.length > 1) throw new UserError('usage: bstudio sources propose [--branch]');
    await propose(io, { branch: rest.includes('--branch') }); return 0;
  }
  if (action === 'verify') { verify(rest); io.out(`Verified: ${rest.join(', ')}`); return 0; }
  throw new UserError('usage: bstudio sources check|propose|verify');
};
