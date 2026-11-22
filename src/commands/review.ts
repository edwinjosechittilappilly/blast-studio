import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parse } from 'yaml';
import { loadConfig, campaignDir } from '../config.ts';
import { readBrief } from '../brief.ts';
import { loadPack } from '../packs.ts';
import { readPlan } from '../plan.ts';
import { loadPosts } from '../posts.ts';
import type { Command, IO } from '../io.ts';
import { UserError, type AssetMeta, type Criterion, type Post, type ScoreResult, type StudioConfig } from '../types.ts';
import { runGates } from '../review/gates.ts';
import { runReviewer } from '../review/reviewer.ts';
import { totalScore, verdict } from '../review/score.ts';
import { mediaContentHash, reviewHash } from '../review-hash.ts';

export function agreement(rows: { expected: ScoreResult[]; actual: ScoreResult[] }[]): Record<string, number> {
  const counts: Record<string, { total: number; match: number }> = {};
  for (const row of rows) for (const expected of row.expected) {
    const count = counts[expected.criterion] ??= { total: 0, match: 0 };
    count.total++; if (row.actual.find(s => s.criterion === expected.criterion)?.score === expected.score) count.match++;
  }
  return Object.fromEntries(Object.entries(counts).map(([id, c]) => [id, 100 * c.match / c.total]));
}

async function calibrate(config: StudioConfig, io: IO): Promise<void> {
  const dir = fileURLToPath(new URL('../../test/fixtures/reviews/', import.meta.url));
  const rows: { expected: ScoreResult[]; actual: ScoreResult[] }[] = [];
  for (const file of readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
    const fixtures = JSON.parse(readFileSync(join(dir, file), 'utf8')) as { post: Post; brief: string; expected: ScoreResult[]; rubric: Criterion[]; hooks?: string[] }[];
    for (const fixture of fixtures) rows.push({ expected: fixture.expected, actual: await runReviewer({ config, io, post: fixture.post, brief: fixture.brief, rubric: fixture.rubric, hooks: fixture.hooks }) });
  }
  for (const [id, percent] of Object.entries(agreement(rows))) io.out(`${id}: ${percent.toFixed(1)}% exact agreement`);
}

export const run: Command = async (args, io) => {
  const usage = 'usage: bstudio review <project>/<campaign> [--platforms ids] | bstudio review --calibrate';
  let parsed;
  try { parsed = parseArgs({ args, allowPositionals: true, options: { platforms: { type: 'string' }, calibrate: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } } }); }
  catch { throw new UserError(usage); }
  if (parsed.values.help) { io.out(`${usage}\nExample: bstudio review acme/launch --platforms bluesky`); return 0; }
  const { positionals } = parsed;
  if (parsed.values.calibrate) {
    if (positionals.length > 1 || parsed.values.platforms !== undefined) throw new UserError(usage);
    if (positionals.length) campaignDir(loadConfig(io), positionals[0]);
    await calibrate(loadConfig(io), io); return 0;
  }
  if (positionals.length !== 1 || positionals[0].startsWith('-')) throw new UserError(usage);
  const selected = parsed.values.platforms === undefined ? undefined : new Set(parsed.values.platforms.split(',').filter(Boolean));
  const config = loadConfig(io), dir = campaignDir(config, positionals[0]), posts = loadPosts(dir), brief = readBrief(dir), plan = readPlan(dir);
  for (const id of selected ?? []) if (![...posts.keys()].some(platform => platform === id)) throw new UserError(`Unknown platform: ${id}. Valid platforms: ${[...posts.keys()].join(', ') || '(none)'}`);
  if (!posts.size) throw new UserError('No posts to review');
  const assetsDir = join(dir, 'assets');
  const assets: AssetMeta[] = existsSync(assetsDir) ? readdirSync(assetsDir).flatMap(id => {
    const file = join(assetsDir, id, 'asset.yml'); return existsSync(file) ? [parse(readFileSync(file, 'utf8')) as AssetMeta] : [];
  }) : [];
  mkdirSync(join(dir, 'reviews'), { recursive: true });
  const summaries: string[] = ['# Editorial review', '', 'Scores are editorial judgments, not reach predictions.', ''];
  if (selected && existsSync(join(dir, 'review.md'))) {
    const previous = readFileSync(join(dir, 'review.md'), 'utf8');
    for (const section of previous.split(/(?=^## )/m).slice(1)) {
      const platform = section.match(/^## ([^:]+):/)?.[1];
      if (platform && !selected.has(platform)) summaries.push(section.trimEnd(), '');
    }
  }
  for (const post of posts.values()) {
    if (selected && !selected.has(post.platform)) continue;
    const pack = loadPack(post.platform), entry = plan.find(p => p.platform === post.platform);
    if (!entry) throw new UserError(`No plan for ${post.platform}`);
    const gates = runGates(post, pack, assets, brief, config, dir, positionals[0]);
    const postHash = reviewHash({ ...post, media: post.media.map(m => ({ path: m.file, alt: m.alt })) });
    let mediaHash: string | undefined;
    try { mediaHash = mediaContentHash(dir, post.media); }
    catch (error) {
      if (!(error instanceof UserError)) throw error;
      const specs = gates.find(g => g.id === 'specs')!;
      specs.pass = false; specs.message = `${specs.message === 'Passed' ? '' : `${specs.message}; `}${error.message}`;
    }
    const rubric = pack.ai === 'outline' ? pack.outlineRubric ?? [] : pack.rubric;
    const visualFiles = post.media.map(m => m.file);
    for (const media of post.media.filter(m => m.kind === 'video')) {
      const frames = join('assets', media.asset, 'out', 'frames'), absolute = join(dir, frames);
      if (existsSync(absolute)) visualFiles.push(...readdirSync(absolute).filter(f => f.endsWith('.png')).map(f => join(frames, f)));
    }
    const scores: ScoreResult[] & { hookComparisons?: { preferred: string | null; evidence: string }[] } = mediaHash && config.reviewer.command ? await runReviewer({ config, io, post, brief: JSON.stringify(brief), rubric, hooks: entry.hooks, projectDir: dir, visualFiles, evidence: { assets, gates, warnings: gates.warnings, visualFiles } }) : [];
    for (const criterion of rubric) if (criterion.appliesTo && !criterion.appliesTo.includes(entry.type)) {
      const score = scores.find(s => s.criterion === criterion.id); if (score) score.score = null;
    }
    const total = totalScore(scores, rubric, entry.type);
    const reviewFile = join(dir, 'reviews', `${post.platform}.json`);
    let prior: { postHash?: string; mediaHash?: string; gates?: typeof gates; verdict?: string; acceptedReason?: string } | undefined;
    try { prior = JSON.parse(readFileSync(reviewFile, 'utf8')); } catch { /* no previous review */ }
    const preserve = prior?.verdict === 'accepted' && prior.postHash === postHash && prior.mediaHash === mediaHash && JSON.stringify(prior.gates) === JSON.stringify([...gates]);
    const review = { platform: post.platform, postHash, mediaHash, gates: [...gates], warnings: gates.warnings, scores, ...(scores.hookComparisons ? { hookComparisons: scores.hookComparisons } : {}), total, verdict: preserve ? 'accepted' : verdict(gates, total, config.review.threshold), ...(preserve ? { acceptedReason: prior?.acceptedReason } : {}), reviewer: config.reviewer.command?.join(' ') ?? 'deterministic', at: new Date().toISOString() };
    writeFileSync(join(dir, 'reviews', `${post.platform}.json`), JSON.stringify(review, null, 2) + '\n');
    summaries.push(`## ${post.platform}: ${review.verdict}${total === null ? '' : ` (${total.toFixed(1)}%)`}`, ...gates.filter(g => !g.pass).map(g => `- ${g.id}: ${g.message}`), ...gates.warnings.map(w => `- Warning: ${w}`), ...scores.map(s => `- ${s.criterion}: ${s.score ?? 'N/A'} — ${s.evidence}; ${s.fix}`), ...(!config.reviewer.command ? rubric.map(c => `- [ ] ${c.question}`) : []), '');
    for (const comparison of scores.hookComparisons ?? []) summaries.push(`- Hook preference: ${comparison.preferred ?? 'N/A'} — ${comparison.evidence}`);
    io.out(`${post.platform}: ${review.verdict}${total === null ? '' : ` (${total.toFixed(1)}% editorial judgment)`}`);
    if (review.verdict !== 'pass' && review.verdict !== 'accepted') {
      for (const gate of gates.filter(g => !g.pass)) io.out(`  ${gate.id}: ${gate.message}`);
      for (const score of scores.filter(s => s.score !== null && s.score < 2 && s.fix?.trim()).sort((a, b) => (a.score ?? 2) - (b.score ?? 2)).slice(0, 3)) io.out(`  fix ${score.criterion}: ${score.fix}`);
      io.out(`  review: ${join(dir, 'review.md')}`);
    }
    if (!config.reviewer.command) for (const criterion of rubric) io.out(`[ ] ${criterion.question}`);
  }
  writeFileSync(join(dir, 'review.md'), summaries.join('\n')); return 0;
};
