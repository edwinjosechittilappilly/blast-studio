import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { strToU8, zipSync } from 'fflate';
import { stringify } from 'yaml';
import { parseBrief } from './brief.ts';
import { compositeSlug, type CampaignRef } from './campaigns.ts';
import { UserError } from './types.ts';
import type { PlatformPack, Post, Review } from './types.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const schema = JSON.parse(readFileSync(join(root, 'schemas/campaign.v2.json'), 'utf8')) as object;
const packageInfo: unknown = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
if (!packageInfo || typeof packageInfo !== 'object' || !('version' in packageInfo) || typeof packageInfo.version !== 'string') throw new Error('Invalid package version');
const version = packageInfo.version;
const ajv = new Ajv2020({ allErrors: true });
ajv.addFormat('date-time', { type: 'string', validate: (s: string) => Number.isFinite(Date.parse(s)) });
const validate = ajv.compile(schema);
type Prepared = { post: Post; review: Review; hash: string; pack: PlatformPack };
type ExtraMedia = Post['media'][number] & { cover?: boolean; lang?: string; captions?: string };

export function writeCampaignZip(project: string, identity: CampaignRef, prepared: Prepared[], sourceFile: (project: string, path: string) => string): string {
  const slug = compositeSlug(identity);
  const files: Record<string, Uint8Array> = {};
  let total = 0;
  const checkSize = (path: string, size: number) => {
    if (size > 500 * 1024 ** 2) throw new UserError(`Campaign zip entry ${path} exceeds Market Blaster's 500 MiB limit`);
    if (total - (files[path]?.length ?? 0) + size > 1024 ** 3) throw new UserError("Campaign zip exceeds Market Blaster's 1 GiB uncompressed limit");
  };
  const add = (path: string, data: Uint8Array) => {
    checkSize(path, data.length);
    total += data.length - (files[path]?.length ?? 0); files[path] = data;
  };
  const text = (path: string, content: string) => { add(path, strToU8(content)); };
  const file = (path: string, source: string) => { checkSize(path, statSync(source).size); add(path, readFileSync(source)); };
  const brief = readFileSync(join(project, 'brief.md'), 'utf8');
  const sections = parseBrief(brief);
  const sources = sections.map(section => ({ anchor: section.anchor, title: section.title, status: section.status ?? null, url: section.body.match(/^Source:\s*(https?:\/\/\S+)/m)?.[1] ?? null }));
  if (new Set(sections.map(s => s.anchor)).size !== sections.length) throw new UserError('Brief contains duplicate source anchors');
  text('brief.md', brief);
  text('sources/sources.json', JSON.stringify(sources, null, 2) + '\n');
  for (const section of sections) text(`sources/${section.anchor}.md`, section.body + '\n');
  const copyMedia = (path: string) => {
    const name = `media/${createHash('sha256').update(path).digest('hex').slice(0, 16)}/${basename(path)}`;
    file(name, sourceFile(project, path));
    return name;
  };
  const destinations = [], manual = [];
  for (const { post, review, hash, pack } of prepared) {
    const media = (post.media as ExtraMedia[]).map(m => ({ path: copyMedia(m.file), alt: m.alt, kind: m.kind,
      ...(m.cover === undefined ? {} : { cover: m.cover }), ...(m.lang === undefined ? {} : { lang: m.lang }), ...(m.captions === undefined ? {} : { captions: copyMedia(m.captions) }) }));
    const reviewFile = join(project, 'reviews', `${post.platform}.json`);
    file(`review/${post.platform}.json`, reviewFile);
    if (!pack.marketBlaster) {
      const folder = `handoff/${post.platform}/`;
      text(`${folder}post.md`, [post.title ? `# ${post.title}\n` : '', post.body, ...(post.thread ?? []).map(t => `\n---\n\n${t}`)].join('\n') + '\n');
      const guide = readFileSync(join(root, 'platforms', post.platform, 'guide.md'), 'utf8');
      const checklist = guide.match(/## Checklist\s*\n([\s\S]*?)(?=\n## |$)/)?.[1]?.trim() ?? '';
      const disclosures = Object.entries(post.disclosure ?? {}).map(([key, value]) => `- ${key}: ${value}`);
      const policy = Object.entries(pack.disclosure).map(([key, rule]) => `- ${key}: ${typeof rule === 'string' ? rule : rule.rule}`);
      text(`${folder}README.md`, [`# ${pack.name} manual handoff`, '', '- [ ] Open the platform publishing interface and select the correct account.', '- [ ] Copy post.md and attach the listed media.', '- [ ] Enter alt text, captions and disclosures; review and publish manually.', '', '## Media', ...media.map(m => `- ../../${m.path} (${m.kind}; alt: ${m.alt})${'captions' in m && m.captions ? `; captions: ../../${m.captions}` : ''}`), '', '## Disclosure', ...(disclosures.length ? disclosures : ['- None specified.']), '', '## Platform disclosure rules', ...policy, '', '## Platform notes', ...(pack.notes ?? []).map(n => `- ${n}`), '', '## Platform checklist', checklist, ''].join('\n'));
      manual.push({ platform: post.platform, folder, review: { verdict: review.verdict, total: review.total } });
      continue;
    }
    const id = pack.marketBlaster;
    const postPath = pack.ai === 'none' ? null : `posts/${id}.md`;
    const thread = post.thread?.length ? `handoff/${id}-thread.md` : null;
    if (thread) text(thread, post.thread!.map((item, index) => `## ${index + 2}\n\n${item}`).join('\n\n') + '\n');
    if (postPath) text(postPath, `---\n${stringify({ ...(post.title === undefined ? {} : { title: post.title }), ...(post.tags === undefined ? {} : { tags: post.tags }), evidence: post.evidence, ...(post.disclosure === undefined ? {} : { disclosure: post.disclosure }), media, studio: { reviewHash: hash, verdict: review.verdict } })}---\n\n${post.body.trim()}\n`);
    const mode = ['x', 'threads', 'hn', 'reddit', 'producthunt', 'lemmy', 'newsletter', 'medium', 'substack'].includes(id) || (id === 'linkedin' && media.some(m => m.kind === 'document' && m.path.toLowerCase().endsWith('.pdf'))) ? 'handoff' : 'api';
    destinations.push({ id, mode, aiPolicy: pack.ai, post: postPath, ...(post.tags === undefined ? {} : { tags: post.tags }), media, thread, review: { verdict: review.verdict, total: review.total, reviewHash: hash } });
  }
  const reviewPath = join(project, 'review.md');
  text('review/review.md', existsSync(reviewPath) ? readFileSync(reviewPath, 'utf8') : ['# Editorial review', '', ...prepared.map(({ post, review }) => `- ${post.platform}: ${review.verdict}${review.total === null ? '' : ` (${review.total}%)`}`), ''].join('\n'));
  const timestamps = prepared.map(({ review }) => review.at).filter(at => typeof at === 'string' && Number.isFinite(Date.parse(at))).sort();
  const manifest = { version: 2, kind: 'blast-studio-campaign', slug, project: identity.project, campaign: identity.campaign, title: brief.match(/^#\s+(.+)$/m)?.[1]?.trim() || slug,
    generatedAt: timestamps.length ? new Date(timestamps[timestamps.length - 1]).toISOString() : '1980-01-01T00:00:00.000Z', generator: { name: 'blast-studio', version }, canonicalHome: destinations.some(destination => destination.id === 'devto') ? 'devto' : null, sources, destinations, manual };
  if (!validate(manifest)) throw new UserError(`Invalid campaign manifest: ${ajv.errorsText(validate.errors)}`);
  text('campaign.json', JSON.stringify(manifest, null, 2) + '\n');
  if (Object.keys(files).length > 2000) throw new UserError("Campaign zip exceeds Market Blaster's 2000 entry limit");
  const sorted = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  const zip = zipSync(sorted, { level: 0, mtime: new Date(1980, 0, 1) });
  const dir = join(project, 'export'); mkdirSync(dir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  let history = join(dir, `${timestamp}-${slug}.campaign.zip`);
  for (let collision = 1; ; collision++) {
    try { writeFileSync(history, zip, { flag: 'wx' }); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      history = join(dir, `${timestamp}-${collision}-${slug}.campaign.zip`);
    }
  }
  const path = join(dir, `${slug}.campaign.zip`); writeFileSync(path, zip); return path;
}
