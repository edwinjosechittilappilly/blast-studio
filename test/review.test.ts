import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPack } from '../src/packs.ts';
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

test('manual delivery skips Market Blaster media restrictions but keeps platform limits', () => {
  const mediaPost: Post = { ...post, media: [{ asset: 'a', file: 'assets/a/image.png', alt: 'Example', kind: 'image' }] };
  const mediaPack: PlatformPack = { ...pack, formats: ['image'], media: [{ kind: 'image' }], marketBlasterMedia: { source: 'mb', allowedKinds: [] } };
  assert.match(gate('specs', mediaPost, mediaPack, [image]).message, /Market Blaster does not support image/);
  assert.equal(gate('specs', { ...mediaPost, delivery: 'manual' }, mediaPack, [image]).pass, true);
  assert.match(gate('specs', { ...mediaPost, delivery: 'manual' }, { ...mediaPack, media: [{ kind: 'image', maxCount: { value: 0, source: 'platform' } }] }, [image]).message, /image count/);
});

test('edge warnings identify the zone used for shared outputs', () => {
  const measured: AssetMeta = { ...image, metrics: [{ file: 'image.png', minFontPx: null, minContrast: null, overflow: false, edge: true, zoneDescription: 'YouTube Shorts zone (youtube-shorts-safe-zone), X default 5% margin' }] };
  const withMedia: Post = { ...post, media: [{ asset: 'a', file: 'assets/a/image.png', kind: 'image', alt: 'Example' }] };
  const result = runGates(withMedia, pack, [measured], brief, config);
  assert.ok(result.warnings.some(warning => warning.includes('YouTube Shorts zone (youtube-shorts-safe-zone)') && warning.includes('X default 5% margin')));
});
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

test('video captions depend on the selected output audio and video still needs alt text', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bstudio-video-')), oldPath = process.env.PATH;
  const hash = createHash('sha256').update('silent').digest('hex');
  const video: AssetMeta = { id: 'v', kind: 'video', provider: 'hyperframes', outputs: [{ file: 'out/silent.mp4', bytes: 6, audio: false, audioHash: hash }, { file: 'out/audio.mp4', bytes: 5, audio: true, audioHash: createHash('sha256').update('audio').digest('hex') }], license: null, aiGenerated: false };
  const mediaPost: Post = { ...post, media: [{ asset: 'v', file: 'assets/v/out/silent.mp4', kind: 'video', alt: 'Motion poster' }] };
  const result = (p: Post, assets = [video]) => runGates(p, pack, assets, brief, config, dir).find(g => g.id === 'accessibility')!;
  try {
    process.env.PATH = dir;
    mkdirSync(join(dir, 'assets/v/out'), { recursive: true });
    writeFileSync(join(dir, mediaPost.media[0].file), 'silent');
    writeFileSync(join(dir, 'assets/v/out/audio.mp4'), 'audio');
    assert.equal(result(mediaPost).pass, true);
    const missingAlt = { ...mediaPost, media: [{ ...mediaPost.media[0], alt: '' }] };
    assert.match(result(missingAlt).message, /Missing alt text/);
    const withAudio = { ...mediaPost, media: [{ ...mediaPost.media[0], file: 'assets/v/out/audio.mp4' }] };
    assert.match(result(withAudio).message, /Missing captions/);
    const withCaptions = [{ ...video, outputs: [...video.outputs, { file: 'out/captions.vtt', bytes: 4 }] }];
    assert.match(result(withAudio, withCaptions).message, /Missing captions/);
    writeFileSync(join(dir, 'assets/v/out/captions.vtt'), 'WEBVTT\n');
    assert.equal(result(withAudio, withCaptions).pass, true);
    writeFileSync(join(dir, mediaPost.media[0].file), 'changed');
    assert.match(result(mediaPost).message, /Missing captions/);
    const probe = join(dir, 'ffprobe');
    writeFileSync(probe, '#!/bin/sh\nprintf \'{"streams":[{"index":1}]}\'\n');
    chmodSync(probe, 0o755);
    writeFileSync(join(dir, mediaPost.media[0].file), 'silent');
    assert.match(result(mediaPost).message, /Missing captions/);
    writeFileSync(probe, '#!/bin/sh\nprintf \'{"streams":[]}\'\n');
    assert.equal(result(mediaPost).pass, true);
  } finally {
    if (oldPath === undefined) delete process.env.PATH; else process.env.PATH = oldPath;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('legacy videos are probed and require captions if audio cannot be determined', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bstudio-probe-')), oldPath = process.env.PATH;
  const video: AssetMeta = { id: 'v', kind: 'video', provider: 'hyperframes', outputs: [{ file: 'out/video.mp4', bytes: 4 }], license: null, aiGenerated: false };
  const mediaPost: Post = { ...post, media: [{ asset: 'v', file: 'assets/v/out/video.mp4', kind: 'video', alt: 'Motion poster' }] };
  const result = () => runGates(mediaPost, pack, [video], brief, config, dir).find(g => g.id === 'accessibility')!;
  try {
    process.env.PATH = dir;
    mkdirSync(join(dir, 'assets/v/out'), { recursive: true });
    writeFileSync(join(dir, 'assets/v/out/video.mp4'), 'fake');
    assert.match(result().message, /Missing captions/);
    const probe = join(dir, 'ffprobe');
    writeFileSync(probe, '#!/bin/sh\nprintf \'{"streams":[]}\'\n');
    chmodSync(probe, 0o755);
    assert.equal(result().pass, true);
    writeFileSync(probe, '#!/bin/sh\nprintf \'{"streams":[{"index":1}]}\'\n');
    assert.match(result().message, /Missing captions/);
    writeFileSync(probe, '#!/bin/sh\nprintf invalid\n');
    assert.match(result().message, /Missing captions/);
  } finally {
    if (oldPath === undefined) delete process.env.PATH; else process.env.PATH = oldPath;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('caption and video paths cannot escape the campaign or refer to FIFOs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bstudio-path-'));
  const outside = mkdtempSync(join(tmpdir(), 'bstudio-outside-'));
  try {
    mkdirSync(join(dir, 'assets/v/out'), { recursive: true });
    writeFileSync(join(outside, 'captions.vtt'), 'WEBVTT\n');
    symlinkSync(join(outside, 'captions.vtt'), join(dir, 'assets/v/out/captions.vtt'));
    const fifo = join(dir, 'assets/v/out/video.mp4');
    assert.equal(spawnSync('mkfifo', [fifo]).status, 0);
    const video: AssetMeta = { id: 'v', kind: 'video', provider: 'hyperframes', outputs: [{ file: 'out/video.mp4', bytes: 4, audio: false, audioHash: 'forged' }, { file: 'out/captions.vtt', bytes: 4 }], license: null, aiGenerated: false };
    const p: Post = { ...post, media: [{ asset: 'v', file: 'assets/v/out/video.mp4', kind: 'video', alt: 'Video' }] };
    assert.match(runGates(p, pack, [video], brief, config, dir).find(g => g.id === 'accessibility')!.message, /Missing captions/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
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
  const root = tempStudio({ 'projects/p/campaigns/launch/reviews/x.json': JSON.stringify({ gates: [{ id: 'rights', pass: false }] }) });
  const fake = fakeIO({ cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: 'studio.yml' } });
  await assert.rejects(() => accept(['p/launch', 'x', '--reason', 'yes'], fake), /failed gate/);
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
test('media allowed by pack formats but without a limits entry warns instead of failing', () => {
  const card: AssetMeta = { id: 'c', kind: 'card', provider: 'template', outputs: [{ file: 'out/image.png', width: 1600, bytes: 4 }], license: null, aiGenerated: false };
  const withImage: Post = { ...post, media: [{ asset: 'c', file: 'assets/c/out/image.png', alt: 'Card', kind: 'image' }] };
  const result = runGates(withImage, { ...pack, formats: ['text', 'image'] }, [card], brief, config);
  assert.equal(result.find(g => g.id === 'specs')!.pass, true);
  assert.ok(result.warnings.some(w => w.startsWith('image limits unknown')));
  assert.equal(gate('specs', withImage, pack, [card]).pass, false);
});
test("a video's measured length grounds a duration claim", () => {
  const video: AssetMeta = { id: 'v', kind: 'terminal-demo', provider: 'vhs', outputs: [{ file: 'out/demo.mp4', bytes: 4, seconds: 36.48 }, { file: 'out/captions.vtt', bytes: 4 }], license: null, aiGenerated: false };
  const claim: Post = { ...post, body: 'A 37 seconds demo.', media: [{ asset: 'v', file: 'assets/v/out/demo.mp4', alt: 'Demo', kind: 'video' }] };
  assert.equal(gate('fabricated-metrics', claim, pack, [video]).pass, true);
  assert.equal(gate('fabricated-metrics', { ...claim, body: 'A 90 seconds demo.' }, pack, [video]).pass, false);
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

test('common numeric marketing claims and inline code require evidence', () => {
  for (const body of ['10,000+ users', '2 million users', '3 times faster', '100+ customers', 'by half', 'double the speed', 'twice as fast', 'Builds are `10x` faster', '```\n10x faster\n```']) {
    assert.equal(gate('fabricated-metrics', { ...post, body }).pass, false, body);
  }
  const result = runGates({ ...post, body: '2 million users and 3 times faster' }, pack, [], [{ ...brief[0], body: '2,000,000 users and 3x faster' }], config);
  assert.equal(result.find(g => g.id === 'fabricated-metrics')!.pass, true);
});
test('hyphenated identifier names do not generate number warnings', () => {
  const result = runGates({ ...post, body: 'SHA-256, H-264, ISO-8601 and UTF-8.' }, pack, [], brief, config);
  assert.ok(!result.warnings.some(w => /Ungrounded version or identifier/.test(w)));
});

test('Market Blaster attachment restrictions are enforced by destination packs', () => {
  const media: Post['media'][number] = { asset: 'a', file: 'assets/a/image.png', alt: 'Chart', kind: 'image' };
  const asset = { ...image, outputs: [{ file: 'image.png', bytes: 3000000 }] };
  for (const platform of ['hashnode', 'github-discussion', 'bluesky'] as const) {
    assert.equal(gate('specs', { ...post, platform, title: 'Title', media: [media] }, loadPack(platform), [asset]).pass, false, platform);
  }
  for (const platform of ['bluesky', 'mastodon', 'linkedin'] as const) {
    assert.equal(gate('specs', { ...post, platform, media: [{ ...media, file: 'assets/a/image.gif', kind: 'gif' }] }, loadPack(platform), [{ ...asset, outputs: [{ file: 'image.gif', bytes: 4 }] }]).pass, false, platform);
  }
  const video: AssetMeta = { ...asset, id: 'v', kind: 'video', outputs: [{ file: 'video.mp4', bytes: 4 }] };
  const videoMedia: Post['media'][number] = { asset: 'v', file: 'assets/v/video.mp4', alt: 'Video', kind: 'video' };
  assert.equal(gate('specs', { ...post, platform: 'bluesky', media: [media, videoMedia] }, loadPack('bluesky'), [{ ...asset, outputs: [{ file: 'image.png', bytes: 4 }] }, video]).pass, false);
  assert.equal(gate('specs', { ...post, platform: 'linkedin', media: [videoMedia] }, loadPack('linkedin'), [video]).pass, false);
});

test('generated DEV text and generated voice require truthful disclosure', () => {
  const dev = loadPack('devto');
  assert.equal(gate('disclosure', { ...post, disclosure: { text: 'Hand Written (No AI)' } }, dev).pass, false);
  assert.equal(gate('disclosure', { ...post, disclosure: { text: 'AI-Assisted (Some AI)' } }, dev).pass, true);
  const voicePack: PlatformPack = { ...pack, disclosure: { ...pack.disclosure, voice: { rule: 'Disclose voice', source: 's' } } };
  const video: AssetMeta = { ...image, kind: 'video', voiceGenerated: true };
  const mediaPost: Post = { ...post, media: [{ asset: 'a', file: 'assets/a/image.png', alt: 'Video', kind: 'video' }] };
  assert.equal(gate('disclosure', mediaPost, voicePack, [video]).pass, false);
});

test('video duration does not ground product claims and VTT cue metadata is ignored', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bstudio-captions-'));
  try {
    mkdirSync(join(dir, 'assets', 'v'), { recursive: true });
    writeFileSync(join(dir, 'assets', 'v', 'captions.vtt'), 'WEBVTT\n\n1\n00:00:00.000 --> 00:00:01.000\nWelcome\n\n2\n00:00:01.000 --> 00:00:02.000\nThank you\n');
    const video: AssetMeta = { id: 'v', kind: 'video', provider: 'hyperframes', outputs: [{ file: 'video.mp4', bytes: 4, seconds: 30 }, { file: 'captions.vtt', bytes: 4 }], license: null, aiGenerated: false };
    const claim: Post = { ...post, body: 'Deploys in 30 seconds.', media: [{ asset: 'v', file: 'assets/v/video.mp4', alt: 'Demo', kind: 'video' }] };
    const result = runGates(claim, pack, [video], brief, config, dir);
    assert.equal(result.find(g => g.id === 'fabricated-metrics')!.pass, false);
    assert.ok(!result.warnings.some(w => /Ungrounded version or identifier/.test(w)));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('specs reject placeholders in post fields, captions and rendered text', () => {
  const markers = ['[PLACEHOLDER] paste the install command', 'PLACEHOLDER]', 'TODO', 'TBD', 'lorem ipsum', '{{ name }}', '<your-token>', 'REPLACE_ME', 'xxx'];
  for (const marker of markers) {
    const result = gate('specs', { ...post, body: marker });
    assert.equal(result.pass, false, marker);
    assert.match(result.message, /x\.md body/);
  }
  for (const ok of ['A todo list and todos for tomorrow.', 'Paste the command into your terminal.', 'Set `token: ${{ secrets.NPM_TOKEN }}` in the workflow.', '```yaml\nenv:\n  TOKEN: ${{ secrets.X }} # TODO rotate\n```']) assert.equal(gate('specs', { ...post, body: ok }).pass, true, ok);
  const dir = mkdtempSync(join(tmpdir(), 'bstudio-placeholders-'));
  try {
    mkdirSync(join(dir, 'assets', 'v'), { recursive: true });
    writeFileSync(join(dir, 'assets', 'v', 'captions.vtt'), 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n[PLACEHOLDER] paste the install command\n');
    const video: AssetMeta = { id: 'v', kind: 'video', provider: 'hyperframes', outputs: [{ file: 'video.mp4', bytes: 4 }, { file: 'captions.vtt', bytes: 4 }], license: null, aiGenerated: false, metrics: [{ file: 'video.mp4', minFontPx: 30, minContrast: 5, overflow: false, texts: ['[PLACEHOLDER] paste the install command'] }] };
    const draft: Post = { ...post, media: [{ asset: 'v', file: 'assets/v/video.mp4', alt: 'TODO', kind: 'video' }] };
    const result = runGates(draft, pack, [video], brief, config, dir).find(g => g.id === 'specs')!;
    assert.equal(result.pass, false);
    assert.match(result.message, /alt text.*TODO/);
    assert.match(result.message, /video\.mp4 rendered text.*\[PLACEHOLDER/);
    assert.match(result.message, /captions\.vtt captions.*\[PLACEHOLDER/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('rendered code and captions with snippet syntax are not placeholders', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bstudio-codecard-'));
  try {
    mkdirSync(join(dir, 'assets', 'c'), { recursive: true });
    writeFileSync(join(dir, 'assets', 'c', 'captions.vtt'), 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nSet TOKEN: ${{ secrets.X }} # TODO rotate\n');
    const card: AssetMeta = { id: 'c', kind: 'card', provider: 'template', outputs: [{ file: 'image.png', width: 1080, bytes: 4 }, { file: 'captions.vtt', bytes: 4 }], license: null, aiGenerated: false, metrics: [{ file: 'image.png', minFontPx: 30, minContrast: 5, overflow: false, texts: ['TOKEN: ${{ secrets.X }}', '# TODO rotate the key', 'id: xxx'] }] };
    const withCard: Post = { ...post, media: [{ asset: 'c', file: 'assets/c/image.png', alt: 'Workflow snippet', kind: 'image' }] };
    assert.equal(runGates(withCard, pack, [card], brief, config, dir).find(g => g.id === 'specs')!.message.includes('Placeholder'), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
