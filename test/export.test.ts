import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { run as exportCommand } from '../src/commands/export.ts';
import { run as mark } from '../src/commands/mark.ts';
import { reviewHash } from '../src/review-hash.ts';
import { fakeIO, tempStudio } from './helpers.ts';

function fixture(platform = 'bluesky') {
  const root = tempStudio(), project = join(root, 'projects/demo');
  for (const dir of ['posts', 'reviews', 'assets/a/out']) mkdirSync(join(project, dir), { recursive: true });
  writeFileSync(join(project, 'brief.md'), '# Brief\n\n## [E1] Example\n\nEvidence.\n');
  writeFileSync(join(project, 'assets/a/out/image.png'), 'image');
  writeFileSync(join(project, 'posts', `${platform}.md`), `---\nplatform: ${platform}\ntitle: T\nevidence: [E1]\nmedia:\n  - asset: a\n    file: assets/a/out/image.png\n    alt: Alt\n    kind: image\n---\nHello\n`);
  const review = { platform, postHash: reviewHash({ title: 'T', body: 'Hello', media: [{ path: 'image.png', alt: 'Alt' }] }), gates: [{ id: 'policy', pass: true, message: 'ok' }], verdict: 'pass', total: 90 };
  const save = () => writeFileSync(join(project, 'reviews', `${platform}.json`), JSON.stringify(review)); save();
  const io = fakeIO({ cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: join(root, 'studio.yml') } });
  return { root, project, review, save, io };
}

test('shared review hash vector', () => {
  assert.equal(reviewHash({ title: 'T', body: '  Hello\n', media: [{ path: 'a/img.png', alt: ' Alt ' }] }), '5d5491c0f7ae06bef68e9dabfd55f2e6c8152f8e6fdb96cd24d294cd203bc977');
});

test('refuses nonpassing, failed gates and stale reviews', async () => {
  const f = fixture();
  for (const verdict of ['revise', 'blocked']) { f.review.verdict = verdict; f.save(); await assert.rejects(exportCommand(['demo'], f.io), /bluesky.*review/); }
  f.review.verdict = 'pass'; f.review.gates[0].pass = false; f.save(); await assert.rejects(exportCommand(['demo'], f.io), /bluesky.*review/);
  f.review.gates[0].pass = true; f.review.postHash = 'stale'; f.save(); await assert.rejects(exportCommand(['demo'], f.io), /bluesky.*stale/);
});

test('market-blaster imports manifest and media', async () => {
  const f = fixture(); await exportCommand(['demo'], f.io);
  writeFileSync(join(f.root, 'market-blaster.yml'), 'brand: { name: Demo }\ndestinations: [bluesky]\n');
  const result = spawnSync(process.execPath, ['/Users/edwinjose/Documents/GitHub/market-blaster/bin/mblast.mjs', 'import', join(f.project, 'export'), '--slug', 'demo'], { cwd: f.root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const draft = readFileSync(join(f.root, 'campaigns/demo/drafts/bluesky.md'), 'utf8');
  assert.match(draft, /reviewHash/); const path = draft.match(/path: (media\/[^\s]+)/)?.[1]; assert.ok(path); assert.ok(existsSync(join(f.root, 'campaigns/demo', path)));
});

test('manual export and mark host validation', async () => {
  const f = fixture('instagram'); await exportCommand(['demo'], f.io);
  assert.match(readFileSync(join(f.project, 'exports/instagram/README.md'), 'utf8'), /alt: Alt/);
  assert.ok(existsSync(join(f.project, 'exports/instagram/post.md')));
  await assert.rejects(mark(['demo', 'instagram', '--url', 'https://instagram.com.evil.test/p/1'], f.io), /host/);
  await assert.rejects(mark(['demo', 'instagram', '--url', 'http://instagram.com/p/1'], f.io), /host/);
  await mark(['demo', 'instagram', '--url', 'https://www.instagram.com/p/1'], f.io);
  assert.equal(JSON.parse(readFileSync(join(f.project, 'published.json'), 'utf8')).instagram.url, 'https://www.instagram.com/p/1');
});

test('handoff invokes configured import and check and propagates failure', async () => {
  const f = fixture(), calls: string[][] = [];
  f.io.run = async (cmd, args, opts) => { calls.push([cmd, ...args]); assert.equal(opts?.cwd, f.root); return 'ok'; };
  await exportCommand(['demo', '--mb', f.root, '--force'], f.io);
  assert.deepEqual(calls.map(c => c[1]), ['import', 'check']); assert.ok(calls[0].includes('--force'));
  f.io.run = async () => { throw new Error('import failed'); };
  await assert.rejects(exportCommand(['demo', '--mb', f.root], f.io), /import failed/);
});
