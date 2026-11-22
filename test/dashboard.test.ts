import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { request } from 'node:http';
import { EventEmitter } from 'node:events';
import type { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { loadConfig } from '../src/config.ts';
import { loadLibrary, latestSources } from '../src/library.ts';
import { startDashboard } from '../src/dashboard/server.ts';
import { run as status } from '../src/commands/status.ts';
import { fakeIO, tempStudio } from './helpers.ts';

function fixture() {
  const root = tempStudio({
    'studio.yml': '# keep this comment\nbrand:\n  name: Demo\nbudget:\n  monthlyUsd: 10\n  perProjectUsd: 0\n',
    'projects/launch/brief.md': '## [E1] A launch\nstatus: shipped\nReady.',
    'projects/launch/posts/linkedin.md': '---\nplatform: linkedin\nevidence: [E1]\nmedia: []\ntitle: The launch\n---\nHello world',
    'projects/launch/reviews/linkedin.json': JSON.stringify({ platform: 'linkedin', verdict: 'pass', total: 90, scores: [] }),
    'projects/launch/assets/card/asset.yml': 'id: card\nkind: card\noutputs: []\naiGenerated: false\ncostUsd: 0\n',
    'projects/launch/published.json': '{"linkedin":{"url":"https://example.com"}}',
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
  assert.equal(loadLibrary(config, 'HELLO')[0].slug, 'launch');
  assert.equal(loadLibrary(config, 'card')[0].assets[0].kind, 'card');
  assert.ok(loadLibrary(config)[0].published);
  writeFileSync(join(root, 'projects/launch/posts/linkedin.md'), '---\nplatform: linkedin\nevidence: []\nmedia: []\n---\nChanged text');
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
  await status(['launch', '--verbose'], verbose);
  assert.ok(unverified.every(field => verbose.stdout.includes(`  ${field}`)));
});
test('dashboard authenticates, contains media and validates settings', async t => {
  const { root, io } = fixture(); const started = await startDashboard(io, { port: 0 }); t.after(() => started.server.close());
  const base = `http://127.0.0.1:${started.port}`;
  assert.equal(await raw(started.port, '/', 'evil.example'), 421);
  assert.equal((await fetch(base + '/api/library')).status, 401);
  const exchange = await fetch(started.url, { redirect: 'manual' }); assert.equal(exchange.status, 302);
  const cookie = exchange.headers.get('set-cookie')!; assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/);
  assert.equal((await fetch(started.url, { redirect: 'manual' })).status, 401);
  const headers = { cookie, 'X-Requested-With': 'bstudio', 'Content-Type': 'application/json' };
  assert.equal((await fetch(base + '/api/library', { headers })).status, 200);
  assert.equal((await fetch(base + '/api/budget', { method: 'PUT', headers, body: JSON.stringify({ monthlyUsd: -1, perProjectUsd: 0 }) })).status, 400);
  assert.equal((await fetch(base + '/api/budget', { method: 'PUT', headers, body: JSON.stringify({ monthlyUsd: 25, perProjectUsd: 5 }) })).status, 200);
  assert.match(readFileSync(join(root, 'studio.yml'), 'utf8'), /# keep this comment/); assert.equal(loadConfig(io).budget.monthlyUsd, 25);
  assert.equal((await fetch(base + '/api/providers', { method: 'PUT', headers, body: JSON.stringify({ images: 'bogus', voice: 'none' }) })).status, 400);
  assert.equal((await fetch(base + '/api/providers', { method: 'PUT', headers, body: JSON.stringify({ images: 'gemini', voice: 'openai' }) })).status, 200);
  assert.equal((await fetch(base + '/api/project/launch', { method: 'PUT', headers, body: '{}' })).status, 404);
  symlinkSync(join(root, 'studio.yml'), join(root, 'projects/launch/leak'));
  assert.equal((await fetch(base + '/media/launch/leak', { headers })).status, 403);
  assert.ok([403, 404].includes(await raw(started.port, '/media/launch/%2e%2e/studio.yml', `127.0.0.1:${started.port}`, cookie)));
  mkdirSync(join(root, 'projects/launch/assets/movie'), { recursive: true }); writeFileSync(join(root, 'projects/launch/assets/movie/test.mp4'), 'abcdef');
  const range = await fetch(base + '/media/launch/assets/movie/test.mp4', { headers: { ...headers, Range: 'bytes=1-3' } }); assert.equal(range.status, 206); assert.equal(await range.text(), 'bcd');
});

test('feedback and revision endpoints validate targets and serialize runs', async t => {
  const { root, io } = fixture();
  const child = Object.assign(new EventEmitter(), { unref() {} });
  const started = await startDashboard(io, { port: 0, spawnRevise: (() => child) as unknown as typeof spawn }); t.after(() => started.server.close());
  const base = `http://127.0.0.1:${started.port}`, path = '/api/projects/launch/feedback';
  const post = (url: string, headers: Record<string, string>, data: unknown = {}) => fetch(base + url, { method: 'POST', headers, body: JSON.stringify(data) });
  assert.equal((await post(path, {}, { target: {}, note: 'hello' })).status, 401);
  const cookie = (await fetch(started.url, { redirect: 'manual' })).headers.get('set-cookie')!;
  const headers = { cookie, 'X-Requested-With': 'bstudio', 'Content-Type': 'application/json' };
  assert.equal((await post(path, headers, { target: { platform: 'missing' }, note: 'hello' })).status, 400);
  assert.equal((await post(path, headers, { target: { asset: 'missing' }, note: 'hello' })).status, 400);
  assert.equal((await post(path, headers, { target: {}, note: 'x'.repeat(4001) })).status, 400);
  assert.equal((await post(path, headers, { target: { platform: 'linkedin' }, note: 'Make it clearer' })).status, 201);
  assert.match(readFileSync(join(root, 'projects/launch/feedback.yml'), 'utf8'), /Make it clearer/);
  assert.equal((await post('/api/projects/launch/revise', headers)).status, 202);
  assert.equal((await post('/api/projects/launch/revise', headers)).status, 409);
  assert.equal((await (await fetch(base + '/api/projects/launch/status', { headers })).json()).running, true);
  child.emit('exit', 0);
  assert.equal((await (await fetch(base + '/api/projects/launch/status', { headers })).json()).exitCode, 0);
});

test('project review payload includes rubric, threshold and maker review', async t => {
  const { root, io } = fixture();
  writeFileSync(join(root, 'projects/launch/posts/linkedin.md'), '---\nplatform: linkedin\nevidence: []\nmedia: []\nselfReview:\n  checks:\n    - {item: audience, pass: true}\n  summary: Ready\n---\nHello');
  const started = await startDashboard(io, { port: 0 }); t.after(() => started.server.close());
  const cookie = (await fetch(started.url, { redirect: 'manual' })).headers.get('set-cookie')!;
  const result = await (await fetch(`http://127.0.0.1:${started.port}/api/project/launch`, { headers: { cookie } })).json();
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
});
