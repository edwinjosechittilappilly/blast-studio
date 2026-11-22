import { parseArgs } from 'node:util';
import type { Command } from '../io.ts';
import { UserError } from '../types.ts';
import { check } from '../updater/check.ts';
import { propose, verify } from '../updater/propose.ts';

export const run: Command = async (args, io) => {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    help: { type: 'boolean' }, only: { type: 'string' }, write: { type: 'boolean' }, branch: { type: 'boolean' },
  } });
  if (values.help) {
    io.out('Usage: bstudio sources check [--only id,...] [--write] | propose [--branch] | verify <id...>\n\nExamples:\n  bstudio sources check --only example --write\n  bstudio sources propose --branch\n  bstudio sources verify example');
    return 0;
  }
  const [action, ...rest] = positionals;
  if (action === 'check') {
    if (rest.length || values.branch || values.only === '') throw new UserError('usage: bstudio sources check [--only id,...] [--write]');
    return (await check(io, { only: values.only?.split(',').filter(Boolean), write: values.write ?? false, date: io.env.BSTUDIO_SOURCE_DATE })).code;
  }
  if (action === 'propose') {
    if (rest.length || values.only !== undefined || values.write) throw new UserError('usage: bstudio sources propose [--branch]');
    await propose(io, { branch: values.branch ?? false }); return 0;
  }
  if (action === 'verify' && values.only === undefined && !values.write && !values.branch) { verify(rest); io.out(`Verified: ${rest.join(', ')}`); return 0; }
  throw new UserError('usage: bstudio sources check|propose|verify');
};
