import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
import { run as renderPreview } from '../src/commands/render-preview.ts';
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

test('provider keys are passed only for an API-billed role; publishing tokens remain forbidden', () => {
  const io = fakeIO({ cwd: '/tmp', env: { OPENAI_API_KEY: 'openai', GEMINI_API_KEY: 'gemini', GH_TOKEN: 'github' } });
  for (const key of ['OPENAI_API_KEY', 'GEMINI_API_KEY']) {
    assert.throws(() => agentEnv(io, { temp: '/tmp', passEnv: [key] }), /Disallowed/);
    assert.equal(agentEnv(io, { temp: '/tmp', billing: 'api', passEnv: [key] })[key], io.env[key]);
  }
  assert.throws(() => agentEnv(io, { temp: '/tmp', billing: 'api', passEnv: ['GH_TOKEN'] }), /Disallowed/);
});

test('video tools receive a temporary home without secrets', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bstudio-security-'));
  try {
    let env: Record<string, string | undefined> | undefined, command = '';
    const io = fakeIO({ cwd: dir, env: { HOME: '/real-home', PATH: '/bin', GH_TOKEN: 'secret', XDG_CONFIG_HOME: '/secret', BSTUDIO_CONFIG: 'studio.yml' }, run: async (cmd, _args, opts) => { command = cmd; env = opts?.env; return ''; } });
    writeFileSync(join(dir, 'studio.yml'), 'brand:\n  name: Test\n');
    const config = loadConfig(io);
    assert.equal(config.agent.sandbox, 'off');
    await runTool(io, 'hyperframes', 'hyperframes', [], dir, { config, workspace: dir });
    assert.equal(command, 'hyperframes');
    assert.notEqual(env?.HOME, '/real-home'); assert.equal(env?.GH_TOKEN, undefined); assert.equal(env?.XDG_CONFIG_HOME, undefined);
    for (const invalid of ['auto', 'invalid']) {
      writeFileSync(join(dir, 'studio.yml'), `agent:\n  sandbox: ${invalid}\n`);
      assert.throws(() => loadConfig(io), /agent\.sandbox must be on or off/);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('sandboxed HyperFrames can read browser caches but cannot modify them', async () => {
  if (process.platform !== 'darwin') return;
  const home = mkdtempSync(join(tmpdir(), 'bstudio-browser-home-')), root = tempStudio(), work = mkdtempSync(join(tmpdir(), 'bstudio-browser-work-'));
  try {
    const managed = join(home, '.cache/hyperframes'), shared = join(home, '.cache/puppeteer');
    for (const dir of [managed, shared]) { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'browser'), 'ok'); }
    const io = fakeIO({ cwd: root, env: { HOME: home, PATH: process.env.PATH, BSTUDIO_HOME: root, BSTUDIO_CONFIG: 'studio.yml' },
      run: async (command, args, opts) => {
        const result = spawnSync(command, args, { ...opts, encoding: 'utf8' });
        assert.equal(result.stdout, 'okok');
        assert.ok(existsSync(join(managed, 'locks', 'allowed')));
        assert.match(result.stderr, /Operation not permitted/);
        assert.notEqual(result.status, 0);
        return '';
      } });
    const config = loadConfig(io); config.agent.sandbox = 'on';
    await runTool(io, 'hyperframes', '/bin/sh', ['-c', 'cat "$HYPERFRAMES_CACHE_DIR/browser" "$HOME/.cache/puppeteer/browser"; touch "$HYPERFRAMES_CACHE_DIR/locks/allowed"; touch "$HYPERFRAMES_CACHE_DIR/forbidden"'], work, { config, workspace: work });
  } finally { rmSync(home, { recursive: true, force: true }); rmSync(root, { recursive: true, force: true }); rmSync(work, { recursive: true, force: true }); }
});

test('Linux HyperFrames keeps its private cache visible through bwrap', async t => {
  if (process.platform !== 'linux' || spawnSync('bwrap', ['--ro-bind', '/', '/', '--', '/bin/true'], { stdio: 'ignore' }).status !== 0) {
    t.skip('usable Linux bwrap required'); return;
  }
  const home = process.env.HOME!;
  const fixture = mkdtempSync(join(home, '.bstudio-cache-test-')), root = tempStudio({ '.env': 'secret' });
  const work = mkdtempSync(join(tmpdir(), 'bstudio-browser-work-')), cache = join(fixture, 'hyperframes');
  try {
    mkdirSync(cache, { mode: 0o700 }); writeFileSync(join(cache, 'browser'), 'ok');
    const io = fakeIO({ cwd: root, env: { HOME: home, PATH: process.env.PATH, BSTUDIO_HOME: root, BSTUDIO_CONFIG: 'studio.yml', HYPERFRAMES_CACHE_DIR: cache },
      run: async (command, args, opts) => {
        const result = spawnSync(command, args, { ...opts, encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stdout, 'ok');
        return '';
      } });
    const config = loadConfig(io); config.agent.sandbox = 'on';
    await runTool(io, 'hyperframes', '/bin/sh', ['-c', 'test "$HOME" = "$1" && test "$HYPERFRAMES_CACHE_DIR" = "$2" && for dir in "$HOME" "$(dirname "$HOME")" /; do owner=$(stat -c %u "$dir"); if [ "$owner" != 0 ] && [ "$owner" != "$(id -u)" ]; then echo "untrusted owner $owner at $dir" >&2; exit 1; fi; done && cat "$2/browser" && touch "$2/locks/allowed" && ! touch "$2/forbidden" 2>/dev/null && ! cat "$3" 2>/dev/null', 'sh', home, cache, join(root, '.env')], work, { config, workspace: work });
  } finally { rmSync(fixture, { recursive: true, force: true }); rmSync(root, { recursive: true, force: true }); rmSync(work, { recursive: true, force: true }); }
});

test('OS sandbox denies reading the studio root and writes outside the workspace', () => {
  if (process.platform !== 'darwin') return;
  const root = tempStudio({ '.env': 'secret' }), work = mkdtempSync(join(tmpdir(), 'bstudio-work-')), temp = mkdtempSync(join(tmpdir(), 'bstudio-temp-'));
  try {
    const io = fakeIO({ cwd: root, env: { HOME: process.env.HOME, PATH: process.env.PATH, BSTUDIO_HOME: root, BSTUDIO_CONFIG: 'studio.yml' } });
    const config = loadConfig(io), env = agentEnv(io, { temp });
    config.agent.sandbox = 'on';
    const outside = join(root, 'write'), secret = join(root, '.env');
    const wrapped = sandboxCommand(io, config, work, temp, '/bin/sh', ['-c', 'echo x > "$1"; echo x 2>/dev/null; cat "$2"; touch "$3"; touch "$4"; touch "$5"', 'sh', join(work, 'ok'), secret, outside, join(process.env.HOME!, '.omp/agent/AGENTS.md'), join(process.env.HOME!, 'Library/Caches/ms-playwright')]);
    const result = spawnSync(wrapped.command, wrapped.args, { cwd: work, env, encoding: 'utf8' });
    assert.equal(readFileSync(join(work, 'ok'), 'utf8'), 'x\n');
    for (const target of [secret, outside, join(process.env.HOME!, '.omp/agent/AGENTS.md'), join(process.env.HOME!, 'Library/Caches/ms-playwright')]) {
      assert.ok(result.stderr.split('\n').some(line => line.includes(target) && line.includes('Operation not permitted')), result.stderr);
    }
    assert.doesNotMatch(result.stderr, /\/dev\/null.*Operation not permitted/);
    const render = sandboxCommand(io, config, work, temp, '/bin/cat', [secret], { render: true });
    const denied = spawnSync(render.command, render.args, { cwd: work, env, encoding: 'utf8' });
    assert.match(denied.stderr, /Operation not permitted/); assert.ok(denied.stderr.includes(secret));
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(work, { recursive: true, force: true }); rmSync(temp, { recursive: true, force: true }); }
});

test('preview permits neighboring files only inside a project asset', { timeout: 20000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bstudio-preview-security-'));
  try {
    const asset = join(dir, 'projects/p/assets/a'), outside = join(dir, 'outside');
    for (const path of [asset, outside]) {
      mkdirSync(path, { recursive: true });
      writeFileSync(join(path, 'red.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="red"/></svg>');
      writeFileSync(join(path, 'index.html'), '<style>body{margin:0}</style><img src="red.svg">');
      await renderPreview([join(path, 'index.html'), '--size', '20x20', '--out', join(path, 'result.png')], fakeIO({ cwd: dir }));
    }
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const pixel = async (file: string) => page.evaluate(async data => {
        const image = new Image(); image.src = `data:image/png;base64,${data}`; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 20;
        const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
        return Array.from(context.getImageData(0, 0, 1, 1).data);
      }, readFileSync(file).toString('base64'));
      assert.deepEqual(await pixel(join(asset, 'result.png')), [255, 0, 0, 255]);
      assert.notDeepEqual(await pixel(join(outside, 'result.png')), [255, 0, 0, 255]);
    } finally { await browser.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
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
