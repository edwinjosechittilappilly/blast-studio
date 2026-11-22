import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadConfig } from '../src/config.ts';
import { runGates } from '../src/review/gates.ts';
import { totalScore, verdict } from '../src/review/score.ts';
import { runReviewer } from '../src/review/reviewer.ts';
import { agreement } from '../src/commands/review.ts';
import { run as accept } from '../src/commands/accept.ts';
import { fakeIO, tempStudio } from './helpers.ts';
import type { AssetMeta, PlatformPack, Post, ScoreResult } from '../src/types.ts';

const io = fakeIO({ cwd: tempStudio(), env: { BSTUDIO_CONFIG: 'studio.yml' } });
const config = loadConfig(io);
const post: Post = { platform: 'x', path: 'x.md', body: 'A clear update.', media: [], evidence: ['E1'] };
const pack: PlatformPack = { id: 'x', name: 'X', ai: 'draft', formats: ['text'], marketBlaster: 'x', media: [], disclosure: { text: 'recommended', media: 'recommended', voice: 'recommended' }, rubric: [], sources: ['x-source'] };
const image: AssetMeta = { id: 'a', kind: 'illustration', provider: 'openai', outputs: [{ file: 'image.png', width: 1080, bytes: 4 }], license: 'licensed', aiGenerated: true };
const brief = [{ anchor: 'E1', title: 'Evidence', body: 'A clear update.' }];
const gate = (id: string, p = post, pk = pack, assets: AssetMeta[] = []) => runGates(p, pk, assets, brief, config).find(g => g.id === id)!;
test('policy, disclosure, specs, accessibility, grounding and rights gates', () => {
  for (const id of ['policy', 'disclosure', 'specs', 'accessibility', 'fabricated-metrics', 'rights']) assert.equal(gate(id).pass, true);
  assert.equal(gate('policy', post, { ...pack, ai: 'none' }).pass, false);
  assert.equal(gate('policy', post, { ...pack, ai: 'outline' }).pass, false);
  assert.equal(gate('policy', { ...post, body: '- One\n- Two' }, { ...pack, ai: 'outline' }).pass, true);
  assert.equal(gate('disclosure', post, { ...pack, disclosure: { ...pack.disclosure, text: { rule: 'Disclose', source: 's' } } }).pass, false);
  assert.equal(gate('specs', post, { ...pack, textLimit: { value: 2, source: 's' } }).pass, false);
  assert.match(runGates(post, { ...pack, textLimit: 'unknown' }, [], brief, config).warnings.join(' '), /x-source/);
  const mediaPost: Post = { ...post, media: [{ asset: 'a', file: 'image.png', alt: '', kind: 'image' }] };
  assert.equal(gate('accessibility', mediaPost, pack, [image]).pass, false);
  assert.equal(gate('rights', mediaPost, pack, [{ ...image, license: null }]).unfixable, true);
  assert.equal(gate('fabricated-metrics', { ...post, body: 'We grew 42%.' }).pass, false);
  assert.equal(gate('fabricated-metrics', { ...post, body: 'We grew 42%.' }, pack, []).pass, false);
});
test('weighted scoring excludes N/A and verdict observes gates', () => {
  const scores: ScoreResult[] = [{ criterion: 'a', score: 2, evidence: 'e', fix: 'f' }, { criterion: 'b', score: null, evidence: 'e', fix: 'f' }];
  assert.equal(totalScore(scores, [{ id: 'a', question: 'a' }, { id: 'b', question: 'b' }], 'text'), 100);
  assert.equal(verdict([], 75, 75), 'pass'); assert.equal(verdict([], 74, 75), 'revise');
  assert.equal(verdict([{ id: 'rights', pass: false, message: '', unfixable: true }], 100, 75), 'blocked');
});
test('reviewer retries invalid JSON once', async () => {
  let calls = 0; const runner = fakeIO({ cwd: io.cwd, run: async () => ++calls === 1 ? '{}' : JSON.stringify({ scores: [{ criterion: 'a', score: 2, evidence: 'quote', fix: 'none' }] }) });
  const scores = await runReviewer({ config: { ...config, reviewer: { command: ['fake'], timeoutSeconds: 1 } }, io: runner, post, rubric: [{ id: 'a', question: 'a' }], brief: '' });
  assert.equal(calls, 2); assert.equal(scores[0].score, 2);
});
test('calibration reports exact agreement', () => {
  const s: ScoreResult = { criterion: 'a', score: 2, evidence: 'e', fix: 'f' };
  assert.deepEqual(agreement([{ expected: [s], actual: [s] }, { expected: [s], actual: [{ ...s, score: 1 }] }]), { a: 50 });
});
test('accept refuses a failed gate', async () => {
  const root = tempStudio({ 'projects/p/reviews/x.json': JSON.stringify({ gates: [{ id: 'rights', pass: false }] }) });
  const fake = fakeIO({ cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: 'studio.yml' } });
  await assert.rejects(() => accept(['p', 'x', '--reason', 'yes'], fake), /failed gate/);
});

test('metric grounding compares normalized whole claims and ignores ordinary numbers', () => {
  const cases = JSON.parse(readFileSync(new URL('./fixtures/reviews/grounding/cases.json', import.meta.url), 'utf8')) as { body: string; brief: string; pass: boolean }[];
  for (const fixture of cases) {
    const result = runGates({ ...post, body: fixture.body }, pack, [], [{ ...brief[0], body: fixture.brief }], config);
    assert.equal(result.find(g => g.id === 'fabricated-metrics')!.pass, fixture.pass, fixture.body);
  }
});
test('grounding includes alt and rendered text and honors waivers', () => {
  const mediaPost: Post = { ...post, media: [{ asset: 'a', file: 'image.png', alt: '10x faster', kind: 'image' }] };
  assert.equal(gate('fabricated-metrics', mediaPost, pack, [image]).pass, false);
  const visual = { ...image, metrics: [{ file: 'image.png', minFontPx: 30, minContrast: 4, overflow: false, texts: ['50 percent faster'] }] };
  assert.equal(gate('fabricated-metrics', { ...mediaPost, media: [{ ...mediaPost.media[0], alt: 'Chart' }] }, pack, [visual]).pass, false);
  const waived = { ...config, grounding: { ...config.grounding, waive: ['10x'] } };
  assert.equal(runGates(mediaPost, pack, [image], brief, waived).find(g => g.id === 'fabricated-metrics')!.pass, true);
});
test('specs validate evidence, media outputs and each thread item', () => {
  assert.equal(gate('specs', { ...post, evidence: ['E2'] }).pass, false);
  assert.equal(gate('specs', { ...post, media: [{ asset: 'a', file: 'source.html', alt: 'Alt', kind: 'image' }] }, { ...pack, media: [{ kind: 'image' }] }, [image]).pass, false);
  assert.equal(gate('specs', { ...post, thread: ['too long'] }, { ...pack, textLimit: { value: 5, source: 's' } }).pass, false);
});
test('reviewer accepts fenced JSON and retries independently for hook order', async () => {
  let calls = 0;
  const runner = fakeIO({ cwd: io.cwd, run: async () => {
    calls++;
    if (calls === 1) return '{}';
    return '```json\n' + JSON.stringify({ scores: [{ criterion: 'a', score: calls === 2 ? null : 1, evidence: 'quote', fix: 'none' }], hookComparison: { preferred: calls === 2 ? 0 : 1, evidence: 'clearer' } }) + '\n```';
  } });
  const scores = await runReviewer({ config: { ...config, reviewer: { command: ['fake'], timeoutSeconds: 1 } }, io: runner, post, rubric: [{ id: 'a', question: 'a' }], brief: '', hooks: ['A', 'B'] });
  assert.equal(calls, 3);
  assert.equal(scores[0].score, 1);
  assert.deepEqual(scores.hookComparisons?.map(c => c.preferred), ['A', 'A']);
});

test('disclosure validates accepted tiers and separates sponsorship', () => {
  const policies: PlatformPack = { ...pack, disclosure: { ...pack.disclosure, text: { rule: 'Select tier', source: 's', accepts: ['Hand Written', 'AI-Assisted', 'Fully Autonomous'] } }, sponsorship: { rule: 'Paid partnership', source: 's', accepts: ['paid partnership'] } };
  assert.equal(gate('disclosure', { ...post, disclosure: { text: 'anything' } }, policies).pass, false);
  assert.equal(gate('disclosure', { ...post, disclosure: { text: 'AI-Assisted' } }, policies).pass, true);
  assert.equal(gate('disclosure', { ...post, sponsored: true, disclosure: { text: 'AI-Assisted' } }, policies).pass, false);
  assert.equal(gate('disclosure', { ...post, sponsored: true, disclosure: { text: 'AI-Assisted', sponsorship: 'paid partnership' } }, policies).pass, true);
});
test('accessibility handles large text and no-text assets', () => {
  const mediaPost: Post = { ...post, media: [{ asset: 'a', file: 'assets/a/out/image.png', alt: 'Chart', kind: 'image' }] };
  const base = { ...image, outputs: [{ file: 'out/image.png', width: 1080, bytes: 4 }] };
  const noText: AssetMeta = { ...base, metrics: [{ file: 'out/image.png', minFontPx: null, minContrast: null, overflow: false }] };
  assert.equal(gate('accessibility', mediaPost, pack, [noText]).pass, true);
  const large: AssetMeta = { ...base, metrics: [{ file: 'out/image.png', minFontPx: 30, minContrast: 3.5, overflow: false, nodes: [{ text: 'Headline', fontPx: 30, contrast: 3.5, overflow: false }] }] };
  assert.equal(gate('accessibility', mediaPost, pack, [large]).pass, true);
  assert.equal(gate('accessibility', mediaPost, { ...pack, accessibility: { minContrastLarge: 4 } }, [large]).pass, false);
});
