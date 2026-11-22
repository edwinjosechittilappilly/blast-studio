import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PostMedia } from './types.ts';
import { UserError } from './types.ts';

/** Market Blaster manifest v1 review hash; media order is significant. */
export function reviewHash(post: { title?: string; body: string; media: { path: string; alt: string }[] }): string {
  return createHash('sha256').update(`${post.title ?? ''}\n---\n${post.body.trim()}\n---\n${post.media.map(m => `${basename(m.path)}|${m.alt.trim()}`).join('\n')}`).digest('hex');
}

export function mediaContentHash(projectDir: string, media: PostMedia[]): string {
  const hash = createHash('sha256');
  for (const item of media) {
    try { hash.update(createHash('sha256').update(readFileSync(resolve(projectDir, item.file))).digest()); }
    catch { throw new UserError(`Invalid or missing project media: ${item.file}`); }
  }
  return hash.digest('hex');
}
