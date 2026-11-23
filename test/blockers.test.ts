import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { main } from '../src/cli.ts';
import { acquireCampaignLock } from '../src/jobs/runner.ts';
import { listBlockers, readResolutions } from '../src/blockers.ts';
import { historyEntries, snapshot } from '../src/history.ts';
import { fakeIO, tempStudio } from './helpers.ts';

function fixture() {
  const root = tempStudio({
    'projects/p/project.yml': 'name: P\ncreatedAt: 2025-01-01\n',
    'projects/p/campaigns/c/posts/x.md': '---\nplatform: x\nevidence: []\nmedia: []\nblockers:\n  - First\n  - Second\n---\n\nKeep this body.\n',
    'projects/p/campaigns/c/assets/a/asset.yml': 'id: a\nkind: card\nblockers:\n  - Asset issue\n',
  });
  return { dir: join(root, 'projects/p/campaigns/c'), io: fakeIO({ cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: 'studio.yml' } }) };
}

test('lists and resolves individual post and asset blockers with audit and snapshot', async () => {
  const { dir, io } = fixture();
  assert.equal(await main(['blockers', 'p/c', 'list'], io), 0);
  assert.match(io.text(), /post:x 1: Second/);
  assert.match(io.text(), /asset:a 0: Asset issue/);
  assert.equal(await main(['blockers', 'p/c', 'resolve', 'post:x', '0', '--text', 'First', '--reason', '  Fixed evidence  '], io), 0);
  assert.deepEqual(listBlockers(dir), [{ target: 'post:x', index: 0, text: 'Second' }, { target: 'asset:a', index: 0, text: 'Asset issue' }]);
  assert.match(readFileSync(join(dir, 'posts/x.md'), 'utf8'), /Keep this body\./);
  const [entry] = readResolutions(dir);
  assert.deepEqual({ ...entry, resolvedAt: '<time>' }, { target: 'post:x', text: 'First', reason: 'Fixed evidence', resolvedAt: '<time>', by: 'owner' });
  assert.ok(Number.isFinite(Date.parse(entry.resolvedAt)));
  const snapshot = readdirSync(join(dir, 'history')).find(name => name.includes('-blockers-'))!;
  assert.match(readFileSync(join(dir, 'history', snapshot, 'posts/x.md'), 'utf8'), /First/);
  assert.equal(await main(['blockers', 'p/c', 'resolve', 'asset:a', '0', '--text', 'Asset issue', '--reason', 'Supplied'], io), 0);
  assert.deepEqual(readResolutions(dir).map(item => item.text), ['First', 'Asset issue']);
});

test('rejects invalid targets, indexes and reasons without changing artifacts', async () => {
  const { dir, io } = fixture();
  const before = readFileSync(join(dir, 'posts/x.md'), 'utf8');
  for (const args of [
    ['post:x', '-1', '--text', 'First', '--reason', 'ok'], ['post:x', '2', '--text', 'First', '--reason', 'ok'],
    ['asset:../x', '0', '--text', 'First', '--reason', 'ok'], ['post:x', '0', '--text', 'First', '--reason', '  '],
    ['post:x', '0', '--reason', 'ok'],
  ]) assert.equal(await main(['blockers', 'p/c', 'resolve', ...args], io), 1);
  assert.equal(readFileSync(join(dir, 'posts/x.md'), 'utf8'), before);
  assert.deepEqual(readResolutions(dir), []);
});

test('resolution participates in campaign locking while listing remains available', async () => {
  const { dir, io } = fixture();
  const release = acquireCampaignLock(io.env.BSTUDIO_HOME!, 'p/c');
  try {
    assert.equal(await main(['blockers', 'p/c', 'list'], io), 0);
    assert.equal(await main(['blockers', 'p/c', 'resolve', 'post:x', '0', '--text', 'First', '--reason', 'Fixed'], io), 1);
    assert.equal(listBlockers(dir).length, 3);
  } finally { release(); }
});

test('status suggests resolution first and a fresh review after the final blocker', async () => {
  const { dir, io } = fixture();
  mkdirSync(join(dir, 'reviews'));
  writeFileSync(join(dir, 'reviews/x.json'), JSON.stringify({ platform: 'x', at: '2020-01-01T00:00:00.000Z', verdict: 'blocked', gates: [{ id: 'specs', pass: false, message: 'Blocker in post' }] }));
  assert.equal(await main(['status', 'p/c'], io), 0);
  assert.match(io.text(), /next: resolve blockers: bstudio blockers p\/c/);
  for (const [target, text] of [['post:x', 'First'], ['post:x', 'Second'], ['asset:a', 'Asset issue']]) assert.equal(await main(['blockers', 'p/c', 'resolve', target, '0', '--text', text, '--reason', 'Addressed'], io), 0);
  io.stdout.length = 0;
  assert.equal(await main(['status', 'p/c'], io), 0);
  assert.match(io.text(), /next: run bstudio review p\/c/);
});

test('stale index is rejected without modifying artifacts', async () => {
  const { dir, io } = fixture();
  assert.equal(await main(['blockers', 'p/c', 'resolve', 'post:x', '0', '--text', 'First', '--reason', 'Done'], io), 0);
  const before = readFileSync(join(dir, 'posts/x.md'), 'utf8');
  const log = readFileSync(join(dir, 'resolutions.yml'), 'utf8');
  assert.equal(await main(['blockers', 'p/c', 'resolve', 'post:x', '0', '--text', 'First', '--reason', 'Stale'], io), 1);
  assert.match(io.text(), /This blocker list changed — refresh/);
  assert.equal(readFileSync(join(dir, 'posts/x.md'), 'utf8'), before);
  assert.equal(readFileSync(join(dir, 'resolutions.yml'), 'utf8'), log);
});

test('preserves unrelated YAML and post body including CRLF', async () => {
  const { dir, io } = fixture();
  const file = join(dir, 'posts/x.md');
  const before = '---\r\nplatform: x\r\nevidence: []\r\nmedia: []\r\n# keep comment\r\nblockers: [First, Second]\r\ntitle: A long title that should not be wrapped across multiple lines even when it exceeds the normal YAML line width used by the serializer\r\n---\r\n\r\nBody stays.\r\n';
  writeFileSync(file, before);
  assert.equal(await main(['blockers', 'p/c', 'resolve', 'post:x', '0', '--text', 'First', '--reason', 'Done'], io), 0);
  assert.equal(readFileSync(file, 'utf8'), before.replace('[First, Second]', '[Second]'));
});

test('blocker text beginning with a dash is passed as text', async () => {
  const { dir, io } = fixture();
  const file = join(dir, 'assets/a/asset.yml');
  writeFileSync(file, 'id: a\nkind: card\nblockers: ["--reason"]\n');
  assert.equal(await main(['blockers', 'p/c', 'resolve', 'asset:a', '0', '--text=--reason', '--reason', 'Done'], io), 0);
  assert.equal(readResolutions(dir)[0].text, '--reason');
});

test('status reports malformed campaign blockers and continues to other campaigns', async () => {
  const { dir, io } = fixture();
  writeFileSync(join(dir, 'assets/a/asset.yml'), 'id: a\nblockers: [broken\n');
  mkdirSync(join(dir, '..', 'other'), { recursive: true });
  assert.equal(await main(['status'], io), 0);
  assert.match(io.text(), /fix invalid blockers.*asset\.yml/);
  assert.match(io.text(), /  other/);
});

test('blocker snapshots do not evict workflow snapshots', async () => {
  const { dir, io } = fixture();
  const plan = join(dir, 'plan.yml');
  for (let n = 0; n < 20; n++) {
    writeFileSync(plan, `version: ${'x'.repeat(n)}\n`);
    snapshot(dir, 'make');
  }
  assert.equal(await main(['blockers', 'p/c', 'resolve', 'post:x', '0', '--text', 'First', '--reason', 'Done'], io), 0);
  assert.equal(await main(['blockers', 'p/c', 'resolve', 'post:x', '0', '--text', 'Second', '--reason', 'Done'], io), 0);
  assert.equal(historyEntries(dir).filter(name => name.includes('-make-')).length, 20);
});

test('snapshots distinguish equal-sized files with identical modification times', () => {
  const { dir } = fixture();
  const plan = join(dir, 'plan.yml'), time = new Date('2020-01-01T00:00:00Z');
  writeFileSync(plan, 'version: A\n');
  utimesSync(plan, time, time);
  const first = snapshot(dir, 'make')!;
  writeFileSync(plan, 'version: B\n');
  utimesSync(plan, time, time);
  const second = snapshot(dir, 'make')!;
  assert.notEqual(first, second);
  assert.equal(readFileSync(join(dir, 'history', first, 'plan.yml'), 'utf8'), 'version: A\n');
  assert.equal(readFileSync(join(dir, 'history', second, 'plan.yml'), 'utf8'), 'version: B\n');
});

test('parse errors explain ambiguous option values', async () => {
  const { io } = fixture();
  assert.equal(await main(['blockers', 'p/c', 'resolve', 'post:x', '0', '--text', '--reason', 'Done'], io), 1);
  assert.match(io.text(), /--text/);
  assert.match(io.text(), /usage:/);
});