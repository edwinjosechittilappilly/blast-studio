import { run as brief } from './brief.ts';
import { run as plan } from './plan.ts';
import { run as make } from './make.ts';
import { run as render } from './render.ts';
import { run as review } from './review.ts';
import { parseArgs } from 'node:util';
import { parseCampaignRef } from '../campaigns.ts';
import { UserError } from '../types.ts';
import type { Command } from '../io.ts';

export const run: Command = async (args, io) => {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    idea: { type: 'string' }, note: { type: 'string', multiple: true }, url: { type: 'string', multiple: true },
    pr: { type: 'string' }, commit: { type: 'string' }, repo: { type: 'string' },
    'mb-brief': { type: 'string' }, force: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
  } });
  if (values.help) { io.out("usage: bstudio new <project>/<campaign> [brief options]\nExample: bstudio new acme/launch --idea 'Launch'"); return 0; }
  if (positionals.length !== 1) throw new UserError('usage: bstudio new <project>/<campaign> <inputs>');
  const slug = positionals[0];
  parseCampaignRef(slug);
  for (const [name, command, commandArgs] of [['brief', brief, args], ['plan', plan, [slug]], ['make', make, [slug]], ['render', render, [slug]], ['review', review, [slug]]] as const) {
    try {
      const result = await command([...commandArgs], { ...io, step: name });
      if (result !== 0) { io.err(`Resume with: bstudio ${name} ${name === 'brief' ? args.map(a => JSON.stringify(a)).join(' ') : slug}`); return result; }
    } catch (error) {
      io.err(`Resume with: bstudio ${name} ${name === 'brief' ? args.map(a => JSON.stringify(a)).join(' ') : slug}`); throw error;
    }
  }
  return 0;
};
