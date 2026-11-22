import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { parse, stringify } from 'yaml';
import { readBrief } from '../brief.ts';
import { loadPack } from '../packs.ts';
import { runGates } from '../review/gates.ts';
import { loadConfig, campaignDir } from '../config.ts';
import { parseCampaignRef } from '../campaigns.ts';
import { loadPosts } from '../posts.ts';
import type { Command } from '../io.ts';
import { PLATFORM_IDS, UserError, type AssetMeta, type PlatformId, type Review } from '../types.ts';
import { mediaContentHash, reviewHash } from '../review-hash.ts';

const acceptUsage = 'usage: bstudio accept <project>/<campaign> <platform> --reason <reason>';
const confirmUsage = 'usage: bstudio confirm <project>/<campaign> <asset-id> [--trademark-checked] [--license <license>]';

export const run: Command = async (args, io) => {
  const parsed = (() => {
    try { return parseArgs({ args, allowPositionals: true, options: { reason: { type: 'string' }, help: { type: 'boolean', short: 'h' } } }); }
    catch { throw new UserError(acceptUsage); }
  })();
  if (parsed.values.help) { io.out(`${acceptUsage}\nExample: bstudio accept acme/launch linkedin --reason "Reviewed"`); return 0; }
  const [address, platform] = parsed.positionals, reason = parsed.values.reason?.trim();
  if (parsed.positionals.length !== 2 || !reason || !PLATFORM_IDS.includes(platform as PlatformId)) throw new UserError(acceptUsage);
  const ref = parseCampaignRef(address), config = loadConfig(io), dir = campaignDir(config, ref), file = join(dir, 'reviews', `${platform}.json`);
  let review: Review;
  try { review = JSON.parse(readFileSync(file, 'utf8')) as Review; } catch { throw new UserError('Review not found or invalid'); }
  if (!Array.isArray(review.gates) || !review.gates.length || review.gates.some(g => !g.pass)) throw new UserError('Cannot accept a failed gate');
  const post = loadPosts(dir).get(platform as PlatformId);
  if (!post) throw new UserError('Post not found');
  const hash = reviewHash({ ...post, media: post.media.map(m => ({ path: m.file, alt: m.alt })) });
  if (hash !== review.postHash || review.mediaHash !== mediaContentHash(dir, post.media)) throw new UserError('Review is stale; run review again');
  const assetsDir = join(dir, 'assets');
  const assets: AssetMeta[] = existsSync(assetsDir) ? readdirSync(assetsDir).flatMap(id => {
    const path = join(assetsDir, id, 'asset.yml');
    return existsSync(path) ? [parse(readFileSync(path, 'utf8')) as AssetMeta] : [];
  }) : [];
  const currentGates = runGates(post, loadPack(post.platform), assets, readBrief(dir), config, dir, args[0]);
  if (currentGates.some(g => !g.pass)) throw new UserError('Cannot accept a failed gate; run review again');
  review.verdict = 'accepted'; review.acceptedReason = reason; review.at = new Date().toISOString();
  writeFileSync(file, JSON.stringify(review, null, 2) + '\n'); io.out(`${platform}: accepted`); return 0;
};

export const confirm: Command = async (args, io) => {
  const parsed = (() => {
    try { return parseArgs({ args, allowPositionals: true, options: { 'trademark-checked': { type: 'boolean' }, license: { type: 'string' }, help: { type: 'boolean', short: 'h' } } }); }
    catch { throw new UserError(confirmUsage); }
  })();
  if (parsed.values.help) { io.out(`${confirmUsage}\nExample: bstudio confirm acme/launch logo --license CC0 --trademark-checked`); return 0; }
  const [address, id] = parsed.positionals, trademark = parsed.values['trademark-checked'], license = parsed.values.license?.trim();
  if (parsed.positionals.length !== 2 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || (!trademark && parsed.values.license === undefined) || (parsed.values.license !== undefined && !license)) throw new UserError(confirmUsage);
  const ref = parseCampaignRef(address), file = join(campaignDir(loadConfig(io), ref), 'assets', id, 'asset.yml');
  if (!existsSync(file)) throw new UserError(`Asset not found: ${id}`);
  const asset = parse(readFileSync(file, 'utf8')) as AssetMeta;
  if (!asset || asset.id !== id) throw new UserError(`Invalid asset metadata: ${id}`);
  if (trademark) asset.trademarkChecked = true;
  if (license !== undefined) asset.license = license;
  writeFileSync(file, stringify(asset));
  io.out(`${id}: confirmation recorded`); return 0;
};
