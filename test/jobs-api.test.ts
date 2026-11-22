import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { rmSync, watch, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../src/config.ts';
import { handleJobsApi } from '../src/dashboard/jobs-api.ts';
import { findJob } from '../src/jobs/runner.ts';
import { fakeIO, tempStudio } from './helpers.ts';

test('jobs API enforces host, session, origin, header and argument schemas', async () => {
  const root = tempStudio({ 'projects/demo/brief.md': '# Brief' }), io = fakeIO({ cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: 'studio.yml', PATH: process.env.PATH } }), config = loadConfig(io);
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
    assert.equal((await call('GET', '/api/jobs', { cookie: 'bs=valid' })).status, 200);
    const headers = { cookie: 'bs=valid', origin: `http://${host}`, 'x-requested-with': 'bstudio' };
    assert.equal((await call('POST', '/api/jobs', { ...headers, origin: 'http://evil.test' }, '{}')).status, 403);
    assert.equal((await call('POST', '/api/jobs', { cookie: 'bs=valid', origin: `http://${host}` }, '{}')).status, 403);
    assert.equal((await call('POST', '/api/jobs', headers, JSON.stringify({ operation: 'sh', args: {} }))).status, 400);
    assert.equal((await call('POST', '/api/jobs', headers, JSON.stringify({ operation: 'render', args: { campaign: '../../escape' } }))).status, 400);
    assert.equal((await call('POST', '/api/jobs', headers, ' '.repeat(16385))).status, 413);
    config.images.provider = 'omp';
    const tty = await call('POST', '/api/jobs', headers, JSON.stringify({ operation: 'render', args: { campaign: 'demo' } }));
    assert.equal(tty.status, 422); assert.equal(JSON.parse(tty.body).command, 'bstudio render demo');
    config.images.provider = 'none';
    const agent = `console.error("READY"); require("node:http").get("http://127.0.0.1:${port}/ready"); setInterval(()=>{},1000)`;
    writeFileSync(join(root, 'studio.yml'), `brand:\n  name: Demo\nagent:\n  command: ${JSON.stringify([process.execPath, '-e', agent])}\n`);
    const payload = JSON.stringify({ operation: 'plan', args: { campaign: 'demo' } });
    const started = await call('POST', '/api/jobs', headers, payload);
    assert.equal(started.status, 202);
    const id = JSON.parse(started.body).id as string;
    await ready.promise;
    assert.equal((await call('POST', '/api/jobs', headers, payload)).status, 409);
    assert.match((await call('GET', `/api/jobs/${id}/log`, headers)).body, /READY/);
    const finished = Promise.withResolvers<void>();
    const watcher = watch(join(root, 'projects/demo/logs/jobs'), () => {
      try { if (findJob(root, id).state === 'cancelled') { watcher.close(); finished.resolve(); } } catch { /* record replacement in progress */ }
    });
    assert.equal((await call('POST', `/api/jobs/${id}/cancel`, headers)).status, 200);
    if (findJob(root, id).state === 'cancelled') { watcher.close(); finished.resolve(); }
    await finished.promise;
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); rmSync(root, { recursive: true, force: true }); }
});
