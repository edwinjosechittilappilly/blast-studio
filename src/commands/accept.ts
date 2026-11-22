import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { readBrief } from '../brief.ts';
import { loadPack } from '../packs.ts';
import { runGates } from '../review/gates.ts';
import { loadConfig, projectDir } from '../config.ts';
import { loadPosts } from '../posts.ts';
import type { Command } from '../io.ts';
import { PLATFORM_IDS, UserError, type AssetMeta, type PlatformId, type Review } from '../types.ts';
import { mediaContentHash, reviewHash } from '../review-hash.ts';

export const run: Command = async (args, io) => {
  if (args.length !== 4 || args[2] !== '--reason' || !args[3].trim() || !PLATFORM_IDS.includes(args[1] as PlatformId)) throw new UserError('usage: bstudio accept <slug> <platform> --reason <reason>');
  const config = loadConfig(io), dir = projectDir(config, args[0]), file = join(dir, 'reviews', `${args[1]}.json`);
  let review: Review;
  try { review = JSON.parse(readFileSync(file, 'utf8')) as Review; } catch { throw new UserError('Review not found or invalid'); }
  if (!Array.isArray(review.gates) || !review.gates.length || review.gates.some(g => !g.pass)) throw new UserError('Cannot accept a failed gate');
  const post = loadPosts(dir).get(args[1] as PlatformId);
  if (!post) throw new UserError('Post not found');
  const hash = reviewHash({ ...post, media: post.media.map(m => ({ path: m.file, alt: m.alt })) });
  if (hash !== review.postHash || review.mediaHash !== mediaContentHash(dir, post.media)) throw new UserError('Review is stale; run review again');
  const assetsDir = join(dir, 'assets');
  const assets: AssetMeta[] = existsSync(assetsDir) ? readdirSync(assetsDir).flatMap(id => {
    const path = join(assetsDir, id, 'asset.yml');
    return existsSync(path) ? [parse(readFileSync(path, 'utf8')) as AssetMeta] : [];
  }) : [];
  const currentGates = runGates(post, loadPack(post.platform), assets, readBrief(dir), config, dir);
  if (currentGates.some(g => !g.pass)) throw new UserError('Cannot accept a failed gate; run review again');
  review.verdict = 'accepted'; review.acceptedReason = args[3].trim(); review.at = new Date().toISOString();
  writeFileSync(file, JSON.stringify(review, null, 2) + '\n'); io.out(`${args[1]}: accepted`); return 0;
};

export const confirm: Command = async (args, io) => {
  if (args.length < 3 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(args[1])) throw new UserError('usage: bstudio confirm <slug> <asset-id> [--trademark-checked] [--license <license>]');
  const trademark = args.includes('--trademark-checked'), index = args.indexOf('--license');
  if ((!trademark && index < 0) || (index >= 0 && (!args[index + 1]?.trim() || args[index + 1].startsWith('--'))) || args.length !== 2 + Number(trademark) + (index >= 0 ? 2 : 0)) throw new UserError('usage: bstudio confirm <slug> <asset-id> [--trademark-checked] [--license <license>]');
  const file = join(projectDir(loadConfig(io), args[0]), 'assets', args[1], 'asset.yml');
  if (!existsSync(file)) throw new UserError(`Asset not found: ${args[1]}`);
  const asset = parse(readFileSync(file, 'utf8')) as AssetMeta;
  if (!asset || asset.id !== args[1]) throw new UserError(`Invalid asset metadata: ${args[1]}`);
  if (trademark) asset.trademarkChecked = true;
  if (index >= 0) asset.license = args[index + 1].trim();
  writeFileSync(file, stringify(asset));
  io.out(`${args[1]}: confirmation recorded`); return 0;
};
