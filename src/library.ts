import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { readBrief } from './brief.ts';
import { loadPosts } from './posts.ts';
import { repoRoot } from './updater/check.ts';
import type { AssetMeta, Review, StudioConfig } from './types.ts';

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
export function loadLibrary(config: StudioConfig, query = '') {
  const needle = query.toLocaleLowerCase();
  return dirs(join(config.root, 'projects')).map(slug => projectDetails(config, slug)).filter(p => !needle || [p.slug, ...p.inputs, ...p.posts.flatMap(post => [post.title ?? '', post.body]), ...p.assets.map(a => a.kind)].some(s => s.toLocaleLowerCase().includes(needle)));
}
export function latestSources(config: StudioConfig) {
  const paths = [join(config.root, 'updates'), join(repoRoot, 'updates')];
  const files = paths.flatMap(dir => existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.md')).map(f => ({ name: f, path: join(dir, f) })) : []).sort((a, b) => b.name.localeCompare(a.name));
  if (!files.length) return { lastCheck: null, changed: [], failed: [], unverified: [], report: '' };
  const report = readFileSync(files[0].path, 'utf8');
  const rows = report.split(/\r?\n/);
  const find = (word: string) => rows.filter(line => new RegExp(`^## .*: ${word}\\s*$`, 'i').test(line));
  return { lastCheck: files[0].name.replace(/\.md$/, ''), changed: find('changed'), failed: find('failed'), unverified: [...find('manual'), ...find('new'), ...find('unverified')], report };
}
