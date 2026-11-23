import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { main } from '../src/cli.ts';
import { loadConfig } from '../src/config.ts';
import { historyEntries } from '../src/history.ts';
import { acquireCampaignLock } from '../src/jobs/runner.ts';
import { loadPosts } from '../src/posts.ts';
import { runAgentInWorkspace } from '../src/workspace.ts';
import { fakeIO, tempStudio } from './helpers.ts';

function fixture() {
  const root = tempStudio({ 'projects/p/project.yml': 'name: P\n', 'projects/p/campaigns/c/posts/linkedin.md': '---\nplatform: linkedin\nevidence: []\nmedia: []\n---\nBody\n' });
  return { root, dir: join(root, 'projects/p/campaigns/c'), io: fakeIO({ cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: join(root, 'studio.yml') } }) };
}

test('delivery updates only frontmatter value, snapshots, validates and locks', async () => {
  const { root, dir, io } = fixture(), file = join(dir, 'posts/linkedin.md');
  const original = '---\r\nplatform: linkedin\r\nevidence: []\r\nmedia: []\r\n# keep\r\n---\r\n\r\nBody\r\n';
  writeFileSync(file, original);
  const release = acquireCampaignLock(root, 'p/c');
  try { assert.equal(await main(['delivery', 'p/c', 'linkedin', 'manual'], io), 1); } finally { release(); }
  assert.equal(readFileSync(file, 'utf8'), original);
  assert.equal(await main(['delivery', 'p/c', 'linkedin', 'manual'], io), 0);
  const manual = original.replace('# keep', '# keep\r\ndelivery: manual');
  assert.equal(readFileSync(file, 'utf8'), manual);
  assert.equal(readFileSync(join(dir, 'history', historyEntries(dir)[0], 'posts/linkedin.md'), 'utf8'), original);
  assert.equal(await main(['delivery', 'p/c', 'linkedin', 'marketBlaster'], io), 0);
  assert.equal(readFileSync(file, 'utf8'), manual.replace('delivery: manual', 'delivery: marketBlaster'));
  for (const args of [['p/c', '../linkedin', 'manual'], ['p/c', 'linkedin', 'other'], ['p/c', 'linkedin'], ['p/c', 'youtube-shorts', 'marketBlaster']]) assert.equal(await main(['delivery', ...args], io), 1);
});

test('delivery inserts into flow-style frontmatter without changing existing content', async () => {
  for (const newline of ['\n', '\r\n']) {
    for (const mapping of [
      '{platform: linkedin, evidence: [], media: []}',
      `{ # owner note${newline}  platform: linkedin,${newline}  evidence: [], media: [],${newline}}`,
    ]) {
      const { dir, io } = fixture(), file = join(dir, 'posts/linkedin.md');
      const before = `---${newline}${mapping}${newline}---${newline}Body${newline}`;
      writeFileSync(file, before);
      assert.equal(await main(['delivery', 'p/c', 'linkedin', 'manual'], io), 0);
      assert.equal(readFileSync(file, 'utf8'), before.replace('{', '{delivery: manual, '));
      assert.equal(readFileSync(join(dir, 'history', historyEntries(dir)[0], 'posts/linkedin.md'), 'utf8'), before);
    }
  }
});

test('delivery repairs an invalid owner value without changing other bytes', async () => {
  const { dir, io } = fixture(), file = join(dir, 'posts/linkedin.md');
  const before = '---\nplatform: linkedin\nevidence: []\nmedia: []\ndelivery: auto # owner note\n---\nBody\n';
  writeFileSync(file, before);
  assert.throws(() => loadPosts(dir), /invalid delivery/);
  assert.equal(await main(['delivery', 'p/c', 'linkedin', 'manual'], io), 0);
  assert.equal(readFileSync(file, 'utf8'), before.replace('delivery: auto', 'delivery: manual'));
  assert.equal(readFileSync(join(dir, 'history', historyEntries(dir)[0], 'posts/linkedin.md'), 'utf8'), before);
});

test('delivery repairs null and empty values while preserving surrounding content', async () => {
  for (const newline of ['\n', '\r\n']) {
    for (const value of ['', '# owner note', 'null', 'null # owner note', '~', '~ # owner note', "''", "'' # owner note"]) {
      const { dir, io } = fixture(), file = join(dir, 'posts/linkedin.md');
      const before = ['---', 'platform: linkedin', `delivery: ${value}`, '# keep', 'evidence: []', 'media: []', '---', 'Body', ''].join(newline);
      writeFileSync(file, before);
      assert.equal(await main(['delivery', 'p/c', 'linkedin', 'manual'], io), 0, `value: ${JSON.stringify(value)}`);
      const comment = value.includes('#') ? ' # owner note' : '';
      assert.equal(readFileSync(file, 'utf8'), before.replace(`delivery: ${value}`, `delivery: manual${comment}`));
      assert.equal(readFileSync(join(dir, 'history', historyEntries(dir)[0], 'posts/linkedin.md'), 'utf8'), before);
    }
  }
});

test('agent cannot add, remove or change owner delivery', async () => {
  for (const [existing, agent, expected] of [['manual', 'marketBlaster', 'manual'], ['manual', '', 'manual'], ['', 'manual', undefined], ['manual', 'auto', 'manual'], ['', 'Manual', undefined], ['manual', 'null', 'manual']] as const) {
    const { root, dir } = fixture(), file = join(dir, 'posts/linkedin.md');
    const text = (route: string) => `---\nplatform: linkedin\nevidence: []\nmedia: []\n${route ? `delivery: ${route}\n` : ''}---\nEdited\n`;
    writeFileSync(file, text(existing));
    const io = fakeIO({ cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: join(root, 'studio.yml') }, run: async (_cmd, _args, opts) => {
      mkdirSync(join(opts!.cwd!, 'posts'), { recursive: true });
      writeFileSync(join(opts!.cwd!, 'posts/linkedin.md'), text(agent)); return '';
    } });
    await runAgentInWorkspace({ config: loadConfig(io), io, projectDir: dir, files: {}, allowOut: [/^posts\/linkedin\.md$/], prompt: 'write', timeoutMs: 1000, validate: workspace => { assert.equal(loadPosts(workspace).get('linkedin')!.delivery, undefined); return []; } });
    assert.equal(loadPosts(dir).get('linkedin')!.delivery, expected);
  }
});
