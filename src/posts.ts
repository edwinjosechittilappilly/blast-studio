import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parse, stringify } from 'yaml';
import { PLATFORM_IDS, UserError } from './types.ts';
import type { PlatformId, Post } from './types.ts';

export function parsePost(path: string, text: string): Post {
  const match = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)([\s\S]*)$/);
  if (!match) throw new UserError(`${path}: expected YAML frontmatter`);
  let data: Record<string, unknown>;
  try { data = parse(match[1]); } catch { throw new UserError(`${path}: invalid frontmatter`); }
  const platform = data?.platform ?? basename(path, '.md');
  if (!PLATFORM_IDS.includes(platform as PlatformId) || !Array.isArray(data.evidence) || !data.evidence.every(v => typeof v === 'string') || !Array.isArray(data.media) || !data.media.every(v => v && typeof v === 'object' && typeof v.asset === 'string' && typeof v.file === 'string' && typeof v.alt === 'string' && ['image', 'video', 'document', 'gif'].includes(v.kind)) || (data.thread !== undefined && (!Array.isArray(data.thread) || !data.thread.every(v => typeof v === 'string'))) || (data.title !== undefined && typeof data.title !== 'string') || (data.disclosure !== undefined && (!data.disclosure || typeof data.disclosure !== 'object' || Array.isArray(data.disclosure)))) throw new UserError(`${path}: invalid post frontmatter`);
  return { ...data, platform, body: match[2].trim(), path } as Post;
}
export function loadPosts(projectDir: string): Map<PlatformId, Post> {
  const dir = join(projectDir, 'posts'), posts = new Map<PlatformId, Post>();
  if (!existsSync(dir)) return posts;
  for (const file of readdirSync(dir).filter(f => f.endsWith('.md')).sort()) {
    const path = join(dir, file), post = parsePost(path, readFileSync(path, 'utf8'));
    if (file !== `${post.platform}.md` || posts.has(post.platform)) throw new UserError(`${path}: platform does not match filename`);
    posts.set(post.platform, post);
  }
  return posts;
}
export function serializePost(post: Post): string {
  const { path: _path, body, ...frontmatter } = post;
  return `---\n${stringify(frontmatter)}---\n\n${body.trim()}\n`;
}
