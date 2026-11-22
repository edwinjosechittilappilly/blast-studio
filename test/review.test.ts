import { test } from 'node:test';
import assert from 'node:assert/strict';
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
const post: Post = { platform: 'x', path: 'x.md', body: 'A clear update.', media: [], evidence: [] };
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
