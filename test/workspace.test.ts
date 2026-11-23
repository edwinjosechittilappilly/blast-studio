import { strict as assert } from 'node:assert';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { parse, stringify } from 'yaml';
import { loadConfig } from '../src/config.ts';
import { runAgentInWorkspace } from '../src/workspace.ts';
import { fakeIO, tempStudio } from './helpers.ts';

test('workspace retries invalid video metadata with field-specific errors before write-back', async () => {
  const root = tempStudio(), project = join(root, 'projects/demo/campaigns/launch');
  mkdirSync(project, { recursive: true });
  let calls = 0;
  const io = fakeIO({ cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: join(root, 'studio.yml') }, run: async (_cmd, args, opts) => {
    const dir = join(opts!.cwd!, 'assets/clip'); mkdirSync(dir, { recursive: true });
    if (++calls === 1) writeFileSync(join(dir, 'asset.yml'), 'id: clip\nkind: video\naspects: [61]\ncaptions: {burn: yes}\n');
    else {
      assert.match(args.at(-1)!, /aspects\[0\].*61/);
      assert.match(args.at(-1)!, /captions\.burn/);
      assert.equal(existsSync(join(project, 'assets/clip/asset.yml')), false);
      writeFileSync(join(dir, 'asset.yml'), stringify({ id: 'clip', kind: 'video', aspects: ['1:1'], captions: { burn: true } }));
    }
    return '';
  } });
  await runAgentInWorkspace({ config: loadConfig(io), io, projectDir: project, files: {}, allowOut: [/^assets\/clip\/asset\.yml$/], prompt: 'write', timeoutMs: 1000 });
  assert.equal(calls, 2);
  assert.match(readFileSync(join(project, '.rejected/assets/clip/asset.yml'), 'utf8'), /61/);
  assert.deepEqual(parse(readFileSync(join(project, 'assets/clip/asset.yml'), 'utf8')).aspects, ['1:1']);
});

test('workspace accepts video metadata without aspects when the campaign has a tape', async () => {
  const root = tempStudio(), project = join(root, 'projects/demo/campaigns/launch');
  const source = join(project, 'assets/clip/source'); mkdirSync(source, { recursive: true });
  writeFileSync(join(source, 'demo.tape'), 'Output demo.gif\n');
  let calls = 0;
  const io = fakeIO({ cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: join(root, 'studio.yml') }, run: async (_cmd, _args, opts) => {
    calls++;
    assert.equal(existsSync(join(opts!.cwd!, 'assets/clip/source/demo.tape')), false);
    const dir = join(opts!.cwd!, 'assets/clip'); mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'asset.yml'), stringify({ id: 'clip', kind: 'video' }));
    return '';
  } });
  await runAgentInWorkspace({ config: loadConfig(io), io, projectDir: project, files: {}, allowOut: [/^assets\/clip\/asset\.yml$/], prompt: 'write', timeoutMs: 1000 });
  assert.equal(calls, 1);
  assert.equal(parse(readFileSync(join(project, 'assets/clip/asset.yml'), 'utf8')).aspects, undefined);
});

test('workspace rejects missing identity fields for every asset kind and never writes partial output', async () => {
  const root = tempStudio(), project = join(root, 'projects/demo/campaigns/launch');
  mkdirSync(project, { recursive: true });
  const kinds = ['card', 'poster', 'carousel', 'logo', 'diagram', 'video', 'terminal-demo', 'illustration', 'voiceover'];
  let calls = 0;
  const io = fakeIO({ cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: join(root, 'studio.yml') }, run: async (_cmd, _args, opts) => {
    calls++;
    for (const kind of kinds) {
      const dir = join(opts!.cwd!, 'assets', kind); mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'asset.yml'), stringify({ kind, ...(kind === 'video' ? { aspects: ['9:16'] } : {}) }));
    }
    return '';
  } });
  await assert.rejects(runAgentInWorkspace({ config: loadConfig(io), io, projectDir: project, files: {}, allowOut: [/^assets\/[^/]+\/asset\.yml$/], prompt: 'write', timeoutMs: 1000 }), error => {
    assert.match(String(error), /card\/asset\.yml: id/);
    assert.match(String(error), /voiceover\/asset\.yml: id/);
    return true;
  });
  assert.equal(calls, 2);
  for (const kind of kinds) assert.equal(existsSync(join(project, 'assets', kind, 'asset.yml')), false);
});

test('workspace rejects malformed metadata mappings and mismatched asset identity', async () => {
  for (const [content, expected] of [['- item\n', /must be an object/], ['id: wrong\nkind: unknown\n', /id.*wrong/]] as const) {
    const root = tempStudio(), project = join(root, 'projects/demo/campaigns/launch'); mkdirSync(project, { recursive: true });
    const io = fakeIO({ cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: join(root, 'studio.yml') }, run: async (_cmd, _args, opts) => {
      const dir = join(opts!.cwd!, 'assets/card'); mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'asset.yml'), content); return '';
    } });
    await assert.rejects(runAgentInWorkspace({ config: loadConfig(io), io, projectDir: project, files: {}, allowOut: [/^assets\/card\/asset\.yml$/], prompt: 'write', timeoutMs: 1000 }), expected);
    assert.equal(existsSync(join(project, 'assets/card/asset.yml')), false);
  }
});

test('workspace rejects traversal and malformed embed IDs before write-back', async () => {
  for (const id of ['../../x', 'Upper', 'a--b', '-a', 'a-', 'a/b', '']) {
    const root = tempStudio(), project = join(root, 'projects/demo/campaigns/launch'); mkdirSync(project, { recursive: true });
    const io = fakeIO({ cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: join(root, 'studio.yml') }, run: async (_cmd, _args, opts) => {
      const dir = join(opts!.cwd!, 'assets/card'); mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'asset.yml'), stringify({ id: 'card', kind: 'card', embeds: [id] })); return '';
    } });
    await assert.rejects(runAgentInWorkspace({ config: loadConfig(io), io, projectDir: project, files: {}, allowOut: [/^assets\/card\/asset\.yml$/], prompt: 'write', timeoutMs: 1000 }), /embeds.*asset ID slugs/);
    assert.equal(existsSync(join(project, 'assets/card/asset.yml')), false);
  }
});

test('workspace accepts required metadata for each kind and rejects invalid video aspect lists', async () => {
  const root = tempStudio(), project = join(root, 'projects/demo/campaigns/launch'); mkdirSync(project, { recursive: true });
  const kinds = ['card', 'poster', 'carousel', 'logo', 'diagram', 'video', 'terminal-demo', 'illustration', 'voiceover'];
  let calls = 0;
  const io = fakeIO({ cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: join(root, 'studio.yml') }, run: async (_cmd, args, opts) => {
    calls++;
    for (const kind of kinds) {
      const dir = join(opts!.cwd!, 'assets', kind); mkdirSync(dir, { recursive: true });
      const meta: Record<string, unknown> = { id: kind, kind };
      if (kind === 'video') meta.aspects = calls === 1 ? ['9:16', '9:16', '4:3'] : ['9:16', '1:1', '16:9'];
      writeFileSync(join(dir, 'asset.yml'), stringify(meta));
    }
    if (calls === 2) {
      assert.match(args.at(-1)!, /aspects\[1\].*duplicated/);
      assert.match(args.at(-1)!, /aspects\[2\].*4:3/);
    }
    return '';
  } });
  await runAgentInWorkspace({ config: loadConfig(io), io, projectDir: project, files: {}, allowOut: [/^assets\/[^/]+\/asset\.yml$/], prompt: 'write', timeoutMs: 1000 });
  assert.equal(calls, 2);
  for (const kind of kinds) assert.equal(parse(readFileSync(join(project, 'assets', kind, 'asset.yml'), 'utf8')).kind, kind);
});
