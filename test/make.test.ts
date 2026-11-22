import { strict as assert } from 'node:assert';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { stringify, parse } from 'yaml';
import { loadConfig } from '../src/config.ts';
import { readPlan } from '../src/plan.ts';
import { runAgentInWorkspace } from '../src/workspace.ts';
import { run as render } from '../src/commands/render.ts';
import { run as planCommand } from '../src/commands/plan.ts';
import { run as makeCommand } from '../src/commands/make.ts';
import { fakeIO, tempStudio } from './helpers.ts';

const item = { platform: 'devto', type: 'text', angle: 'Useful angle', hooks: ['One', 'Two', 'Three'], assets: [] };
test('plan validates three hooks and safe unique asset ids', () => {
  const dir = tempStudio({ 'plan.yml': stringify([item]) });
  assert.equal(readPlan(dir)[0].platform, 'devto');
  writeFileSync(join(dir, 'plan.yml'), stringify([{ ...item, hooks: ['one'] }]));
  assert.throws(() => readPlan(dir), /three hooks/);
  writeFileSync(join(dir, 'plan.yml'), stringify([{ ...item, assets: [{ id: '../escape', kind: 'card', brief: 'x' }] }]));
  assert.throws(() => readPlan(dir), /devto\.assets\[0\]\.id/);
});
test('shared assets are allowed unless their kind or aspect conflicts; validation collects field errors', () => {
  const dir = tempStudio(), asset = { id: 'shared', kind: 'carousel', brief: 'x', aspect: '1:1' };
  writeFileSync(join(dir, 'plan.yml'), stringify([{ ...item, assets: [asset] }, { ...item, platform: 'linkedin', assets: [asset] }]));
  assert.equal(readPlan(dir).length, 2);
  writeFileSync(join(dir, 'plan.yml'), stringify([{ ...item, assets: [asset] }, { ...item, platform: 'linkedin', type: 'bad', assets: [{ ...asset, kind: 'image', aspect: '9:16' }] }]));
  assert.throws(() => readPlan(dir), (error: Error) => /linkedin\.type "bad"/.test(error.message) && /linkedin\.assets\[0\]\.kind "image"/.test(error.message) && /linkedin\.assets\[0\]\.aspect "9:16"/.test(error.message));
});
test('plan repairs once in the same workspace and retains rejected plan', async () => {
  const root = tempStudio({ 'studio.yml': 'brand: {name: Demo}\nplatforms: [devto]\n', 'projects/demo/brief.md': '## [E1] Idea\nTest\n' });
  const project = join(root, 'projects/demo'); let calls = 0, cwd = '';
  const io = fakeIO({ cwd: root, env: { BSTUDIO_CONFIG: join(root, 'studio.yml'), BSTUDIO_HOME: root }, run: async (_cmd, args, opts) => {
    calls++; if (calls === 1) cwd = opts!.cwd!; else assert.equal(opts!.cwd, cwd);
    assert.notEqual(opts!.env!.TMPDIR, opts!.cwd);
    assert.match(args.at(-1)!, /voiceover/);
    if (calls === 2) assert.match(args.at(-1)!, /fix exactly these problems/i);
    writeFileSync(join(cwd, 'plan.yml'), stringify([{ ...item, type: calls === 1 ? 'wrong' : 'article' }]));
    return '';
  } });
  assert.equal(await planCommand(['demo'], io), 0); assert.equal(calls, 2);
  assert.match(readFileSync(join(project, '.rejected/plan.yml'), 'utf8'), /wrong/);
  assert.equal(readPlan(project)[0].type, 'article');
});
test('maker repairs invalid post and asset, preserving rejected files', async () => {
  const root = tempStudio({ 'studio.yml': 'brand: {name: Demo}\nplatforms: [devto]\n', 'projects/demo/brief.md': '## [E1] Idea\nTest\n', 'projects/demo/plan.yml': stringify([{ ...item, assets: [{ id: 'card', kind: 'card', brief: 'x' }] }]) });
  let calls = 0;
  const io = fakeIO({ cwd: root, env: { BSTUDIO_CONFIG: join(root, 'studio.yml'), BSTUDIO_HOME: root }, run: async (_cmd, args, opts) => {
    calls++; const dir = opts!.cwd!; mkdirSync(join(dir, 'posts'), { recursive: true }); mkdirSync(join(dir, 'assets/card'), { recursive: true });
    if (calls === 2) assert.match(args.at(-1)!, /fix exactly these problems/i);
    writeFileSync(join(dir, 'posts/devto.md'), calls === 1 ? 'not frontmatter' : '---\nplatform: devto\nevidence: [E1]\nmedia: []\n---\nHello\n');
    writeFileSync(join(dir, 'assets/card/asset.yml'), stringify({ id: 'card', kind: calls === 1 ? 'bad' : 'card' }));
    return '';
  } });
  assert.equal(await makeCommand(['demo'], io), 0); assert.equal(calls, 2);
  assert.equal(readFileSync(join(root, 'projects/demo/.rejected/posts/devto.md'), 'utf8'), 'not frontmatter');
  assert.match(readFileSync(join(root, 'projects/demo/.rejected/assets/card/asset.yml'), 'utf8'), /bad/);
});
test('a second invalid plan fails with all errors and rejected path', async () => {
  const root = tempStudio({ 'studio.yml': 'brand: {name: Demo}\nplatforms: [devto]\n', 'projects/demo/brief.md': 'Brief' }); let calls = 0;
  const io = fakeIO({ cwd: root, env: { BSTUDIO_CONFIG: join(root, 'studio.yml'), BSTUDIO_HOME: root }, run: async (_cmd, _args, opts) => {
    calls++; writeFileSync(join(opts!.cwd!, 'plan.yml'), stringify([{ ...item, type: 'wrong', angle: '' }])); return '';
  } });
  await assert.rejects(planCommand(['demo'], io), (error: Error) => /devto\.type "wrong"/.test(error.message) && /devto\.angle ""/.test(error.message) && error.message.includes('.rejected/plan.yml'));
  assert.equal(calls, 2);
});
test('ignored outputs are summarized and runtime temp files stay separate', async () => {
  const dir = tempStudio(); let runtime = '';
  const io = fakeIO({ cwd: dir, env: { BSTUDIO_CONFIG: join(dir, 'studio.yml'), BSTUDIO_HOME: dir }, run: async (_cmd, _args, opts) => {
    runtime = opts!.env!.TMPDIR!; assert.notEqual(runtime, opts!.cwd); writeFileSync(join(runtime, 'runtime-cache'), 'x');
    for (let i = 0; i < 20; i++) writeFileSync(join(opts!.cwd!, `ignored-${i}.txt`), 'x');
    return '';
  } });
  await runAgentInWorkspace({ config: loadConfig(io), io, projectDir: dir, files: {}, allowOut: [], prompt: 'write', timeoutMs: 1000 });
  assert.equal(existsSync(runtime), false); assert.equal(io.stderr.length, 1); assert.match(io.stderr[0], /Ignored 20/);
  assert.equal((io.stderr[0].match(/ignored-\d+\.txt/g) ?? []).length, 10); assert.doesNotMatch(io.stderr[0], /runtime-cache/);
});
test('agent receives no credentials and only allowed files copy back', async () => {
  const dir = tempStudio(), io = fakeIO({ cwd: dir, env: { BSTUDIO_CONFIG: join(dir, 'studio.yml'), BSTUDIO_HOME: dir, PATH: '/bin', OPENAI_API_KEY: 'secret', HOME: '/Users/me' }, run: async (_cmd, _args, opts) => {
    // No credentials reach the agent, but HOME does, so the agent CLI can use its own login; cwd is a temp workspace.
    assert.equal(opts?.env?.OPENAI_API_KEY, undefined); assert.equal(opts?.env?.HOME, '/Users/me'); assert.notEqual(opts?.cwd, dir);
    const cwd = opts!.cwd!; mkdirSync(join(cwd, 'posts'), { recursive: true }); mkdirSync(join(cwd, 'assets/a/out'), { recursive: true });
    writeFileSync(join(cwd, 'posts/devto.md'), '---\nplatform: devto\nevidence: [E1]\nmedia: []\n---\nHello\n');
    writeFileSync(join(cwd, 'assets/a/out/leak.txt'), 'no'); writeFileSync(join(cwd, 'secret.txt'), 'no'); return '';
  } });
  const result = await runAgentInWorkspace({ config: loadConfig(io), io, projectDir: dir, files: { 'brief.md': 'brief' }, allowOut: [/^posts\/devto\.md$/], prompt: 'write', timeoutMs: 1000 });
  assert.deepEqual(result.copied, ['posts/devto.md']); assert.ok(result.ignored.includes('secret.txt')); assert.equal(existsSync(join(dir, 'assets/a/out/leak.txt')), false);
});
test('slow: renders HTML, carousel and logo and inherits embedded AI provenance', async () => {
  const dir = tempStudio(), slug = 'demo', project = join(dir, 'projects', slug);
  const entries = [{ ...item, assets: [{ id: 'card', kind: 'card', brief: 'card' }, { id: 'slides', kind: 'carousel', brief: 'slides' }, { id: 'logo', kind: 'logo', brief: 'logo' }] }];
  const write = (path: string, value: string) => { mkdirSync(join(project, path, '..'), { recursive: true }); writeFileSync(join(project, path), value); };
  write('plan.yml', stringify(entries));
  for (const [id, kind] of [['card', 'card'], ['slides', 'carousel'], ['logo', 'logo']]) write(`assets/${id}/asset.yml`, stringify({ id, kind, provider: 'template', outputs: [], license: 'OFL', aiGenerated: id === 'logo', embeds: id === 'card' ? ['logo'] : [], size: { width: 200, height: 200 } }));
  const html = '<html><body style="margin:20px"><h1>Hello</h1></body></html>';
  write('assets/card/source.html', html); write('assets/slides/source/01.html', html); write('assets/slides/source/02.html', html);
  write('assets/logo/source.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="red"/></svg>');
  assert.equal(await render([slug], fakeIO({ cwd: dir, env: { BSTUDIO_CONFIG: join(dir, 'studio.yml'), BSTUDIO_HOME: dir } })), 0);
  assert.ok(existsSync(join(project, 'assets/slides/out/carousel.pdf'))); assert.ok(existsSync(join(project, 'assets/logo/out/favicon.ico')));
  const card = parse(readFileSync(join(project, 'assets/card/asset.yml'), 'utf8')); assert.equal(card.aiGenerated, true); assert.equal(card.outputs[0].file, 'out/image.png'); assert.ok(card.metrics.length);
});
test('slow: shared carousel renders once for identical platform dimensions and updates both posts', async () => {
  const root = tempStudio(), project = join(root, 'projects/demo');
  const asset = { id: 'shared', kind: 'carousel', brief: 'Explain', aspect: '1:1' };
  const write = (path: string, data: string) => { const target = join(project, path); mkdirSync(join(target, '..'), { recursive: true }); writeFileSync(target, data); };
  write('plan.yml', stringify([{ ...item, platform: 'linkedin', assets: [asset] }, { ...item, platform: 'instagram', assets: [asset] }]));
  write('assets/shared/asset.yml', stringify({ id: 'shared', kind: 'carousel', provider: 'template', outputs: [], license: 'OFL', aiGenerated: false, size: { width: 160, height: 160 } }));
  write('assets/shared/source/01.html', '<html><body style="margin:20px">Hello</body></html>');
  for (const platform of ['linkedin', 'instagram']) write(`posts/${platform}.md`, `---\nplatform: ${platform}\nevidence: [E1]\nmedia:\n  - asset: shared\n    file: old.png\n    alt: Slide\n    kind: image\n---\nHello\n`);
  await render(['demo'], fakeIO({ cwd: root, env: { BSTUDIO_CONFIG: join(root, 'studio.yml'), BSTUDIO_HOME: root } }));
  const meta = parse(readFileSync(join(project, 'assets/shared/asset.yml'), 'utf8'));
  assert.equal(meta.outputs.filter((o: { file: string }) => o.file.endsWith('.png')).length, 1);
  for (const platform of ['linkedin', 'instagram']) assert.match(readFileSync(join(project, `posts/${platform}.md`), 'utf8'), /assets\/shared\/out\/slide-1\.png/);
});
