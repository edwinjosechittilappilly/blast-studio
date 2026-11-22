import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { readBrief } from './brief.ts';
import { loadPosts } from './posts.ts';
import { loadPacks, loadSources } from './packs.ts';
import { repoRoot } from './updater/check.ts';
import { loadFeedback } from './feedback.ts';
import { readPlan } from './plan.ts';
import type { AssetMeta, PlatformId, PlatformPack, Review, StudioConfig } from './types.ts';

const dirs = (path: string) => existsSync(path) ? readdirSync(path, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort() : [];
export function projectDetails(config: StudioConfig, slug: string) {
  const dir = join(config.root, 'projects', slug);
  const posts = [...loadPosts(dir).values()];
  const reviewsDir = join(dir, 'reviews');
  const reviews: Review[] = existsSync(reviewsDir) ? readdirSync(reviewsDir).filter(f => f.endsWith('.json')).sort().map(f => JSON.parse(readFileSync(join(reviewsDir, f), 'utf8')) as Review) : [];
  const assets: AssetMeta[] = dirs(join(dir, 'assets')).flatMap(id => {
    const file = join(dir, 'assets', id, 'asset.yml');
    return existsSync(file) ? [parse(readFileSync(file, 'utf8')) as AssetMeta] : [];
  });
  const brief = join(dir, 'brief.md');
  const marksFile = join(dir, 'published.json');
  return { slug, created: statSync(dir).birthtime.toISOString(), inputs: existsSync(brief) ? readBrief(dir).map(s => s.title) : [], posts, reviews, assets, exported: existsSync(join(dir, 'export', 'manifest.json')), published: existsSync(marksFile) ? JSON.parse(readFileSync(marksFile, 'utf8')) as unknown : [] };
}
let cachedPacks: Map<PlatformId, PlatformPack> | undefined;
export function projectReview(config: StudioConfig, slug: string) {
  const dir = join(config.root, 'projects', slug), project = projectDetails(config, slug);
  const plan = existsSync(join(dir, 'plan.yml')) ? readPlan(dir) : [];
  const packs = cachedPacks ??= loadPacks();
  const rubric = Object.fromEntries(project.posts.map(post => [post.platform, packs.get(post.platform)?.rubric ?? []]));
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
  return { ...project, plan, rubric, captions, threshold: config.review.threshold, feedback: loadFeedback(dir) };
}
export function loadLibrary(config: StudioConfig, query = '') {
  const needle = query.toLocaleLowerCase();
  return dirs(join(config.root, 'projects')).map(slug => projectDetails(config, slug)).filter(p => !needle || [p.slug, ...p.inputs, ...p.posts.flatMap(post => [post.title ?? '', post.body]), ...p.assets.map(a => a.kind)].some(s => s.toLocaleLowerCase().includes(needle)));
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
