import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { run as feedback } from '../src/commands/feedback.ts';
import { run as history, restore } from '../src/commands/history.ts';
import { run as make } from '../src/commands/make.ts';
import { run as review } from '../src/commands/review.ts';
import { run as render } from '../src/commands/render.ts';
import { loadFeedback, markApplied } from '../src/feedback.ts';
import { snapshot } from '../src/history.ts';
import { fakeIO, tempStudio } from './helpers.ts';

function fixture() {
  const root = tempStudio({
    'studio.yml': 'brand: {name: Demo}\nplatforms: [bluesky]\nreviewer: {command: null}\n',
    'projects/demo/brief.md': '## [E1] Idea\n\nEvidence.\n',
    'projects/demo/plan.yml': '- platform: bluesky\n  type: text\n  angle: Test\n  hooks: [one, two, three]\n  assets: []\n',
    'projects/demo/posts/bluesky.md': '---\nplatform: bluesky\nevidence: []\nmedia: []\n---\nOriginal\n',
  });
  return { dir: join(root, 'projects/demo'), io: fakeIO({ cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: join(root, 'studio.yml') } }) };
}

test('feedback is queued and removable without running an agent', async () => {
  const { dir, io } = fixture();
  await feedback(['demo', 'add', '--note', 'Change headline', '--platform', 'bluesky'], io);
  const entry = loadFeedback(dir)[0];
  assert.equal(entry.status, 'pending');
  await feedback(['demo', 'list'], io);
  assert.ok(io.stdout.some(line => line.includes(entry.id) && line.includes('Change headline')));
  await feedback(['demo', 'rm', entry.id], io);
  assert.equal(loadFeedback(dir).length, 0);
  await feedback(['demo', 'add', '--note', 'Keep'], io);
  const applied = loadFeedback(dir)[0]; markApplied(dir, [applied.id]);
  await assert.rejects(feedback(['demo', 'rm', applied.id], io), /applied/);
});

test('restore preserves current state and skips identical snapshots', async () => {
  const { dir, io } = fixture(), post = join(dir, 'posts/bluesky.md');
  snapshot(dir, 'make'); snapshot(dir, 'make');
  await history(['demo'], io);
  assert.equal(io.stdout.length, 1);
  writeFileSync(post, 'changed');
  await restore(['demo', '1'], io);
  assert.match(readFileSync(post, 'utf8'), /Original/);
  await restore(['demo', '2'], io);
  assert.equal(readFileSync(post, 'utf8'), 'changed');
});

test('planned asset blockers fail specs and review reports the reason', async () => {
  const { dir, io } = fixture();
  writeFileSync(join(dir, 'brief.md'), '## [E1] Idea\n\nEvidence.\n');
  writeFileSync(join(dir, 'plan.yml'), '- platform: bluesky\n  type: text\n  angle: Test\n  hooks: [one, two, three]\n  assets:\n    - { id: logo, kind: logo, brief: Logo }\n');
  mkdirSync(join(dir, 'assets/logo'), { recursive: true });
  writeFileSync(join(dir, 'assets/logo/asset.yml'), 'id: logo\nkind: logo\nblockers: [Need installation evidence]\noutputs: []\n');
  await review(['demo'], io);
  const result = JSON.parse(readFileSync(join(dir, 'reviews/bluesky.json'), 'utf8'));
  assert.match(result.gates.find((gate: { id: string }) => gate.id === 'specs').message, /Need installation evidence/);
  assert.ok(io.stdout.some(line => line.includes('Need installation evidence')));
  assert.ok(io.stdout.some(line => line.includes('review.md')));
});

test('unknown scope identifiers fail before mutation', async () => {
  const { io } = fixture();
  await assert.rejects(make(['demo', '--assets', 'unknown'], io), /Unknown asset: unknown.*Valid assets/);
  await assert.rejects(render(['demo', '--platforms=unknown'], io), /Unknown platform: unknown.*bluesky/);
  await assert.rejects(review(['demo', '--platforms=unknown'], io), /Unknown platform: unknown.*bluesky/);
});
