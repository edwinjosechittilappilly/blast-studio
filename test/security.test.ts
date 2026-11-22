import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { loadConfig } from '../src/config.ts';
import { runAgentInWorkspace } from '../src/workspace.ts';
import { runReviewer } from '../src/review/reviewer.ts';
import { agentEnv, sandboxCommand } from '../src/agent-env.ts';
import { spawnSync } from 'node:child_process';
import { closeBrowser, renderHtml } from '../src/render/stills.ts';
import { runTool } from '../src/render/ffmpeg.ts';
import { fakeIO, tempStudio } from './helpers.ts';

after(async () => { await closeBrowser(); });

test('maker and reviewer inherit only allowed environment and retain real HOME', async () => {
  const root = tempStudio(), calls: { cwd?: string; env?: Record<string, string | undefined> }[] = [];
  const io = fakeIO({ cwd: root, env: { BSTUDIO_CONFIG: 'studio.yml', BSTUDIO_HOME: root, HOME: '/real-home', PATH: '/bin', GH_TOKEN: 'secret', MODEL_API_KEY: 'secret', AWS_SECRET_ACCESS_KEY: 'secret', CUSTOM_TOKEN: 'explicit' }, run: async (_cmd, _args, opts) => { calls.push(opts ?? {}); return '{"scores":[]}'; } });
  const config = loadConfig(io); config.agent.passEnv = ['CUSTOM_TOKEN'];
  await runAgentInWorkspace({ config, io, projectDir: join(root, 'projects/p'), files: {}, allowOut: [], prompt: 'test', timeoutMs: 1000 });
  await runReviewer({ config, io, post: { platform: 'x', path: 'x.md', body: 'text', media: [], evidence: [] }, rubric: [], brief: '', projectDir: join(root, 'projects/p') });
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.env?.HOME, '/real-home'); assert.notEqual(call.env?.TMPDIR, call.cwd);
    assert.equal(call.env?.GH_TOKEN, undefined); assert.equal(call.env?.MODEL_API_KEY, undefined); assert.equal(call.env?.AWS_SECRET_ACCESS_KEY, undefined);
    assert.equal(call.env?.CUSTOM_TOKEN, 'explicit'); assert.notEqual(call.cwd, root);
  }
  assert.match(io.stderr.join('\n'), /CUSTOM_TOKEN/);
});

test('video tools receive temporary home and reject environment-printing tapes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bstudio-security-'));
  try {
    let env: Record<string, string | undefined> | undefined;
    const io = fakeIO({ cwd: dir, env: { HOME: '/real-home', PATH: '/bin', GH_TOKEN: 'secret', XDG_CONFIG_HOME: '/secret' }, run: async (_cmd, _args, opts) => { env = opts?.env; return ''; } });
    await runTool(io, 'hyperframes', 'hyperframes', []);
    assert.notEqual(env?.HOME, '/real-home'); assert.equal(env?.GH_TOKEN, undefined); assert.equal(env?.XDG_CONFIG_HOME, undefined);
    for (const line of ['Type "env"', 'Type "printenv"', 'Type "echo $GH_TOKEN"', 'Env SECRET "printenv"']) {
      writeFileSync(join(dir, 'demo.tape'), `${line}\n`);
      await assert.rejects(runTool(io, 'vhs', 'vhs', ['demo.tape'], dir), /cannot print environment/);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('OS sandbox denies reading the studio root and writes outside the workspace', () => {
  if (process.platform !== 'darwin') return;
  const root = tempStudio({ '.env': 'secret' }), work = mkdtempSync(join(tmpdir(), 'bstudio-work-')), temp = mkdtempSync(join(tmpdir(), 'bstudio-temp-'));
  try {
    const io = fakeIO({ cwd: root, env: { HOME: process.env.HOME, PATH: process.env.PATH, BSTUDIO_HOME: root, BSTUDIO_CONFIG: 'studio.yml' } });
    const config = loadConfig(io), env = agentEnv(io, { temp });
    const wrapped = sandboxCommand(io, config, work, temp, '/bin/sh', ['-c', `cat \"$1\" >/dev/null; echo $?; touch \"$2\" 2>/dev/null; echo $?`, 'sh', join(root, '.env'), join(root, 'write')]);
    const result = spawnSync(wrapped.command, wrapped.args, { cwd: work, env, encoding: 'utf8' });
    assert.equal(result.status, 0); assert.deepEqual(result.stdout.trim().split('\n'), ['1', '1']);
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(work, { recursive: true, force: true }); rmSync(temp, { recursive: true, force: true }); }
});

test('API-billed maker reserves and settles reported usage', async () => {
  const root = tempStudio(), io = fakeIO({ cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: 'studio.yml' }, run: async () => JSON.stringify({ total_cost_usd: 0.2, usage: { input_tokens: 3 } }) });
  const config = loadConfig(io); config.budget.monthlyUsd = 1; config.budget.perProjectUsd = 1;
  config.agent.billing = 'api'; config.agent.maxUsdPerRun = 0.5;
  await runAgentInWorkspace({ config, io, projectDir: join(root, 'projects/p'), files: {}, allowOut: [], prompt: '', timeoutMs: 1000 });
  const ledger = readFileSync(join(root, 'ledger.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assert.equal(ledger[0].type, 'reserved'); assert.equal(ledger[0].usd, 0.5);
  assert.equal(ledger[1].type, 'settled'); assert.equal(ledger[1].usd, 0.2); assert.deepEqual(ledger[1].usage, { input_tokens: 3 });
});

test('a prompt starting with a SKILL.md frontmatter dash is never passed as a CLI flag', async () => {
  const root = tempStudio(), argvs: string[][] = [];
  const io = fakeIO({ cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: 'studio.yml' }, run: async (_cmd, args) => { argvs.push(args); return ''; } });
  const config = loadConfig(io); config.agent.sandbox = 'off';
  await runAgentInWorkspace({ config, io, projectDir: join(root, 'projects/p'), files: {}, allowOut: [], prompt: '---\nname: studio-reviewer\n---\nReview this.', timeoutMs: 1000 });
  const prompt = argvs[0].at(-1)!;
  assert.ok(!prompt.startsWith('-'), `prompt must not start with a dash: ${prompt.slice(0, 20)}`);
  assert.match(prompt, /name: studio-reviewer/);
});

test('HTML render blocks private files, network and symlink escapes while allowing sibling outputs', { timeout: 20000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bstudio-security-render-'));
  try {
    const asset = join(dir, 'assets/a'), sibling = join(dir, 'assets/b/out'); mkdirSync(asset, { recursive: true }); mkdirSync(sibling, { recursive: true });
    const secret = join(dir, '.env'), source = join(dir, 'assets/b/source.html'), image = join(sibling, 'image.svg');
    writeFileSync(secret, '<body style="background:red">secret</body>'); writeFileSync(source, '<body style="background:red">source</body>');
    writeFileSync(image, '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="red"/></svg>');
    symlinkSync(secret, join(asset, 'escape'));
    const url = (path: string) => pathToFileURL(path).href;
    const frames = [secret, source, '/etc/hosts', join(asset, 'escape')].map(path => `<iframe style="border:0;width:20px;height:20px" src="${url(path)}"></iframe>`).join('');
    const base = '<style>body{margin:0;background:white}iframe,img{border:0}</style>';
    const blocked = await renderHtml({ html: `${base}${frames}<img src=\"http://127.0.0.1:1/blocked\"><img src=\"${url(secret)}\">`, width: 100, height: 100, out: join(dir, 'blocked.png'), assetDir: asset, projectDir: dir });
    assert.ok(!blocked.loadedFiles.includes(realpathSync(secret))); assert.ok(!blocked.loadedFiles.includes(realpathSync(source))); assert.ok(!blocked.loadedFiles.includes(realpathSync('/etc/hosts')));
    const allowed = await renderHtml({ html: `${base}<img src="${url(image)}">`, width: 100, height: 100, out: join(dir, 'allowed.png'), assetDir: asset, projectDir: dir });
    assert.ok(allowed.loadedFiles.includes(realpathSync(image)));
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const redPixels = async (file: string) => page.evaluate(async data => {
        const image = new Image(); image.src = `data:image/png;base64,${data}`; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, image.width, image.height).data; let count = 0;
        for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 240 && pixels[i + 1] < 20 && pixels[i + 2] < 20) count++;
        return count;
      }, readFileSync(file).toString('base64'));
      assert.equal(await redPixels(blocked.file), 0);
      assert.ok(await redPixels(allowed.file) >= 300);
    } finally { await browser.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
