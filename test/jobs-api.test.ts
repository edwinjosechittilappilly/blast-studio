import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer, request } from 'node:http';
import { rmSync, watch, writeFileSync } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../src/config.ts';
import { handleJobsApi } from '../src/dashboard/jobs-api.ts';
import { startDashboard } from '../src/dashboard/server.ts';
import { findJob } from '../src/jobs/runner.ts';
import { fakeIO, tempStudio } from './helpers.ts';

test('jobs API enforces host, session, origin, header and argument schemas', async () => {
  const root = tempStudio({ 'projects/demo/project.yml': 'name: Demo\ncreatedAt: 2025-01-01\n', 'projects/demo/campaigns/launch/brief.md': '# Brief' }), io = fakeIO({ cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: 'studio.yml', PATH: process.env.PATH } }), config = loadConfig(io);
  let port = 0;
  const ready = Promise.withResolvers<void>();
  const server = createServer(async (req, res) => {
    if (req.url === '/ready') { res.end('ok'); ready.resolve(); return; }
    if (!await handleJobsApi(req, res, { config, port, cwd: io.cwd, env: io.env, sessionCheck: r => r.headers.cookie === 'bs=valid' })) { res.writeHead(404); res.end(); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string'); port = address.port;
  const host = `127.0.0.1:${port}`;
  async function call(method: string, path: string, headers: Record<string, string> = {}, data = '') {
    return await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port, method, path, headers: { host, ...headers } }, res => {
        let body = ''; res.setEncoding('utf8'); res.on('data', chunk => body += chunk); res.on('end', () => resolve({ status: res.statusCode!, body }));
      }); req.on('error', reject); req.end(data);
    });
  }
  try {
    assert.equal((await call('GET', '/api/jobs', { host: 'evil.test' })).status, 421);
    assert.equal((await call('GET', '/api/jobs')).status, 401);
    config.images.provider = 'none';
    const operations = await call('GET', '/api/operations', { cookie: 'bs=valid' });
    assert.equal(operations.status, 200);
    const metadata = JSON.parse(operations.body);
    assert.ok(Object.hasOwn(metadata, 'plan'));
    for (const name of ['new', 'brief', 'plan', 'make', 'render', 'review', 'revise', 'accept', 'confirm', 'export', 'mark', 'status', 'history', 'restore', 'feedback list', 'feedback add', 'feedback rm']) {
      assert.equal(metadata[name].fields.campaign.kind, 'campaign', name);
    }
    assert.equal(metadata['campaign rename'].fields.source.kind, 'campaign');
    assert.equal(metadata['campaign rename'].fields.destination.kind, 'campaign');
    assert.equal(metadata.accept.fields.platform.kind, 'id');
    for (const name of ['new', 'render', 'revise', 'plan']) assert.equal(metadata[name].requiresTTY, false, name);
    assert.equal((await call('GET', '/api/jobs', { cookie: 'bs=valid' })).status, 200);
    const headers = { cookie: 'bs=valid', origin: `http://${host}`, 'x-requested-with': 'bstudio' };
    assert.equal((await call('POST', '/api/jobs', { ...headers, origin: 'http://evil.test' }, '{}')).status, 403);
    assert.equal((await call('POST', '/api/jobs', { cookie: 'bs=valid', origin: `http://${host}` }, '{}')).status, 403);
    assert.equal((await call('POST', '/api/jobs', headers, JSON.stringify({ op: 'sh', args: {} }))).status, 400);
    assert.equal((await call('POST', '/api/jobs', headers, JSON.stringify({ op: 'render', campaign: '../../escape', args: {} }))).status, 400);
    assert.equal((await call('POST', '/api/jobs', headers, ' '.repeat(16385))).status, 413);
    const secret = await call('POST', '/api/secrets', headers, JSON.stringify({ key: 'UNKNOWN', value: 'sensitive-value' }));
    assert.equal(secret.status, 400); assert.doesNotMatch(secret.body, /sensitive-value/);
    assert.equal((await call('GET', '/api/jobs/a0000000-0000-4000-8000-000000000000', headers)).status, 404);
    config.images.provider = 'omp';
    const ompMetadata = JSON.parse((await call('GET', '/api/operations', { cookie: 'bs=valid' })).body);
    for (const name of ['new', 'render', 'revise']) {
      assert.equal(ompMetadata[name].requiresTTY, true, name);
      const response = await call('POST', '/api/jobs', headers, JSON.stringify({ op: name, campaign: 'demo/launch', args: {} }));
      assert.equal(response.status, 422, name);
    }
    assert.equal(ompMetadata.plan.requiresTTY, false);
    const tty = await call('POST', '/api/jobs', headers, JSON.stringify({ op: 'render', campaign: 'demo/launch', args: {} }));
    assert.equal(tty.status, 422); assert.equal(JSON.parse(tty.body).command, 'bstudio render demo/launch');
    config.images.provider = 'none';
    const agent = `console.error("READY"); require("node:http").get("http://127.0.0.1:${port}/ready"); setInterval(()=>{},1000)`;
    writeFileSync(join(root, 'studio.yml'), `brand:\n  name: Demo\nagent:\n  command: ${JSON.stringify([process.execPath, '-e', agent])}\n`);
    const payload = JSON.stringify({ op: 'plan', campaign: 'demo/launch', args: {} });
    const started = await call('POST', '/api/jobs', headers, payload);
    assert.equal(started.status, 202);
    const id = JSON.parse(started.body).id as string;
    await ready.promise;
    const cli = spawnSync(process.execPath, ['bin/bstudio.mjs', 'plan', 'demo/launch'], { cwd: process.cwd(), env: { ...process.env, ...io.env, BSTUDIO_CONFIG: join(root, 'studio.yml') }, encoding: 'utf8' });
    assert.equal(cli.status, 1); assert.match(cli.stderr, /locked by/);
    assert.equal((await call('POST', '/api/jobs', headers, payload)).status, 409);
    assert.match((await call('GET', `/api/jobs/${id}/log`, headers)).body, /READY/);
    const finished = Promise.withResolvers<void>();
    const watcher = watch(join(root, 'projects/demo/campaigns/launch/logs/jobs'), () => {
      try { if (findJob(root, id).state === 'cancelled') { watcher.close(); finished.resolve(); } } catch { /* record replacement in progress */ }
    });
    assert.equal((await call('POST', `/api/jobs/${id}/cancel`, headers)).status, 200);
    if (findJob(root, id).state === 'cancelled') { watcher.close(); finished.resolve(); }
    await finished.promise;
    const logPath = join(root, 'projects/demo/campaigns/launch/logs/jobs', `${id}.log`);
    writeFileSync(logPath, 'first\nsecond\nthird\n');
    const readLog = async (query = '') => JSON.parse((await call('GET', `/api/jobs/${id}/log${query}`, headers)).body).log;
    assert.equal(await readLog(), 'first\nsecond\nthird\n');
    assert.equal(await readLog('?tail=0'), '');
    assert.equal(await readLog('?tail=1'), 'third');
    assert.equal(await readLog('?tail=2'), 'second\nthird');
    assert.equal(await readLog('?tail=10'), 'first\nsecond\nthird');
    writeFileSync(logPath, 'first\nsecond');
    assert.equal(await readLog('?tail=1'), 'second');
    writeFileSync(logPath, 'first\n\n');
    assert.equal(await readLog('?tail=1'), '');
    assert.equal(await readLog('?tail=2'), 'first\n');
    writeFileSync(logPath, '');
    assert.equal(await readLog('?tail=1'), '');
    assert.equal((await call('GET', `/api/jobs/${id}/log?tail=-1`, headers)).status, 400);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); rmSync(root, { recursive: true, force: true }); }
});

test('dashboard starts, polls, reads and cancels a job over HTTP', { timeout: 15000 }, async () => {
  const root = tempStudio({
    'projects/demo/project.yml': 'name: Demo\ncreatedAt: 2025-01-01\n',
    'projects/demo/campaigns/launch/brief.md': '# Brief',
  });
  const ready = Promise.withResolvers<void>();
  const signal = createServer((_req, res) => { res.end('ok'); ready.resolve(); });
  await new Promise<void>(resolve => signal.listen(0, '127.0.0.1', resolve));
  const address = signal.address(); assert.ok(address && typeof address !== 'string');
  const agent = `require("node:net").createServer().listen(0, "127.0.0.1", () => { console.log("job output ready"); require("node:http").get("http://127.0.0.1:${address.port}/"); })`;
  writeFileSync(join(root, 'studio.yml'), `brand:\n  name: Demo\nagent:\n  command: ${JSON.stringify([process.execPath, '-e', agent])}\n`);
  const io = fakeIO({ cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: join(root, 'studio.yml'), PATH: process.env.PATH } });
  const dashboard = await startDashboard(io, { port: 0 });
  const base = `http://127.0.0.1:${dashboard.port}`;
  let id = '';
  let watcher: FSWatcher | undefined;
  let cookie = '';
  try {
    const exchange = await fetch(dashboard.url, { redirect: 'manual' });
    assert.equal(exchange.status, 302);
    cookie = exchange.headers.get('set-cookie') ?? ''; assert.ok(cookie);
    const headers = { cookie, origin: base, 'x-requested-with': 'bstudio', 'content-type': 'application/json' };
    const started = await fetch(`${base}/api/jobs`, {
      method: 'POST', headers, body: JSON.stringify({ op: 'plan', campaign: 'demo/launch', args: {} }),
    });
    assert.equal(started.status, 202);
    const job = await started.json() as { id: string; state: string; campaign: string };
    id = job.id;
    assert.equal(job.campaign, 'demo/launch');
    await ready.promise;
    const poll = await fetch(`${base}/api/jobs/${id}`, { headers });
    assert.equal(poll.status, 200);
    assert.equal((await poll.json() as { state: string }).state, 'running');
    const listing = await fetch(`${base}/api/jobs`, { headers });
    assert.equal(listing.status, 200);
    assert.ok((await listing.json() as { id: string; state: string }[]).some(item => item.id === id && item.state === 'running'));
    const matching = await fetch(`${base}/api/jobs?campaign=demo%2Flaunch`, { headers });
    assert.ok((await matching.json() as { id: string }[]).some(item => item.id === id));
    const other = await fetch(`${base}/api/jobs?campaign=demo%2Fother`, { headers });
    assert.deepEqual(await other.json(), []);
    const log = await fetch(`${base}/api/jobs/${id}/log`, { headers });
    assert.equal(log.status, 200);
    assert.match((await log.json() as { log: string }).log, /job output ready/);
    const emptyTail = await fetch(`${base}/api/jobs/${id}/log?tail=0`, { headers });
    assert.equal((await emptyTail.json() as { log: string }).log, '');
    assert.equal((await fetch(`${base}/api/jobs/${id}/log?tail=-1`, { headers })).status, 400);

    const finished = Promise.withResolvers<void>();
    const check = async () => {
      try {
        const response = await fetch(`${base}/api/jobs/${id}`, { headers });
        if (!response.ok) throw new Error(`Polling failed: ${response.status}`);
        if ((await response.json() as { state: string }).state === 'cancelled') finished.resolve();
      } catch (error) { finished.reject(error); }
    };
    watcher = watch(join(root, 'projects/demo/campaigns/launch/logs/jobs'), () => { void check(); });
    const cancelled = await fetch(`${base}/api/jobs/${id}/cancel`, { method: 'POST', headers });
    assert.equal(cancelled.status, 200);
    await check();
    await finished.promise;
    watcher.close(); watcher = undefined;
    assert.equal((await fetch(`${base}/api/jobs/${id}/cancel`, { method: 'POST', headers })).status, 409);
    id = '';
  } finally {
    watcher?.close();
    if (id) {
      if (cookie) await fetch(`${base}/api/jobs/${id}/cancel`, { method: 'POST', headers: { cookie, origin: base, 'x-requested-with': 'bstudio' } });
    }
    await new Promise<void>(resolve => dashboard.server.close(() => resolve()));
    await new Promise<void>(resolve => signal.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
  }
});
