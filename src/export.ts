import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { parse } from 'yaml';
import { readBrief } from './brief.ts';
import { compositeSlug, type CampaignRef } from './campaigns.ts';
import { runGates } from './review/gates.ts';
import { reserveExportHistory, writeCampaignZip } from './campaign-zip.ts';
import { loadPacks } from './packs.ts';
import { loadPosts } from './posts.ts';
import { mediaContentHash, resolutionMakesReviewStale, reviewHash } from './review-hash.ts';
import { readResolutions } from './blockers.ts';
import { UserError } from './types.ts';
import type { AssetMeta, Post, Review, StudioConfig } from './types.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const schema = JSON.parse(readFileSync(join(root, 'schemas/manifest.v1.json'), 'utf8')) as object;
const ajv = new Ajv2020({ allErrors: true });
ajv.addFormat('date-time', { type: 'string', validate: (s: string) => Number.isFinite(Date.parse(s)) });
const validate = ajv.compile(schema);

type ExtraMedia = Post['media'][number] & { cover?: boolean; lang?: string; captions?: string };

function sourceFile(project: string, path: string): string {
  if (!path || isAbsolute(path)) throw new UserError(`Invalid project media path: ${path}`);
  try {
    const base = realpathSync(project), file = realpathSync(resolve(base, path)), rel = relative(base, file);
    if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel) || !statSync(file).isFile()) throw new Error();
    return file;
  } catch { throw new UserError(`Invalid or missing project media: ${path}`); }
}

function copyMedia(project: string, target: string, path: string): string {
  const source = sourceFile(project, path);
  const name = join('media', createHash('sha256').update(path).digest('hex').slice(0, 16), basename(path));
  const dest = join(target, name); mkdirSync(dirname(dest), { recursive: true }); copyFileSync(source, dest);
  return name.split(sep).join('/');
}

function handoff(project: string, post: Post, name: string, notes: string[], guide: string, manual: boolean): void {
  const dir = join(project, 'exports', post.platform); mkdirSync(dir, { recursive: true });
  const media = post.media.map(item => ({ ...item, file: copyMedia(project, dir, item.file), ...((item as ExtraMedia).captions ? { captions: copyMedia(project, dir, (item as ExtraMedia).captions!) } : {}) }));
  writeFileSync(join(dir, 'post.md'), [post.title ? `# ${post.title}\n` : '', post.body, ...(post.thread ?? []).map(t => `\n---\n\n${t}`)].join('\n') + '\n');
  const checklist = guide.match(/## Checklist\s*\n([\s\S]*?)(?=\n## |$)/)?.[1]?.trim() ?? '';
  const disclosures = Object.entries(post.disclosure ?? {}).map(([key, value]) => `- ${key}: ${value}`);
  writeFileSync(join(dir, 'README.md'), [`# ${name} ${manual ? 'manual handoff' : 'handoff'}`, '', ...(manual ? ['- [ ] Open the platform publishing interface and select the correct account.', '- [ ] Copy the text from post.md and attach the listed media.', '- [ ] Enter the provided alt text, captions and disclosure where applicable.', '- [ ] Review and publish manually.', '- [ ] Record the live URL: `bstudio mark <address> <platform> --url <url>` (or Mark published in the dashboard).'] : ['- [ ] Publish using Market Blaster, using this handoff for any content requiring manual steps.']), '', '## Media', ...media.map(m => `- ${m.file} (${m.kind}${(m as ExtraMedia).cover ? ', video cover' : ''}; alt: ${m.alt})${'captions' in m && m.captions ? `; captions: ${m.captions}` : ''}`), '', '## Disclosure', ...(disclosures.length ? disclosures : ['- None specified.']), '', '## Platform notes', ...notes.map(n => `- ${n}`), '', '## Platform checklist', checklist, ''].join('\n'));
}

export function exportProject(project: string, identity: CampaignRef, config: StudioConfig, directory = false): { path: string; history: string } {
  const slug = compositeSlug(identity);
  const posts = loadPosts(project), packs = loadPacks(), briefSections = readBrief(project);
  const assetsDir = join(project, 'assets');
  const assets: AssetMeta[] = existsSync(assetsDir) ? readdirSync(assetsDir).flatMap(id => {
    const file = join(assetsDir, id, 'asset.yml');
    return existsSync(file) ? [parse(readFileSync(file, 'utf8')) as AssetMeta] : [];
  }) : [];
  if (!posts.size) throw new UserError('No posts to export');
  const resolutions = readResolutions(project);
  const prepared = [...posts.values()].map(post => {
    let review: Review;
    try { review = JSON.parse(readFileSync(join(project, 'reviews', `${post.platform}.json`), 'utf8')) as Review; }
    catch { throw new UserError(`${post.platform}: review missing or invalid; re-run review`); }
    const requiredGates = ['policy', 'disclosure', 'specs', 'accessibility', 'fabricated-metrics', 'rights'];
    if (!review || review.platform !== post.platform || !['pass', 'accepted'].includes(review.verdict) || !Array.isArray(review.gates) || review.gates.some(g => !g || g.pass !== true) || requiredGates.some(id => !review.gates.some(g => g.id === id))) throw new UserError(`${post.platform}: review is not passing; re-run review`);
    const hash = reviewHash({ ...post, media: post.media.map(m => ({ path: m.file, alt: m.alt })) });
    if (hash !== review.postHash) throw new UserError(`${post.platform}: review is stale; re-run review`);
    if (resolutionMakesReviewStale(post, review, assets, resolutions)) throw new UserError(`${post.platform}: review is stale; re-run review`);
    if (review.mediaHash !== mediaContentHash(project, post.media)) throw new UserError(`${post.platform}: review media is stale; re-run review`);
    const pack = packs.get(post.platform);
    if (!pack) throw new UserError(`${post.platform}: pack missing`);
    if (runGates(post, pack, assets, briefSections, config, project, `${identity.project}/${identity.campaign}`).some(g => !g.pass)) throw new UserError(`${post.platform}: current gates failed; re-run review`);
    for (const m of post.media as ExtraMedia[]) {
      if ((m.cover !== undefined && typeof m.cover !== 'boolean') || (m.lang !== undefined && (typeof m.lang !== 'string' || !/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(m.lang))) || (m.captions !== undefined && (m.kind !== 'video' || typeof m.captions !== 'string' || !/\.vtt$/i.test(m.captions)))) throw new UserError(`${post.platform}: invalid media metadata`);
      sourceFile(project, m.file);
      if (m.captions) sourceFile(project, m.captions);
    }
    return { post, review, hash, pack };
  });
  if (!directory) return writeCampaignZip(project, identity, prepared, sourceFile);
  const dir = join(project, 'export'); mkdirSync(dir, { recursive: true });
  const brief = readFileSync(join(project, 'brief.md'), 'utf8');
  const entries = prepared.flatMap(({ post, review, hash, pack }) => {
    const manual = post.delivery === 'manual' || !pack.marketBlaster;
    const needsHandoff = manual || !!post.thread?.length || (post.platform === 'linkedin' && post.media.some(m => m.kind === 'document' && m.file.toLowerCase().endsWith('.pdf')));
    if (needsHandoff) handoff(project, post, pack.name, pack.notes ?? [], readFileSync(join(root, 'platforms', post.platform, 'guide.md'), 'utf8'), manual);
    if (manual) return [];
    const media = (post.media as ExtraMedia[]).map(m => ({ path: copyMedia(project, dir, m.file), alt: m.alt, kind: m.kind,
      ...(m.cover === undefined ? {} : { cover: m.cover }), ...(m.lang === undefined ? {} : { lang: m.lang }), ...(m.captions === undefined ? {} : { captions: copyMedia(project, dir, m.captions) }) }));
    return [{ platform: post.platform, destination: pack.marketBlaster, ...(post.title === undefined ? {} : { title: post.title }), ...(post.tags === undefined ? {} : { tags: post.tags }), body: post.body, evidence: post.evidence,
      ...(post.disclosure === undefined ? {} : { disclosure: post.disclosure }), media, ...(post.thread === undefined ? {} : { thread: post.thread }), review: { verdict: review.verdict, total: review.total, reviewHash: hash } }];
  });
  const manifest = { version: 1, slug, project: identity.project, campaign: identity.campaign, generatedAt: new Date().toISOString(), brief: 'brief.md', posts: entries };
  if (!validate(manifest)) throw new UserError(`Invalid export manifest: ${ajv.errorsText(validate.errors)}`);
  writeFileSync(join(dir, 'brief.md'), brief); writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const history = reserveExportHistory(dir);
  try {
    copyFileSync(join(dir, 'brief.md'), join(history, 'brief.md'));
    if (existsSync(join(dir, 'media'))) cpSync(join(dir, 'media'), join(history, 'media'), { recursive: true });
    if (existsSync(join(project, 'exports'))) cpSync(join(project, 'exports'), join(history, 'handoff'), { recursive: true });
    copyFileSync(join(dir, 'manifest.json'), join(history, 'manifest.json'));
  } catch (error) {
    rmSync(history, { recursive: true, force: true });
    throw error;
  }
  return { path: dir, history };
}
