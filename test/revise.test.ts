import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { stringify } from 'yaml';
import { run as revise } from '../src/commands/revise.ts';
import { run as review } from '../src/commands/review.ts';
import { fakeIO, tempStudio } from './helpers.ts';

function fixture(maxRounds: number) {
  const root = tempStudio({
    'studio.yml': `brand: {name: Demo}\nplatforms: [bluesky]\nreviewer: {command: null}\nreview: {maxRounds: ${maxRounds}}\n`,
    'projects/demo/brief.md': '## [E1] Idea\n\nA useful idea.\n',
    'projects/demo/plan.yml': stringify([{ platform: 'bluesky', type: 'text', angle: 'Useful', hooks: ['One', 'Two', 'Three'], assets: [] }]),
    'projects/demo/posts/bluesky.md': '---\nplatform: bluesky\nevidence: [E1]\nmedia: []\n---\nOriginal\n',
    'projects/demo/reviews/bluesky.json': JSON.stringify({ platform: 'bluesky', verdict: 'revise', gates: [] }),
  });
  const project = join(root, 'projects/demo'); let calls = 0;
  const io = fakeIO({ cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: join(root, 'studio.yml') }, run: async (_cmd, _args, opts) => {
    calls++;
    writeFileSync(join(opts!.cwd!, 'posts/bluesky.md'), `---\nplatform: bluesky\nevidence: [E1]\nmedia: []\n---\nRevision ${calls}\n`);
    return '';
  } });
  return { root, project, io, calls: () => calls };
}

test('zero revision rounds refuses without invoking the agent', async () => {
  const f = fixture(0);
  await assert.rejects(revise(['demo'], f.io), /revision.*limit/i);
  assert.equal(f.calls(), 0);
  assert.match(readFileSync(join(f.project, 'posts/bluesky.md'), 'utf8'), /Original/);
});

test('revision applies edits, rerenders and rereviews at most maxRounds times', async () => {
  const f = fixture(2);
  await assert.rejects(revise(['demo'], f.io), /revision.*limit/i);
  assert.equal(f.calls(), 2);
  assert.match(readFileSync(join(f.project, 'posts/bluesky.md'), 'utf8'), /Revision 2/);
  const review = JSON.parse(readFileSync(join(f.project, 'reviews/bluesky.json'), 'utf8'));
  assert.equal(review.verdict, 'revise');
  assert.ok(review.gates.length > 0);
  assert.equal(f.io.stdout.filter(line => line.startsWith('Rendered ')).length, 2);
  assert.equal(f.io.stdout.filter(line => line.startsWith('bluesky: revise')).length, 2);
});

test('missing media fails specs without invoking the paid reviewer', async () => {
  const f = fixture(1);
  writeFileSync(join(f.root, 'studio.yml'), 'brand: {name: Demo}\nplatforms: [bluesky]\nreviewer: {command: [reviewer]}\n');
  writeFileSync(join(f.project, 'posts/bluesky.md'), '---\nplatform: bluesky\nevidence: [E1]\nmedia:\n  - { asset: missing, file: assets/missing/out/image.png, kind: image, alt: Alt }\n---\nOriginal\n');
  await review(['demo'], f.io);
  const result = JSON.parse(readFileSync(join(f.project, 'reviews/bluesky.json'), 'utf8'));
  assert.equal(f.calls(), 0);
  assert.equal(result.gates.find((g: { id: string }) => g.id === 'specs').pass, false);
  assert.match(result.gates.find((g: { id: string }) => g.id === 'specs').message, /missing project media/i);
});

test('revision leaves accepted posts and their assets untouched', async () => {
  const f = fixture(1);
  const logo = { id: 'logo', kind: 'logo', brief: 'Logo' };
  writeFileSync(join(f.project, 'plan.yml'), stringify([
    { platform: 'bluesky', type: 'text', angle: 'Useful', hooks: ['One', 'Two', 'Three'], assets: [] },
    { platform: 'instagram', type: 'image', angle: 'Useful', hooks: ['One', 'Two', 'Three'], assets: [logo] },
  ]));
  mkdirSync(join(f.project, 'assets/logo/out'), { recursive: true });
  writeFileSync(join(f.project, 'assets/logo/asset.yml'), 'id: logo\nkind: logo\nprovider: template\naiGenerated: false\noutputs: []\n');
  writeFileSync(join(f.project, 'posts/instagram.md'), '---\nplatform: instagram\nevidence: [E1]\nmedia:\n  - { asset: logo, file: assets/logo/out/logo.png, kind: image, alt: Logo }\n---\nAccepted\n');
  const accepted = JSON.stringify({ platform: 'instagram', verdict: 'accepted', gates: [], acceptedReason: 'approved' });
  writeFileSync(join(f.project, 'reviews/instagram.json'), accepted);
  await assert.rejects(revise(['demo'], f.io), /revision.*limit/i);
  assert.equal(readFileSync(join(f.project, 'reviews/instagram.json'), 'utf8'), accepted);
  assert.equal(f.io.stdout.some(line => line.startsWith('instagram:')), false);
});
