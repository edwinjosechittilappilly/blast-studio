import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { campaignDir } from './config.ts';
import { compositeSlug, parseCampaignRef, type CampaignRef } from './campaigns.ts';
import { readBrief } from './brief.ts';
import { loadPosts } from './posts.ts';
import { loadPacks, loadSources } from './packs.ts';
import { repoRoot } from './updater/check.ts';
import { loadFeedback } from './feedback.ts';
import { readPlan } from './plan.ts';
import type { AssetMeta, PlatformId, PlatformPack, Review, StudioConfig } from './types.ts';

const dirs = (path: string) => existsSync(path) ? readdirSync(path, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort() : [];
export function listExports(config: StudioConfig, ref: CampaignRef | string): { name: string; size: number; time: string; kind: 'zip' | 'directory' }[] {
  const identity = typeof ref === 'string' ? parseCampaignRef(ref) : ref;
  const dir = join(campaignDir(config, identity), 'export');
  if (!existsSync(dir)) return [];
  const sizeOf = (path: string): number => readdirSync(path, { withFileTypes: true }).reduce((sum, entry) =>
    sum + (entry.isFile() ? statSync(join(path, entry.name)).size : entry.isDirectory() ? sizeOf(join(path, entry.name)) : 0), 0);
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry): { name: string; size: number; time: string; kind: 'zip' | 'directory'; collision: number }[] => {
    const match = entry.isDirectory() && /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z(?:-(\d+))?$/.exec(entry.name);
    if (!match) return [];
    const time = `${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`;
    if (!Number.isFinite(Date.parse(time))) return [];
    const folder = join(dir, entry.name), zipName = `${compositeSlug(identity)}.campaign.zip`, zip = join(folder, zipName);
    if (existsSync(zip) && statSync(zip).isFile()) return [{ name: `${entry.name}/${zipName}`, size: statSync(zip).size, time, kind: 'zip' as const, collision: Number(match[6] ?? 0) }];
    if (existsSync(join(folder, 'manifest.json'))) return [{ name: `${entry.name}/`, size: sizeOf(folder), time, kind: 'directory' as const, collision: Number(match[6] ?? 0) }];
    return [];
  }).sort((a, b) => b.time.localeCompare(a.time) || b.collision - a.collision).map(({ collision: _collision, ...entry }) => entry);
}
function lastUpdated(path: string): number {
  try {
    const stat = lstatSync(path);
    if (!stat.isDirectory()) return stat.mtimeMs;
    return readdirSync(path, { withFileTypes: true }).reduce((latest, entry) => {
      if ((entry.name === 'logs' && entry.isDirectory()) || entry.name.endsWith('.lock') || entry.name.endsWith('.tmp')) return latest;
      return Math.max(latest, lastUpdated(join(path, entry.name)));
    }, stat.birthtimeMs);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw error;
  }
}
export function projectDetails(config: StudioConfig, slug: string) {
  const dir = campaignDir(config, slug);
  const posts = [...loadPosts(dir).values()];
  const reviewsDir = join(dir, 'reviews');
  const reviews: Review[] = existsSync(reviewsDir) ? readdirSync(reviewsDir).filter(f => f.endsWith('.json')).sort().map(f => JSON.parse(readFileSync(join(reviewsDir, f), 'utf8')) as Review) : [];
  const assets: AssetMeta[] = dirs(join(dir, 'assets')).flatMap(id => {
    const file = join(dir, 'assets', id, 'asset.yml');
    return existsSync(file) ? [parse(readFileSync(file, 'utf8')) as AssetMeta] : [];
  });
  const brief = join(dir, 'brief.md');
  const marksFile = join(dir, 'published.json');
  const updatedAt = new Date(lastUpdated(dir)).toISOString();
  const pendingFeedback = loadFeedback(dir).filter(entry => entry.status === 'pending').length;
  return { slug, created: statSync(dir).birthtime.toISOString(), updatedAt, pendingFeedback, inputs: existsSync(brief) ? readBrief(dir).map(s => s.title) : [], posts, reviews, assets, exported: existsSync(join(dir, 'export', 'manifest.json')) || existsSync(join(dir, 'export', `${compositeSlug(parseCampaignRef(slug))}.campaign.zip`)) || listExports(config, slug).length > 0, published: existsSync(marksFile) ? JSON.parse(readFileSync(marksFile, 'utf8')) as Record<string, unknown> : {} };
}
let cachedPacks: Map<PlatformId, PlatformPack> | undefined;
export function projectReview(config: StudioConfig, slug: string) {
  const dir = campaignDir(config, slug), project = projectDetails(config, slug);
  const plan = existsSync(join(dir, 'plan.yml')) ? readPlan(dir) : [];
  const packs = cachedPacks ??= loadPacks();
  const rubric = Object.fromEntries(project.posts.map(post => { const pack = packs.get(post.platform); return [post.platform, pack?.ai === 'outline' ? pack.outlineRubric ?? [] : pack?.rubric ?? []]; }));
  const platforms = Object.fromEntries(project.posts.flatMap(post => {
    const pack = packs.get(post.platform);
    return pack ? [[post.platform, { name: pack.name, textLimit: pack.textLimit, titleLimit: pack.titleLimit, threadItemLimit: pack.textLimit }]] : [];
  }));
  const captions: Record<string, string> = {};
  for (const asset of project.assets) {
    const vtt = asset.outputs?.find(output => /\.vtt$/i.test(output.file));
    if (!vtt) continue;
    const caption = `assets/${asset.id}/${vtt.file}`;
    for (const output of asset.outputs) if (/\.(mp4|webm)$/i.test(output.file)) captions[`assets/${asset.id}/${output.file}`] = caption;
    for (const post of project.posts) for (const media of post.media) if (media.asset === asset.id && media.kind === 'video') captions[media.file] = caption;
  }
  for (const post of project.posts) for (const media of post.media) {
    const caption = (media as typeof media & { captions?: string }).captions;
    if (caption) captions[media.file] = caption;
  }
  return { ...project, plan, rubric, platforms, captions, threshold: config.review.threshold, feedback: loadFeedback(dir) };
}
export function loadLibrary(config: StudioConfig, query = '') {
  const needle = query.toLocaleLowerCase();
  const root = join(config.root, 'projects');
  const validId = (id: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id);
  return dirs(root).filter(validId).filter(project => !existsSync(join(root, project, 'brief.md')) && !existsSync(join(root, project, '.bstudio-migration.json'))).flatMap(project => dirs(join(root, project, 'campaigns')).filter(validId).map(campaign => projectDetails(config, `${project}/${campaign}`))).filter(p => !needle || [p.slug, ...p.inputs, ...p.posts.flatMap(post => [post.title ?? '', post.body]), ...p.assets.map(a => a.kind)].some(s => s.toLocaleLowerCase().includes(needle)));
}
export function latestSources(config: StudioConfig) {
  const paths = [join(config.root, 'updates'), join(repoRoot, 'updates')];
  const files = paths.flatMap(dir => existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.md')).map(f => ({ name: f, path: join(dir, f) })) : []).sort((a, b) => b.name.localeCompare(a.name));
  const manual = new Set(loadSources().filter(source => source.detector.kind === 'manual').map(source => source.id));
  const unverified: string[] = [];
  function visit(value: unknown, path: string): void {
    if (!value || typeof value !== 'object') return;
    if (!Array.isArray(value) && 'source' in value && typeof value.source === 'string' && !manual.has(value.source) && !('verified' in value)) unverified.push(path);
    if (!Array.isArray(value) && 'aiSource' in value && typeof value.aiSource === 'string' && !manual.has(value.aiSource) && !('aiLastVerified' in value)) unverified.push(`${path}.ai`);
    for (const [key, child] of Object.entries(value)) visit(child, `${path}.${key}`);
  }
  for (const [id, pack] of loadPacks()) visit(pack, id);
  if (!files.length) return { lastCheck: null, changed: [], failed: [], unverified, report: '' };
  const report = readFileSync(files[0].path, 'utf8');
  const rows = report.split(/\r?\n/);
  const find = (word: string) => rows.filter(line => new RegExp(`^## .*: ${word}\\s*$`, 'i').test(line));
  return { lastCheck: files[0].name.replace(/\.md$/, ''), changed: find('changed'), failed: find('failed'), unverified, report };
}
