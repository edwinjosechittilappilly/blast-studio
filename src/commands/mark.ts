import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig, campaignDir } from '../config.ts';
import { parseCampaignRef } from '../campaigns.ts';
import { loadPack } from '../packs.ts';
import { loadPosts } from '../posts.ts';
import type { Command } from '../io.ts';
import { PLATFORM_IDS, UserError } from '../types.ts';
import type { PlatformId } from '../types.ts';

const hosts: Record<PlatformId, string[] | null> = {
  devto: ['dev.to'], hashnode: null, gist: ['gist.github.com'],
  'github-discussion': ['github.com'], linkedin: ['linkedin.com', 'lnkd.in'], x: ['x.com', 'twitter.com'],
  bluesky: ['bsky.app'], mastodon: null, threads: ['threads.net', 'threads.com'],
  reddit: ['reddit.com', 'redd.it'], hn: ['news.ycombinator.com'], producthunt: ['producthunt.com'],
  lemmy: null, medium: null, substack: null, newsletter: null,
  'youtube-shorts': ['youtube.com', 'youtu.be'], instagram: ['instagram.com'], tiktok: ['tiktok.com'], dailydev: ['app.daily.dev'],
};
const usage = 'usage: bstudio mark <project>/<campaign> <platform> --url <https URL>';
export const run: Command = async (args, io) => {
  const parsed = (() => {
    try { return parseArgs({ args, allowPositionals: true, options: { url: { type: 'string' }, help: { type: 'boolean', short: 'h' } } }); }
    catch { throw new UserError(usage); }
  })();
  if (parsed.values.help) { io.out(`${usage}\nExample: bstudio mark acme/launch instagram --url https://instagram.com/p/example`); return 0; }
  const [address, platformId] = parsed.positionals;
  if (parsed.positionals.length !== 2 || !parsed.values.url || !PLATFORM_IDS.includes(platformId as PlatformId)) throw new UserError(usage);
  const ref = parseCampaignRef(address), platform = platformId as PlatformId, pack = loadPack(platform), allowed = hosts[platform];
  const dir = campaignDir(loadConfig(io), ref);
  const post = loadPosts(dir).get(platform);
  if (!post) throw new UserError(`${platform}: post not found`);
  if (post.delivery !== 'manual' && pack.marketBlaster !== null) throw new UserError(`${platform}: mark is only available for manual destinations`);
  let url: URL;
  try { url = new URL(parsed.values.url); } catch { throw new UserError(`${platform}: invalid publication URL`); }
  if (url.protocol !== 'https:' || url.username || url.password || (allowed !== null && !allowed.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`)))) throw new UserError(`${platform}: invalid publication URL host`);
  const file = join(dir, 'published.json');
  let published: Record<string, unknown> = {};
  if (existsSync(file)) {
    try { published = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>; if (!published || typeof published !== 'object' || Array.isArray(published)) throw new Error(); }
    catch { throw new UserError('published.json is invalid'); }
  }
  published[platform] = { url: url.href, at: new Date().toISOString() };
  writeFileSync(file, JSON.stringify(published, null, 2) + '\n'); io.out(`${platform}: recorded ${url.href}`); return 0;
};
