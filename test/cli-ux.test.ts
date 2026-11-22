import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { stringify } from 'yaml';
import { run as feedback } from '../src/commands/feedback.ts';
import { run as history, restore } from '../src/commands/history.ts';
import { run as make } from '../src/commands/make.ts';
import { run as plan } from '../src/commands/plan.ts';
import { run as status } from '../src/commands/status.ts';
import { run as revise } from '../src/commands/revise.ts';
import { run as review } from '../src/commands/review.ts';
import { run as render } from '../src/commands/render.ts';
import { loadFeedback, markApplied } from '../src/feedback.ts';
import { historyEntries, snapshot } from '../src/history.ts';
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
  const { dir, io } = fixture();
  await assert.rejects(make(['demo', '--assets', 'unknown'], io), /Unknown asset: unknown.*Valid assets/);
  await assert.rejects(render(['demo', '--platforms=unknown'], io), /Unknown platform: unknown.*bluesky/);
  await assert.rejects(review(['demo', '--platforms=unknown'], io), /Unknown platform: unknown.*bluesky/);
  assert.equal(existsSync(join(dir, 'history')), false);
});

test('scoped plan rejects conflicting shared assets and leaves the original intact', async () => {
  const { dir, io } = fixture();
  writeFileSync(join(io.cwd, 'studio.yml'), 'brand: {name: Demo}\nplatforms: [bluesky, linkedin]\n');
  const asset = { id: 'hero', kind: 'card', brief: 'Hero' };
  const entry = (platform: string, kind: string) => ({ platform, type: 'text', angle: 'Test', hooks: ['one', 'two', 'three'], assets: [{ ...asset, kind }] });
  const original = stringify([entry('bluesky', 'card'), entry('linkedin', 'card')]);
  writeFileSync(join(dir, 'plan.yml'), original);
  let calls = 0;
  io.run = async (_command, _args, opts) => {
    calls++;
    writeFileSync(join(opts!.cwd!, 'plan.scoped.yml'), stringify([entry('bluesky', 'poster')]));
    return '';
  };
  await assert.rejects(plan(['demo', '--platforms=bluesky'], io), /conflicts with shared asset/);
  assert.equal(calls, 2);
  assert.equal(readFileSync(join(dir, 'plan.yml'), 'utf8'), original);
});

test('scoped plan adds newly enabled platforms and snapshots the previous plan', async () => {
  const { dir, io } = fixture();
  writeFileSync(join(io.cwd, 'studio.yml'), 'brand: {name: Demo}\nplatforms: [bluesky, threads]\n');
  io.run = async (_command, _args, opts) => {
    writeFileSync(join(opts!.cwd!, 'plan.scoped.yml'), stringify([{ platform: 'threads', type: 'text', angle: 'New', hooks: ['one', 'two', 'three'], assets: [] }]));
    return '';
  };
  await plan(['demo', '--platforms=threads'], io);
  const text = readFileSync(join(dir, 'plan.yml'), 'utf8');
  assert.match(text, /bluesky/); assert.match(text, /threads/);
  assert.match(readFileSync(join(dir, 'history', historyEntries(dir)[0], 'plan.yml'), 'utf8'), /bluesky/);
});

test('empty and incompatible scopes fail before agent invocation', async () => {
  const { dir, io } = fixture();
  writeFileSync(join(io.cwd, 'studio.yml'), 'brand: {name: Demo}\nplatforms: [bluesky, linkedin]\n');
  writeFileSync(join(dir, 'plan.yml'), stringify([
    { platform: 'bluesky', type: 'text', angle: 'Test', hooks: ['one', 'two', 'three'], assets: [] },
    { platform: 'linkedin', type: 'text', angle: 'Test', hooks: ['one', 'two', 'three'], assets: [{ id: 'hero', kind: 'card', brief: 'Hero' }] },
  ]));
  for (const command of [make, plan]) {
    await assert.rejects(command(['demo', '--assets='], io), /usage:/);
    await assert.rejects(command(['demo', '--platforms=bluesky', '--assets=hero'], io), /not planned/);
  }
  assert.equal(existsSync(join(dir, 'history')), false);
});

test('invalid blocker values fail the specs gate instead of being ignored', async () => {
  const { dir, io } = fixture();
  for (const value of ['none', '[{item: install}]']) {
    writeFileSync(join(dir, 'posts/bluesky.md'), `---\nplatform: bluesky\nevidence: [E1]\nmedia: []\nblockers: ${value}\n---\nOriginal\n`);
    await review(['demo'], io);
    const result = JSON.parse(readFileSync(join(dir, 'reviews/bluesky.json'), 'utf8'));
    assert.match(result.gates.find((gate: { id: string }) => gate.id === 'specs').message, /Invalid blockers/);
  }
});

test('scoped make excludes shared assets and leaves other posts alone', async () => {
  const { dir, io } = fixture();
  writeFileSync(join(io.cwd, 'studio.yml'), 'brand: {name: Demo}\nplatforms: [bluesky, linkedin]\n');
  const asset = { id: 'hero', kind: 'card', brief: 'Hero' };
  writeFileSync(join(dir, 'plan.yml'), stringify(['bluesky', 'linkedin'].map(platform => ({ platform, type: 'text', angle: 'Test', hooks: ['one', 'two', 'three'], assets: [asset] }))));
  mkdirSync(join(dir, 'assets/hero'), { recursive: true });
  writeFileSync(join(dir, 'assets/hero/asset.yml'), 'original');
  writeFileSync(join(dir, 'posts/linkedin.md'), '---\nplatform: linkedin\nevidence: []\nmedia: []\n---\nKeep\n');
  io.run = async (_command, _args, opts) => {
    mkdirSync(join(opts!.cwd!, 'posts'), { recursive: true });
    mkdirSync(join(opts!.cwd!, 'assets/hero'), { recursive: true });
    writeFileSync(join(opts!.cwd!, 'posts/bluesky.md'), '---\nplatform: bluesky\nevidence: []\nmedia: []\n---\nUpdated\n');
    writeFileSync(join(opts!.cwd!, 'assets/hero/asset.yml'), 'changed');
    return '';
  };
  await make(['demo', '--platforms=bluesky'], io);
  assert.equal(readFileSync(join(dir, 'assets/hero/asset.yml'), 'utf8'), 'original');
  assert.match(readFileSync(join(dir, 'posts/linkedin.md'), 'utf8'), /Keep/);
});

test('history retains 20 snapshots, links unchanged output, and restores removed files', async () => {
  const { dir, io } = fixture();
  mkdirSync(join(dir, 'assets/logo/out'), { recursive: true });
  writeFileSync(join(dir, 'assets/logo/out/image.png'), 'image');
  snapshot(dir, 'make');
  for (let n = 1; n <= 20; n++) {
    writeFileSync(join(dir, 'posts/bluesky.md'), `version ${n}`);
    snapshot(dir, 'make');
  }
  const entries = historyEntries(dir);
  assert.equal(entries.length, 20);
  assert.equal(statSync(join(dir, 'history', entries[0], 'assets/logo/out/image.png')).ino, statSync(join(dir, 'history', entries[1], 'assets/logo/out/image.png')).ino);
  writeFileSync(join(dir, 'assets/logo/out/new.png'), 'new');
  await restore(['demo', entries.at(-1)!.split('-')[0]], io);
  assert.equal(existsSync(join(dir, 'assets/logo/out/new.png')), false);
  assert.equal(readFileSync(join(dir, 'assets/logo/out/image.png'), 'utf8'), 'image');
  assert.equal(historyEntries(dir).length, 20);
});

test('feedback writes respect revision lock', async () => {
  const { dir, io } = fixture();
  writeFileSync(join(dir, '.revise.lock'), '');
  await assert.rejects(feedback(['demo', 'add', '--note', 'Note'], io), /Revision already in progress/);
  await assert.rejects(feedback(['demo', 'rm', 'id'], io), /Revision already in progress/);
});

test('status points to planning and unresolved blockers', async () => {
  const { dir, io } = fixture();
  rmSync(join(dir, 'plan.yml'));
  await status(['demo'], io);
  assert.ok(io.stdout.some(line => line.includes('bstudio plan demo')));
  mkdirSync(join(dir, 'reviews'), { recursive: true });
  writeFileSync(join(dir, 'reviews/bluesky.json'), JSON.stringify({ platform: 'bluesky', verdict: 'revise', gates: [{ id: 'specs', pass: false, message: 'Blocker in asset hero: Missing evidence' }] }));
  await status(['demo'], io);
  assert.ok(io.stdout.some(line => line.includes('resolve blockers')));
});

test('status suggests confirming rights and rereview after confirmation', async () => {
  const { dir, io } = fixture();
  mkdirSync(join(dir, 'reviews'), { recursive: true });
  mkdirSync(join(dir, 'assets/logo'), { recursive: true });
  const asset = join(dir, 'assets/logo/asset.yml');
  writeFileSync(asset, 'id: logo\nkind: logo\nprovider: template\noutputs: []\n');
  writeFileSync(join(dir, 'reviews/bluesky.json'), JSON.stringify({ platform: 'bluesky', verdict: 'blocked', gates: [{ id: 'rights', pass: false, message: 'Trademark search not checked for logo; confirm rights: bstudio confirm demo logo --trademark-checked' }] }));
  await status(['demo'], io);
  assert.ok(io.stdout.some(line => line.includes('confirm rights: bstudio confirm demo logo --trademark-checked')));
  writeFileSync(asset, 'id: logo\nkind: logo\nprovider: template\noutputs: []\ntrademarkChecked: true\n');
  io.stdout.length = 0;
  await status(['demo'], io);
  assert.ok(io.stdout.some(line => line.includes('next: run bstudio review demo')));
});

test('feedback revision cannot remove existing post blockers', async () => {
  const { dir, io } = fixture();
  writeFileSync(join(dir, 'posts/bluesky.md'), '---\nplatform: bluesky\nevidence: [E1]\nmedia: []\nblockers: [Need evidence]\n---\nOriginal\n');
  io.run = async (_command, _args, opts) => {
    writeFileSync(join(opts!.cwd!, 'posts/bluesky.md'), '---\nplatform: bluesky\nevidence: [E1]\nmedia: []\n---\nChanged\n');
    return '';
  };
  await revise(['demo', '--note', 'Improve', '--platform', 'bluesky'], io);
  assert.match(readFileSync(join(dir, 'posts/bluesky.md'), 'utf8'), /Need evidence/);
});
