import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { run as create } from '../src/commands/new.ts';
import { fakeIO, tempStudio } from './helpers.ts';

test('new stops at a failed plan and prints the exact resume command', async () => {
  const root = tempStudio({ 'studio.yml': 'brand: {name: Demo}\nplatforms: [bluesky]\n', 'projects/demo/project.yml': 'name: demo\ncreatedAt: 2026-01-01\n' });
  let calls = 0;
  const io = fakeIO({ cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: join(root, 'studio.yml') }, run: async () => { calls++; throw new Error('planner unavailable'); } });
  await assert.rejects(create(['demo/launch', '--idea', 'A useful idea'], io), /planner unavailable/);
  assert.equal(calls, 1);
  assert.ok(existsSync(join(root, 'projects/demo/campaigns/launch/brief.md')));
  assert.match(readFileSync(join(root, 'projects/demo/campaigns/launch/brief.md'), 'utf8'), /A useful idea/);
  assert.deepEqual(io.stderr, ['Resume with: bstudio plan demo/launch']);
  assert.equal(existsSync(join(root, 'projects/demo/campaigns/launch/plan.yml')), false);
});

test('new prints a runnable brief resume command when input is missing', async () => {
  const root = tempStudio({ 'projects/demo/project.yml': 'name: demo\ncreatedAt: 2026-01-01\n' });
  const io = fakeIO({ cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: join(root, 'studio.yml') } });
  await assert.rejects(create(['demo/launch'], io), /at least one brief input/);
  assert.deepEqual(io.stderr, ['Resume with: bstudio brief "demo/launch"']);
});

test('new provides help and rejects unknown options before creating a brief', async () => {
  const root = tempStudio({ 'projects/demo/project.yml': 'name: demo\ncreatedAt: 2026-01-01\n' });
  const io = fakeIO({ cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: join(root, 'studio.yml') } });
  assert.equal(await create(['--help'], io), 0);
  assert.match(io.text(), /Example: bstudio new/);
  await assert.rejects(create(['demo/launch', '--unknown'], io), /unknown option/i);
  assert.equal(existsSync(join(root, 'projects/demo/campaigns/launch/brief.md')), false);
});
