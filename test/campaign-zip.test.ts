import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { strFromU8, unzipSync } from 'fflate';
import { run as exportCommand } from '../src/commands/export.ts';
import { mediaContentHash, reviewHash } from '../src/review-hash.ts';
import { fakeIO, tempStudio } from './helpers.ts';

function fixture() {
  const root = tempStudio(), project = join(root, 'projects/demo');
  for (const dir of ['posts', 'reviews', 'assets/a/out']) mkdirSync(join(project, dir), { recursive: true });
  writeFileSync(join(project, 'brief.md'), '# Campaign\n\n## [E1] Example\n\nstatus: shipped\n\nSource: https://example.com/source\n\nEvidence.\n');
  writeFileSync(join(project, 'review.md'), '# Review\n');
  writeFileSync(join(project, 'assets/a/out/image.png'), 'image');
  for (const platform of ['bluesky', 'instagram']) {
    writeFileSync(join(project, 'posts', `${platform}.md`), `---\nplatform: ${platform}\ntitle: T\nevidence: [E1]\nmedia:\n  - asset: a\n    file: assets/a/out/image.png\n    alt: Alt\n    kind: image\nthread: [Second post]\n---\nHello\n`);
    writeFileSync(join(project, 'reviews', `${platform}.json`), JSON.stringify({ platform, postHash: reviewHash({ title: 'T', body: 'Hello', media: [{ path: 'image.png', alt: 'Alt' }] }), mediaHash: mediaContentHash(project, [{ asset: 'a', file: 'assets/a/out/image.png', alt: 'Alt', kind: 'image' }]), gates: ['policy', 'disclosure', 'specs', 'accessibility', 'fabricated-metrics', 'rights'].map(id => ({ id, pass: true })), verdict: 'pass', total: 90, at: '2026-11-22T08:00:00.000Z' }));
  }
  const io = fakeIO({ cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: join(root, 'studio.yml') } });
  return { root, project, io };
}

test('campaign zip contains a validated complete deterministic package', async () => {
  const f = fixture();
  await exportCommand(['demo'], f.io);
  const path = join(f.project, 'export/demo.campaign.zip'), first = readFileSync(path);
  await exportCommand(['demo'], f.io);
  assert.deepEqual(readFileSync(path), first);
  const entries = unzipSync(first), names = Object.keys(entries);
  for (const name of ['campaign.json', 'brief.md', 'sources/sources.json', 'sources/E1.md', 'posts/bluesky.md', 'handoff/bluesky-thread.md', 'handoff/instagram/post.md', 'handoff/instagram/README.md', 'review/bluesky.json', 'review/instagram.json', 'review/review.md']) assert.ok(entries[name], name);
  assert.ok(names.some(name => name.startsWith('media/') && name.endsWith('/image.png')));
  assert.ok(!names.some(name => name.startsWith('handoff/instagram/media/')));
  assert.match(strFromU8(entries['handoff/instagram/README.md']), /\.\.\/\.\.\/media\//);
  const manifest: { canonicalHome: string | null; sources: { url: string | null }[]; manual: { platform: string }[]; destinations: { review: { reviewHash: string } }[] } = JSON.parse(strFromU8(entries['campaign.json']));
  const ajv = new Ajv2020({ allErrors: true });
  ajv.addFormat('date-time', { type: 'string', validate: (s: string) => Number.isFinite(Date.parse(s)) });
  const validate = ajv.compile<typeof manifest>(JSON.parse(readFileSync(new URL('../schemas/campaign.v2.json', import.meta.url), 'utf8')));
  assert.ok(validate(manifest), ajv.errorsText(validate.errors));
  assert.equal(manifest.canonicalHome, null);
  assert.equal(manifest.sources[0].url, 'https://example.com/source');
  assert.equal(manifest.manual[0].platform, 'instagram');
  assert.equal(manifest.destinations[0].review.reviewHash, reviewHash({ title: 'T', body: 'Hello', media: [{ path: 'image.png', alt: 'Alt' }] }));
});

test('absent source status remains null', async () => {
  const f = fixture();
  const brief = join(f.project, 'brief.md');
  writeFileSync(brief, readFileSync(brief, 'utf8').replace('status: shipped\n\n', ''));
  await exportCommand(['demo'], f.io);
  const zip = unzipSync(readFileSync(join(f.project, 'export/demo.campaign.zip')));
  const manifest = JSON.parse(strFromU8(zip['campaign.json'])) as { sources: { status: string | null }[] };
  assert.equal(manifest.sources[0].status, null);
});

test('shared hash vector and stale reviews', async () => {
  assert.equal(reviewHash({ title: 'T', body: '  Hello\n', media: [{ path: 'a/img.png', alt: ' Alt ' }] }), '5d5491c0f7ae06bef68e9dabfd55f2e6c8152f8e6fdb96cd24d294cd203bc977');
  const f = fixture();
  writeFileSync(join(f.project, 'posts/bluesky.md'), readFileSync(join(f.project, 'posts/bluesky.md'), 'utf8').replace('Hello', 'Changed'));
  await assert.rejects(exportCommand(['demo'], f.io), /bluesky.*stale/);
});
