import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, cpSync, mkdirSync, readFileSync, statSync, symlinkSync, unlinkSync, watch, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { request } from 'node:http';
import { createHmac } from 'node:crypto';
import { loadConfig } from '../src/config.ts';
import { loadPack } from '../src/packs.ts';
import { loadLibrary, latestSources } from '../src/library.ts';
import { startDashboard } from '../src/dashboard/server.ts';
import { startCliJob } from '../src/jobs/runner.ts';
import { run as status } from '../src/commands/status.ts';
import { fakeIO, tempStudio } from './helpers.ts';

function fixture() {
  const root = tempStudio({
    'studio.yml': '# keep this comment\nbrand:\n  name: Demo\nbudget:\n  monthlyUsd: 10\n  perProjectUsd: 0\n',
    'projects/acme/project.yml': 'name: Acme\ncreatedAt: 2025-01-01\n',
    'projects/acme/campaigns/launch/brief.md': '## [E1] A launch\nstatus: shipped\nReady.',
    'projects/acme/campaigns/launch/plan.yml': '- platform: linkedin\n  type: image\n  angle: launch\n  hooks: [One, Two, Three]\n  assets: [{id: card, kind: card, brief: Launch}]\n',
    'projects/acme/campaigns/launch/posts/linkedin.md': '---\nplatform: linkedin\nevidence: [E1]\nmedia: []\ntitle: The launch\n---\nHello world',
    'projects/acme/campaigns/launch/reviews/linkedin.json': JSON.stringify({ platform: 'linkedin', verdict: 'pass', total: 90, scores: [] }),
    'projects/acme/campaigns/launch/assets/card/asset.yml': 'id: card\nkind: card\noutputs: []\naiGenerated: false\ncostUsd: 0\n',
    'projects/acme/campaigns/launch/published.json': '{"linkedin":{"url":"https://example.com"}}',
    'updates/2099-01-01.md': '# Report\n## source-a: failed\n## source-b: manual\n## source-c: changed\n',
  });
  const io = fakeIO({ cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: join(root, 'studio.yml') } });
  return { root, io };
}
async function raw(port: number, path: string, host: string, cookie = '') {
  return await new Promise<number>((resolve, reject) => { const req = request({ host: '127.0.0.1', port, path, headers: { Host: host, cookie } }, res => { res.resume(); resolve(res.statusCode ?? 0); }); req.on('error', reject); req.end(); });
}
test('library and status derive live project data', async () => {
  const { root, io } = fixture(), config = loadConfig(io);
  assert.equal(loadLibrary(config, 'HELLO')[0].slug, 'acme/launch');
  assert.equal(loadLibrary(config, 'card')[0].assets[0].kind, 'card');
  assert.ok(loadLibrary(config)[0].published);
  writeFileSync(join(root, 'projects/acme/campaigns/launch/posts/linkedin.md'), '---\nplatform: linkedin\nevidence: []\nmedia: []\n---\nChanged text');
  assert.equal(loadLibrary(config, 'changed').length, 1);
  const unverified = latestSources(config).unverified;
  assert.ok(unverified.length > 0);
  const platformCount = new Set(unverified.map(field => field.split('.')[0])).size;
  await status([], io);
  assert.match(io.text(), /linkedin: pass \(90\/100\)/);
  assert.match(io.text(), /source-a: failed/);
  assert.match(io.text(), /source-c: changed/);
  assert.ok(io.stdout.includes(`Unverified pack fields: ${unverified.length} across ${platformCount} platforms (bstudio sources verify <id>)`));
  assert.ok(!io.stdout.includes(`  ${unverified[0]}`));
  assert.doesNotMatch(io.text(), /source-b: manual/);
  const verbose = fakeIO({ cwd: root, env: io.env });
  await status(['acme/launch', '--verbose'], verbose);
  assert.ok(unverified.every(field => verbose.stdout.includes(`  ${field}`)));
});
test('dashboard authenticates, contains media and validates settings', async t => {
  const { root, io } = fixture(); const started = await startDashboard(io, { port: 0 }); t.after(() => started.server.close());
  const base = `http://127.0.0.1:${started.port}`;
  assert.equal(await raw(started.port, '/', 'evil.example'), 421);
  assert.equal((await fetch(base + '/api/library')).status, 401);
  const expired = await fetch(base + '/', { headers: { Accept: 'text/html' } });
  assert.equal(expired.status, 401);
  assert.equal(expired.headers.get('content-security-policy'), "default-src 'none'; style-src 'self'; font-src 'self' data:; base-uri 'none'");
  const exchange = await fetch(started.url, { redirect: 'manual' }); assert.equal(exchange.status, 302);
  const cookie = exchange.headers.get('set-cookie')!; assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/);
  assert.equal((await fetch(started.url, { redirect: 'manual' })).status, 401);
  const headers = { cookie, origin: base, 'X-Requested-With': 'bstudio', 'Content-Type': 'application/json' };
  assert.equal((await fetch(base + '/api/budget', { method: 'PUT', headers: { ...headers, origin: 'http://evil.test' }, body: '{}' })).status, 403);
  assert.equal((await fetch(base + '/api/budget', { method: 'PUT', headers: { cookie, 'X-Requested-With': 'bstudio' }, body: '{}' })).status, 403);
  assert.equal((await fetch(base + '/api/library', { headers })).status, 200);
  const html = await fetch(base + '/', { headers }); assert.equal(html.status, 200);
  assert.match(html.headers.get('content-security-policy') ?? '', /font-src 'self' data:/);
  assert.equal((await fetch(base + '/api/budget', { method: 'PUT', headers, body: JSON.stringify({ monthlyUsd: -1, perProjectUsd: 0 }) })).status, 400);
  assert.equal((await fetch(base + '/api/budget', { method: 'PUT', headers, body: JSON.stringify({ monthlyUsd: 25, perProjectUsd: 5 }) })).status, 200);
  assert.match(readFileSync(join(root, 'studio.yml'), 'utf8'), /# keep this comment/); assert.equal(loadConfig(io).budget.monthlyUsd, 25);
  assert.equal((await fetch(base + '/api/providers', { method: 'PUT', headers, body: JSON.stringify({ images: 'bogus', voice: 'none' }) })).status, 400);
  assert.equal((await fetch(base + '/api/providers', { method: 'PUT', headers, body: JSON.stringify({ images: 'gemini', voice: 'openai' }) })).status, 200);
  assert.equal((await fetch(base + '/api/project/acme%2Flaunch', { method: 'PUT', headers, body: '{}' })).status, 404);
  symlinkSync(join(root, 'studio.yml'), join(root, 'projects/acme/campaigns/launch/leak'));
  assert.equal((await fetch(base + '/media/acme/launch/leak', { headers })).status, 403);
  assert.ok([403, 404].includes(await raw(started.port, '/media/acme/launch/%2e%2e/studio.yml', `127.0.0.1:${started.port}`, cookie)));
  mkdirSync(join(root, 'projects/acme/campaigns/launch/assets/movie'), { recursive: true }); writeFileSync(join(root, 'projects/acme/campaigns/launch/assets/movie/test.mp4'), 'abcdef');
  const range = await fetch(base + '/media/acme/launch/assets/movie/test.mp4', { headers: { ...headers, Range: 'bytes=1-3' } }); assert.equal(range.status, 206); assert.equal(await range.text(), 'bcd');
  assert.match(range.headers.get('content-security-policy') ?? '', /sandbox/);
  writeFileSync(join(root, 'projects/acme/campaigns/launch/assets/movie/test.pdf'), '%PDF-1.4\n');
  const pdf = await fetch(base + '/media/acme/launch/assets/movie/test.pdf', { headers });
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.equal(pdf.headers.get('content-security-policy'), "default-src 'none'");
  assert.equal(await pdf.text(), '%PDF-1.4\n');
});

test('missing dashboard assets produce a protected HTML error', async t => {
  const root = tempStudio(), source = fileURLToPath(new URL('../src/', import.meta.url));
  cpSync(source, join(root, 'src'), {
    recursive: true,
    filter: path => path !== join(source, 'dashboard/build') && path !== join(source, 'dashboard/static/app.js'),
  });
  symlinkSync(fileURLToPath(new URL('../node_modules/', import.meta.url)), join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  // The copied module resolves asset paths relative to its own location, unlike a static import.
  const { startDashboard: startWithoutAssets } = await import(pathToFileURL(join(root, 'src/dashboard/server.ts')).href);
  const io = fakeIO({ cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: join(root, 'studio.yml') } });
  const started = await startWithoutAssets(io, { port: 0 }); t.after(() => started.server.close());
  const cookie = (await fetch(started.url, { redirect: 'manual' })).headers.get('set-cookie')!;
  const response = await fetch(`http://127.0.0.1:${started.port}/`, { headers: { cookie } });
  assert.equal(response.status, 503);
  assert.match(response.headers.get('content-type') ?? '', /^text\/html/);
  assert.equal(response.headers.get('content-security-policy'), "default-src 'none'; style-src 'self'; font-src 'self' data:; base-uri 'none'");
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  writeFileSync(join(root, 'src/dashboard/static/app.js'), 'export {};\n');
  const available = await fetch(`http://127.0.0.1:${started.port}/`, { headers: { cookie } });
  assert.equal(available.status, 200);
  assert.match(available.headers.get('content-security-policy') ?? '', /font-src 'self' data:/);
});

test('feedback and revision endpoints validate targets and serialize runs', { timeout: 15000 }, async t => {
  const { root, io } = fixture();
  const started = await startDashboard(io, { port: 0 }); t.after(() => started.server.close());
  const base = `http://127.0.0.1:${started.port}`, path = '/api/projects/acme%2Flaunch/feedback';
  const post = (url: string, headers: Record<string, string>, data: unknown = {}) => fetch(base + url, { method: 'POST', headers, body: JSON.stringify(data) });
  assert.equal((await post(path, {}, { target: {}, note: 'hello' })).status, 401);
  const cookie = (await fetch(started.url, { redirect: 'manual' })).headers.get('set-cookie')!;
  const headers = { cookie, origin: base, 'X-Requested-With': 'bstudio', 'Content-Type': 'application/json' };
  assert.equal((await post(path, { ...headers, origin: 'http://evil.test' }, { target: {}, note: 'hello' })).status, 403);
  assert.equal((await post(path, { cookie }, { target: {}, note: 'hello' })).status, 403);
  assert.equal((await post('/api/projects/acme%2Flaunch/revise', { cookie })).status, 403);
  assert.equal((await post('/api/projects/BAD%2Flaunch/feedback', headers, { target: {}, note: 'hello' })).status, 400);
  assert.equal((await post(path, headers, { target: { platform: 'linkedin', asset: 'card' }, note: 'hello' })).status, 400);
  assert.equal((await post(path, headers, { target: { platform: 'missing' }, note: 'hello' })).status, 400);
  assert.equal((await post(path, headers, { target: { asset: 'missing' }, note: 'hello' })).status, 400);
  assert.equal((await post(path, headers, { target: {}, note: 'x'.repeat(4001) })).status, 400);
  assert.equal((await post(path, headers, { target: { platform: 'linkedin' }, note: 'Make it clearer' })).status, 201);
  assert.match(readFileSync(join(root, 'projects/acme/campaigns/launch/feedback.yml'), 'utf8'), /Make it clearer/);
  const existing = startCliJob(root, 'acme/launch', 'revise');
  try {
    assert.equal((await post('/api/projects/acme%2Flaunch/revise', headers)).status, 409);
    assert.equal((await (await fetch(base + '/api/projects/acme%2Flaunch/status', { headers })).json()).running, true);
  } finally { existing.finish(0); }
  unlinkSync(join(root, 'projects/acme/campaigns/launch/feedback.yml'));
  const response = await post('/api/projects/acme%2Flaunch/revise', headers);
  assert.equal(response.status, 202);
  const job = await response.json() as { id: string; command: string };
  assert.equal(job.command, 'bstudio revise acme/launch --feedback-only');
  const finished = Promise.withResolvers<void>();
  const check = async () => {
    try {
      const status = await (await fetch(`${base}/api/jobs/${job.id}`, { headers })).json() as { state: string };
      if (status.state === 'succeeded') finished.resolve();
      else if (status.state === 'failed' || status.state === 'cancelled') finished.reject(new Error(`Revision ${status.state}`));
    } catch (error) { finished.reject(error); }
  };
  const watcher = watch(join(root, 'projects/acme/campaigns/launch/logs/jobs'), () => { void check(); });
  try { await check(); await finished.promise; } finally { watcher.close(); }
  assert.equal((await (await fetch(base + '/api/projects/acme%2Flaunch/status', { headers })).json()).exitCode, 0);
});

test('project review payload includes rubric, threshold and maker review', async t => {
  const { root, io } = fixture();
  writeFileSync(join(root, 'projects/acme/campaigns/launch/posts/linkedin.md'), '---\nplatform: linkedin\nevidence: []\nmedia: []\nselfReview:\n  checks:\n    - {item: audience, pass: true}\n  summary: Ready\n---\nHello');
  const started = await startDashboard(io, { port: 0 }); t.after(() => started.server.close());
  const cookie = (await fetch(started.url, { redirect: 'manual' })).headers.get('set-cookie')!;
  const result = await (await fetch(`http://127.0.0.1:${started.port}/api/project/acme%2Flaunch`, { headers: { cookie } })).json();
  assert.equal(result.threshold, 75);
  assert.ok(result.rubric.linkedin.some((criterion: { question: string }) => criterion.question));
  assert.equal(result.posts[0].selfReview.summary, 'Ready');
});

test('dashboard sessions survive restarts and reject tampering and expiration', async t => {
  const { root, io } = fixture();
  const first = await startDashboard(io, { port: 0 }); t.after(() => first.server.close());
  const cookie = (await fetch(first.url, { redirect: 'manual' })).headers.get('set-cookie')!;
  const second = await startDashboard(io, { port: 0 }); t.after(() => second.server.close());
  const url = `http://127.0.0.1:${second.port}/api/library`;
  assert.equal((await fetch(url, { headers: { cookie } })).status, 200);
  assert.equal((await fetch(url, { headers: { cookie: cookie.replace(/bs=./, 'bs=x') } })).status, 401);
  const payload = `1.${'a'.repeat(32)}`, key = readFileSync(join(root, '.dashboard-key'), 'utf8'), signature = createHmac('sha256', key).update(payload).digest('hex');
  assert.equal((await fetch(url, { headers: { cookie: `bs=${payload}.${signature}` } })).status, 401);
  if (process.platform !== 'win32') assert.equal(statSync(join(root, '.dashboard-key')).mode & 0o777, 0o600);
  const future = `${Date.now() + 60000}.${'b'.repeat(32)}`;
  assert.equal((await fetch(url, { headers: { cookie: `bs=${future}.${'0'.repeat(64)}` } })).status, 401);
  const goodSignature = createHmac('sha256', key).update(future).digest('hex'), altered = `${Date.now() + 120000}.${'b'.repeat(32)}`;
  assert.equal((await fetch(url, { headers: { cookie: `bs=${altered}.${goodSignature}` } })).status, 401);
});

test('project review selects outline rubric and finds asset captions', async t => {
  const { root, io } = fixture();
  writeFileSync(join(root, 'projects/acme/campaigns/launch/posts/reddit.md'), '---\nplatform: reddit\nevidence: []\nmedia: []\n---\nOutline');
  writeFileSync(join(root, 'projects/acme/campaigns/launch/assets/card/asset.yml'), 'id: card\nkind: video\noutputs: [{file: out/9x16.mp4}, {file: out/captions.vtt}]\naiGenerated: false\n');
  const started = await startDashboard(io, { port: 0 }); t.after(() => started.server.close());
  const cookie = (await fetch(started.url, { redirect: 'manual' })).headers.get('set-cookie')!;
  const result = await (await fetch(`http://127.0.0.1:${started.port}/api/project/acme%2Flaunch`, { headers: { cookie } })).json();
  assert.deepEqual(result.rubric.reddit, loadPack('reddit').outlineRubric ?? []);
  assert.equal(result.captions['assets/card/out/9x16.mp4'], 'assets/card/out/captions.vtt');
});

test('dashboard rejects weak or malformed persistent keys', async () => {
  const { root, io } = fixture(), path = join(root, '.dashboard-key');
  writeFileSync(path, 'a'.repeat(64), { mode: 0o600 });
  if (process.platform !== 'win32') {
    chmodSync(path, 0o644);
    await assert.rejects(startDashboard(io, { port: 0 }), /chmod 600/);
  }
  if (process.platform !== 'win32') chmodSync(path, 0o600);
  writeFileSync(path, '');
  await assert.rejects(startDashboard(io, { port: 0 }), /Invalid dashboard signing key/);
});

test('dashboard reports revisions and stale locks after restart', async t => {
  const { root, io } = fixture(), lock = join(root, 'projects/acme/campaigns/launch/.bstudio-job.lock');
  writeFileSync(lock, JSON.stringify({ id: 'active', pid: process.pid }));
  const started = await startDashboard(io, { port: 0 }); t.after(() => started.server.close());
  const cookie = (await fetch(started.url, { redirect: 'manual' })).headers.get('set-cookie')!;
  const url = `http://127.0.0.1:${started.port}/api/projects/acme%2Flaunch/status`;
  const active = await (await fetch(url, { headers: { cookie } })).json();
  assert.equal(active.running, true); assert.equal(active.staleLock, false);
  writeFileSync(lock, JSON.stringify({ id: 'stale', pid: 2147483647 }));
  const stale = await (await fetch(url, { headers: { cookie } })).json();
  assert.equal(stale.running, false); assert.equal(stale.staleLock, true);
  unlinkSync(lock);
});

test('dashboard isolates same-named campaigns and rejects escaping paths', async t => {
  const { root, io } = fixture();
  const other = join(root, 'projects/other/campaigns/launch');
  mkdirSync(join(other, 'posts'), { recursive: true });
  writeFileSync(join(root, 'projects/other/project.yml'), 'name: Other\ncreatedAt: 2025-01-01\n');
  writeFileSync(join(other, 'posts/linkedin.md'), '---\nplatform: linkedin\nevidence: []\nmedia: []\n---\nOther campaign');
  writeFileSync(join(other, 'plan.yml'), '[]\n');
  writeFileSync(join(other, 'preview.txt'), 'other');
  writeFileSync(join(root, 'projects/acme/campaigns/launch/preview.txt'), 'acme');
  const started = await startDashboard(io, { port: 0 }); t.after(() => started.server.close());
  const cookie = (await fetch(started.url, { redirect: 'manual' })).headers.get('set-cookie')!;
  const base = `http://127.0.0.1:${started.port}`;
  const headers = { cookie, origin: base, 'X-Requested-With': 'bstudio', 'Content-Type': 'application/json' };
  const library = await (await fetch(base + '/api/library', { headers })).json();
  assert.deepEqual(library.map((entry: { slug: string }) => entry.slug).sort(), ['acme/launch', 'other/launch']);
  const budget = await (await fetch(base + '/api/budget', { headers })).json();
  assert.deepEqual(Object.keys(budget.projects).sort(), ['acme/launch', 'other/launch']);
  for (const project of ['acme', 'other']) {
    const review = await (await fetch(`${base}/api/project/${project}%2Flaunch`, { headers })).json();
    assert.equal(review.slug, `${project}/launch`);
    assert.equal(await (await fetch(`${base}/media/${project}/launch/preview.txt`, { headers })).text(), project);
  }
  const response = await fetch(base + '/api/projects/other%2Flaunch/feedback', { method: 'POST', headers, body: JSON.stringify({ target: {}, note: 'Other feedback' }) });
  assert.equal(response.status, 201);
  assert.match(readFileSync(join(other, 'feedback.yml'), 'utf8'), /Other feedback/);
  assert.equal((await (await fetch(base + '/api/project/acme%2Flaunch', { headers })).json()).feedback.length, 0);
  for (const path of ['/media/acme/launch/%2e%2e/preview.txt', '/media/acme/launch/%2e%2e%2fpreview.txt', '/media/acme/launch/%5c..%5cstudio.yml', '/api/project/acme%2F..', '/api/projects/acme%2F..%2Fother/status']) {
    assert.equal(await raw(started.port, path, `127.0.0.1:${started.port}`, cookie), 403);
  }
  for (const path of ['/api/project/launch', '/api/project/acme%2Flaunch%2Fextra', '/media/acme%2Flaunch/preview.txt', '/media/acme/launch%2Fother/preview.txt']) {
    assert.notEqual(await raw(started.port, path, `127.0.0.1:${started.port}`, cookie), 200);
  }
  symlinkSync(other, join(root, 'projects/acme/campaigns/escape'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.notEqual(await raw(started.port, '/media/acme/escape/preview.txt', `127.0.0.1:${started.port}`, cookie), 200);
  assert.notEqual(await raw(started.port, '/api/project/acme%2Fescape', `127.0.0.1:${started.port}`, cookie), 200);
});

test('revision runs are tracked by full campaign address', async t => {
  const { root, io } = fixture();
  mkdirSync(join(root, 'projects/other/campaigns/launch'), { recursive: true });
  writeFileSync(join(root, 'projects/other/project.yml'), 'name: Other\ncreatedAt: 2025-01-01\n');
  const first = startCliJob(root, 'acme/launch', 'revise');
  const second = startCliJob(root, 'other/launch', 'revise');
  try {
    const started = await startDashboard(io, { port: 0 }); t.after(() => started.server.close());
    const cookie = (await fetch(started.url, { redirect: 'manual' })).headers.get('set-cookie')!;
    const headers = { cookie }, base = `http://127.0.0.1:${started.port}/api/projects`;
    for (const project of ['acme', 'other']) {
      assert.equal((await (await fetch(`${base}/${project}%2Flaunch/status`, { headers })).json()).running, true);
    }
    first.finish(0);
    assert.equal((await (await fetch(`${base}/acme%2Flaunch/status`, { headers })).json()).running, false);
    assert.equal((await (await fetch(`${base}/other%2Flaunch/status`, { headers })).json()).running, true);
    second.finish(1);
    assert.equal((await (await fetch(`${base}/other%2Flaunch/status`, { headers })).json()).exitCode, 1);
  } finally { first.finish(0); second.finish(1); }
});
