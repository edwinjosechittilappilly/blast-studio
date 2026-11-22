import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, projectDir } from '../config.ts';
import { loadPack } from '../packs.ts';
import { loadPosts } from '../posts.ts';
import type { Command } from '../io.ts';
import { PLATFORM_IDS, UserError } from '../types.ts';
import type { PlatformId } from '../types.ts';

const hosts: Partial<Record<PlatformId, string[]>> = {
  'youtube-shorts': ['youtube.com', 'youtu.be'], instagram: ['instagram.com'], tiktok: ['tiktok.com'], dailydev: ['app.daily.dev'],
};
export const run: Command = async (args, io) => {
  if (args.length !== 4 || args[2] !== '--url' || !PLATFORM_IDS.includes(args[1] as PlatformId)) throw new UserError('usage: bstudio mark <slug> <platform> --url <https URL>');
  const platform = args[1] as PlatformId, pack = loadPack(platform), allowed = hosts[platform];
  if (pack.marketBlaster !== null || !allowed) throw new UserError(`${platform}: mark is only available for manual destinations`);
  let url: URL;
  try { url = new URL(args[3]); } catch { throw new UserError(`${platform}: invalid publication URL`); }
  if (url.protocol !== 'https:' || url.username || url.password || !allowed.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) throw new UserError(`${platform}: invalid publication URL host`);
  const dir = projectDir(loadConfig(io), args[0]);
  if (!loadPosts(dir).has(platform)) throw new UserError(`${platform}: post not found`);
  const file = join(dir, 'published.json');
  let published: Record<string, unknown> = {};
  if (existsSync(file)) {
    try { published = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>; if (!published || typeof published !== 'object' || Array.isArray(published)) throw new Error(); }
    catch { throw new UserError('published.json is invalid'); }
  }
  published[platform] = { url: url.href, at: new Date().toISOString() };
  writeFileSync(file, JSON.stringify(published, null, 2) + '\n'); io.out(`${platform}: recorded ${url.href}`); return 0;
};
