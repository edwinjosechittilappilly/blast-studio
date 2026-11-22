import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { loadPacks } from './packs.ts';
import { loadPosts } from './posts.ts';
import { reviewHash } from './review-hash.ts';
import { UserError } from './types.ts';
import type { Post, Review } from './types.ts';

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

function handoff(project: string, post: Post, name: string, notes: string[], guide: string): void {
  const dir = join(project, 'exports', post.platform); mkdirSync(dir, { recursive: true });
  const media = post.media.map(item => ({ ...item, file: copyMedia(project, dir, item.file), ...((item as ExtraMedia).captions ? { captions: copyMedia(project, dir, (item as ExtraMedia).captions!) } : {}) }));
  writeFileSync(join(dir, 'post.md'), [post.title ? `# ${post.title}\n` : '', post.body, ...(post.thread ?? []).map(t => `\n---\n\n${t}`)].join('\n') + '\n');
  const checklist = guide.match(/## Checklist\s*\n([\s\S]*?)(?=\n## |$)/)?.[1]?.trim() ?? '';
  const disclosures = Object.entries(post.disclosure ?? {}).map(([key, value]) => `- ${key}: ${value}`);
  writeFileSync(join(dir, 'README.md'), [`# ${name} manual handoff`, '', '- [ ] Open the platform publishing interface and select the correct account.', '- [ ] Copy the text from post.md and attach the listed media.', '- [ ] Enter the provided alt text, captions and disclosure where applicable.', '- [ ] Review and publish manually, then record the URL with bstudio mark when supported.', '', '## Media', ...media.map(m => `- ${m.file} (${m.kind}; alt: ${m.alt})${'captions' in m && m.captions ? `; captions: ${m.captions}` : ''}`), '', '## Disclosure', ...(disclosures.length ? disclosures : ['- None specified.']), '', '## Platform notes', ...notes.map(n => `- ${n}`), '', '## Platform checklist', checklist, ''].join('\n'));
}

export function exportProject(project: string, slug: string): string {
  const posts = loadPosts(project), packs = loadPacks();
  if (!posts.size) throw new UserError('No posts to export');
  const prepared = [...posts.values()].map(post => {
    let review: Review;
    try { review = JSON.parse(readFileSync(join(project, 'reviews', `${post.platform}.json`), 'utf8')) as Review; }
    catch { throw new UserError(`${post.platform}: review missing or invalid; re-run review`); }
    if (!review || review.platform !== post.platform || !['pass', 'accepted'].includes(review.verdict) || !Array.isArray(review.gates) || !review.gates.length || review.gates.some(g => !g || g.pass !== true)) throw new UserError(`${post.platform}: review is not passing; re-run review`);
    const hash = reviewHash({ ...post, media: post.media.map(m => ({ path: m.file, alt: m.alt })) });
    if (hash !== review.postHash) throw new UserError(`${post.platform}: review is stale; re-run review`);
    const pack = packs.get(post.platform);
    if (!pack) throw new UserError(`${post.platform}: pack missing`);
    for (const m of post.media as ExtraMedia[]) {
      if ((m.cover !== undefined && typeof m.cover !== 'boolean') || (m.lang !== undefined && (typeof m.lang !== 'string' || !/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(m.lang))) || (m.captions !== undefined && (m.kind !== 'video' || typeof m.captions !== 'string' || !/\.vtt$/i.test(m.captions)))) throw new UserError(`${post.platform}: invalid media metadata`);
      sourceFile(project, m.file);
      if (m.captions) sourceFile(project, m.captions);
    }
    return { post, review, hash, pack };
  });
  const dir = join(project, 'export'); mkdirSync(dir, { recursive: true });
  const brief = readFileSync(join(project, 'brief.md'), 'utf8');
  const entries = prepared.flatMap(({ post, review, hash, pack }) => {
    const needsHandoff = !pack.marketBlaster || !!post.thread?.length || (post.platform === 'linkedin' && post.media.some(m => m.kind === 'document' && m.file.toLowerCase().endsWith('.pdf')));
    if (needsHandoff) handoff(project, post, pack.name, pack.notes ?? [], readFileSync(join(root, 'platforms', post.platform, 'guide.md'), 'utf8'));
    if (!pack.marketBlaster) return [];
    const media = (post.media as ExtraMedia[]).map(m => ({ path: copyMedia(project, dir, m.file), alt: m.alt, kind: m.kind,
      ...(m.cover === undefined ? {} : { cover: m.cover }), ...(m.lang === undefined ? {} : { lang: m.lang }), ...(m.captions === undefined ? {} : { captions: copyMedia(project, dir, m.captions) }) }));
    return [{ platform: post.platform, destination: pack.marketBlaster, ...(post.title === undefined ? {} : { title: post.title }), body: post.body, evidence: post.evidence,
      ...(post.disclosure === undefined ? {} : { disclosure: post.disclosure }), media, ...(post.thread === undefined ? {} : { thread: post.thread }), review: { verdict: review.verdict, total: review.total, reviewHash: hash } }];
  });
  const manifest = { version: 1, slug, generatedAt: new Date().toISOString(), brief: 'brief.md', posts: entries };
  if (!validate(manifest)) throw new UserError(`Invalid export manifest: ${ajv.errorsText(validate.errors)}`);
  writeFileSync(join(dir, 'brief.md'), brief); writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return dir;
}
