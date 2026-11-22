import { closeSync, existsSync, openSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig, campaignDir } from '../config.ts';
import { addFeedback, loadFeedback, removeFeedback } from '../feedback.ts';
import { UserError } from '../types.ts';
import type { Command } from '../io.ts';

export const run: Command = async (args, io) => {
  const usage = 'usage: bstudio feedback <project>/<campaign> list | add --note <text> [--asset <id> | --platform <id>] | rm <id>';
  let parsed;
  try { parsed = parseArgs({ args, allowPositionals: true, options: { note: { type: 'string' }, asset: { type: 'string' }, platform: { type: 'string' }, help: { type: 'boolean', short: 'h' } } }); }
  catch { throw new UserError(usage); }
  if (parsed.values.help) { io.out(`${usage}\nExample: bstudio feedback acme/launch add --note "Improve the headline" --platform bluesky`); return 0; }
  const [slug, action, ...rest] = parsed.positionals;
  const { note, asset, platform } = parsed.values;
  if (!slug || !action || (action !== 'add' && (note !== undefined || asset !== undefined || platform !== undefined))) throw new UserError(usage);
  const dir = campaignDir(loadConfig(io), slug);
  if (!existsSync(dir)) throw new UserError(`Campaign not found: ${slug}`);
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
  } else if (action === 'add' && !rest.length) {
    if (!note?.trim() || asset !== undefined && platform !== undefined) throw new UserError(usage);
    const entry = addFeedback(dir, { ...(asset !== undefined ? { asset } : {}), ...(platform !== undefined ? { platform } : {}) }, note);
    io.out(`Queued feedback ${entry.id}`);
  } else throw new UserError(usage);
  } finally {
    if (lock !== undefined) { closeSync(lock); unlinkSync(join(dir, '.revise.lock')); }
  }
  return 0;
};
