import { closeSync, openSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig, projectDir } from '../config.ts';
import { addFeedback, loadFeedback, removeFeedback } from '../feedback.ts';
import { UserError } from '../types.ts';
import type { Command } from '../io.ts';

export const run: Command = async (args, io) => {
  const [slug, action, ...rest] = args;
  const usage = 'usage: bstudio feedback <slug> list | add --note <text> [--asset <id> | --platform <id>] | rm <id>';
  if (!slug || !action) throw new UserError(usage);
  const dir = projectDir(loadConfig(io), slug);
  let lock: number | undefined;
  if (action === 'add' || action === 'rm') {
    try { lock = openSync(join(dir, '.revise.lock'), 'wx'); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new UserError(`Revision already in progress for ${slug}`);
      throw error;
    }
  }
  try {
  if (action === 'list' && !rest.length) {
    const entries = loadFeedback(dir);
    if (!entries.length) io.out('No feedback');
    for (const entry of entries) io.out(`${entry.id} ${entry.status} ${entry.target.asset ? `asset=${entry.target.asset} ` : ''}${entry.target.platform ? `platform=${entry.target.platform} ` : ''}${entry.note}${entry.rejectedReason ? ` (${entry.rejectedReason})` : ''}`);
  } else if (action === 'rm' && rest.length === 1) {
    removeFeedback(dir, rest[0]); io.out(`Removed feedback ${rest[0]}`);
  } else if (action === 'add') {
    let parsed;
    try { parsed = parseArgs({ args: rest, options: { note: { type: 'string' }, asset: { type: 'string' }, platform: { type: 'string' } }, strict: true }); }
    catch { throw new UserError(usage); }
    const { note, asset, platform } = parsed.values;
    if (!note?.trim() || asset !== undefined && platform !== undefined) throw new UserError(usage);
    const entry = addFeedback(dir, { ...(asset !== undefined ? { asset } : {}), ...(platform !== undefined ? { platform } : {}) }, note);
    io.out(`Queued feedback ${entry.id}`);
  } else throw new UserError(usage);
  } finally {
    if (lock !== undefined) { closeSync(lock); unlinkSync(join(dir, '.revise.lock')); }
  }
  return 0;
};
