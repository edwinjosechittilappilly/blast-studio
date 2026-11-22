import { createHash } from 'node:crypto';
import { basename } from 'node:path';

/** Market Blaster manifest v1 review hash; media order is significant. */
export function reviewHash(post: { title?: string; body: string; media: { path: string; alt: string }[] }): string {
  return createHash('sha256').update(`${post.title ?? ''}\n---\n${post.body.trim()}\n---\n${post.media.map(m => `${basename(m.path)}|${m.alt.trim()}`).join('\n')}`).digest('hex');
}
