import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { main } from '../src/cli.ts';
import { acquireCampaignLock } from '../src/jobs/runner.ts';
import { listBlockers, readResolutions } from '../src/blockers.ts';
import { fakeIO, tempStudio } from './helpers.ts';

function fixture() {
  const root = tempStudio({
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
  assert.equal(await main(['blockers', 'p/c', 'resolve', 'post:x', '0', '--reason', '  Fixed evidence  '], io), 0);
  assert.deepEqual(listBlockers(dir), [{ target: 'post:x', index: 0, text: 'Second' }, { target: 'asset:a', index: 0, text: 'Asset issue' }]);
  assert.match(readFileSync(join(dir, 'posts/x.md'), 'utf8'), /Keep this body\./);
  const [entry] = readResolutions(dir);
  assert.deepEqual({ ...entry, resolvedAt: '<time>' }, { target: 'post:x', text: 'First', reason: 'Fixed evidence', resolvedAt: '<time>', by: 'owner' });
  assert.ok(Number.isFinite(Date.parse(entry.resolvedAt)));
  const snapshot = readdirSync(join(dir, 'history')).find(name => name.includes('-blockers-'))!;
  assert.match(readFileSync(join(dir, 'history', snapshot, 'posts/x.md'), 'utf8'), /First/);
  assert.equal(await main(['blockers', 'p/c', 'resolve', 'asset:a', '0', '--reason', 'Supplied'], io), 0);
  assert.deepEqual(readResolutions(dir).map(item => item.text), ['First', 'Asset issue']);
});

test('rejects invalid targets, indexes and reasons without changing artifacts', async () => {
  const { dir, io } = fixture();
  const before = readFileSync(join(dir, 'posts/x.md'), 'utf8');
  for (const args of [
    ['post:x', '-1', '--reason', 'ok'], ['post:x', '2', '--reason', 'ok'],
    ['asset:../x', '0', '--reason', 'ok'], ['post:x', '0', '--reason', '  '],
  ]) assert.equal(await main(['blockers', 'p/c', 'resolve', ...args], io), 1);
  assert.equal(readFileSync(join(dir, 'posts/x.md'), 'utf8'), before);
  assert.deepEqual(readResolutions(dir), []);
});

test('resolution participates in campaign locking while listing remains available', async () => {
  const { dir, io } = fixture();
  const release = acquireCampaignLock(io.env.BSTUDIO_HOME!, 'p/c');
  try {
    assert.equal(await main(['blockers', 'p/c', 'list'], io), 0);
    assert.equal(await main(['blockers', 'p/c', 'resolve', 'post:x', '0', '--reason', 'Fixed'], io), 1);
    assert.equal(listBlockers(dir).length, 3);
  } finally { release(); }
});

test('status suggests resolution first and a fresh review after the final blocker', async () => {
  const { dir, io } = fixture();
  mkdirSync(join(dir, 'reviews'));
  writeFileSync(join(dir, 'reviews/x.json'), JSON.stringify({ platform: 'x', at: '2020-01-01T00:00:00.000Z', verdict: 'blocked', gates: [{ id: 'specs', pass: false, message: 'Blocker in post' }] }));
  assert.equal(await main(['status', 'p/c'], io), 0);
  assert.match(io.text(), /next: resolve blockers: bstudio blockers p\/c/);
  for (const target of ['post:x', 'post:x', 'asset:a']) assert.equal(await main(['blockers', 'p/c', 'resolve', target, '0', '--reason', 'Addressed'], io), 0);
  io.stdout.length = 0;
  assert.equal(await main(['status', 'p/c'], io), 0);
  assert.match(io.text(), /next: run bstudio review p\/c/);
});