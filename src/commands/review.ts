import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { loadConfig, projectDir } from '../config.ts';
import { readBrief } from '../brief.ts';
import { loadPack } from '../packs.ts';
import { readPlan } from '../plan.ts';
import { loadPosts } from '../posts.ts';
import type { Command, IO } from '../io.ts';
import { UserError, type AssetMeta, type Criterion, type Post, type ScoreResult, type StudioConfig } from '../types.ts';
import { runGates } from '../review/gates.ts';
import { runReviewer } from '../review/reviewer.ts';
import { totalScore, verdict } from '../review/score.ts';

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
    const fixtures = JSON.parse(readFileSync(join(dir, file), 'utf8')) as { post: Post; brief: string; expected: ScoreResult[]; rubric: Criterion[] }[];
    for (const fixture of fixtures) rows.push({ expected: fixture.expected, actual: await runReviewer({ config, io, post: fixture.post, brief: fixture.brief, rubric: fixture.rubric }) });
  }
  for (const [id, percent] of Object.entries(agreement(rows))) io.out(`${id}: ${percent.toFixed(1)}% exact agreement`);
}

export const run: Command = async (args, io) => {
  const config = loadConfig(io);
  if (args.length === 1 && args[0] === '--calibrate' || args.length === 2 && args[1] === '--calibrate') { await calibrate(config, io); return 0; }
  if (args.length !== 1) throw new UserError('usage: bstudio review <slug> [--calibrate]');
  const dir = projectDir(config, args[0]), posts = loadPosts(dir), brief = readBrief(dir), plan = readPlan(dir);
  if (!posts.size) throw new UserError('No posts to review');
  const assetsDir = join(dir, 'assets');
  const assets: AssetMeta[] = existsSync(assetsDir) ? readdirSync(assetsDir).flatMap(id => {
    const file = join(assetsDir, id, 'asset.yml'); return existsSync(file) ? [parse(readFileSync(file, 'utf8')) as AssetMeta] : [];
  }) : [];
  mkdirSync(join(dir, 'reviews'), { recursive: true });
  const summaries: string[] = ['# Editorial review', '', 'Scores are editorial judgments, not reach predictions.', ''];
  for (const post of posts.values()) {
    const pack = loadPack(post.platform), entry = plan.find(p => p.platform === post.platform);
    if (!entry) throw new UserError(`No plan for ${post.platform}`);
    const gates = runGates(post, pack, assets, brief, config);
    const rubric = pack.ai === 'outline' ? pack.outlineRubric ?? [] : pack.rubric;
    const visualFiles = post.media.map(m => m.file);
    for (const media of post.media.filter(m => m.kind === 'video')) {
      const frames = join('assets', media.asset, 'out', 'frames'), absolute = join(dir, frames);
      if (existsSync(absolute)) visualFiles.push(...readdirSync(absolute).filter(f => f.endsWith('.png')).map(f => join(frames, f)));
    }
    const scores = config.reviewer.command ? await runReviewer({ config, io, post, brief: JSON.stringify(brief), rubric, hooks: entry.hooks, projectDir: dir, visualFiles, evidence: { assets, gates, warnings: gates.warnings, visualFiles } }) : [];
    for (const criterion of rubric) if (criterion.appliesTo && !criterion.appliesTo.includes(entry.type)) {
      const score = scores.find(s => s.criterion === criterion.id); if (score) score.score = null;
    }
    const total = totalScore(scores, rubric, entry.type);
    const hashInput = `${post.title ?? ''}\n---\n${post.body.trim()}\n---\n${post.media.map(m => `${basename(m.file)}|${m.alt.trim()}`).join('\n')}`;
    const review = { platform: post.platform, postHash: createHash('sha256').update(hashInput).digest('hex'), gates: [...gates], warnings: gates.warnings, scores, total, verdict: verdict(gates, total, config.review.threshold), reviewer: config.reviewer.command?.join(' ') ?? 'deterministic', at: new Date().toISOString() };
    writeFileSync(join(dir, 'reviews', `${post.platform}.json`), JSON.stringify(review, null, 2) + '\n');
    summaries.push(`## ${post.platform}: ${review.verdict}${total === null ? '' : ` (${total.toFixed(1)}%)`}`, ...gates.filter(g => !g.pass).map(g => `- ${g.id}: ${g.message}`), ...gates.warnings.map(w => `- Warning: ${w}`), ...scores.map(s => `- ${s.criterion}: ${s.score ?? 'N/A'} — ${s.evidence}; ${s.fix}`), ...(!config.reviewer.command ? rubric.map(c => `- [ ] ${c.question}`) : []), '');
    io.out(`${post.platform}: ${review.verdict}${total === null ? '' : ` (${total.toFixed(1)}% editorial judgment)`}`);
    if (!config.reviewer.command) for (const criterion of rubric) io.out(`[ ] ${criterion.question}`);
  }
  writeFileSync(join(dir, 'review.md'), summaries.join('\n')); return 0;
};
