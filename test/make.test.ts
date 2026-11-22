import { strict as assert } from 'node:assert';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { stringify, parse } from 'yaml';
import { loadConfig } from '../src/config.ts';
import { readPlan } from '../src/plan.ts';
import { runAgentInWorkspace } from '../src/workspace.ts';
import { run as render } from '../src/commands/render.ts';
import { fakeIO, tempStudio } from './helpers.ts';

const item = { platform: 'devto', type: 'text', angle: 'Useful angle', hooks: ['One', 'Two', 'Three'], assets: [] };
test('plan validates three hooks and safe unique asset ids', () => {
  const dir = tempStudio({ 'plan.yml': stringify([item]) });
  assert.equal(readPlan(dir)[0].platform, 'devto');
  writeFileSync(join(dir, 'plan.yml'), stringify([{ ...item, hooks: ['one'] }]));
  assert.throws(() => readPlan(dir), /three hooks/);
  writeFileSync(join(dir, 'plan.yml'), stringify([{ ...item, assets: [{ id: '../escape', kind: 'card', brief: 'x' }] }]));
  assert.throws(() => readPlan(dir), /Invalid asset/);
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
