import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, realpathSync, statSync, lstatSync, createReadStream, mkdirSync, openSync, closeSync, readSync, readdirSync, unlinkSync, linkSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { addFeedback } from '../feedback.ts';
import { loadConfig, projectDir, writeConfigField } from '../config.ts';
import { loadLibrary, projectReview, latestSources } from '../library.ts';
import { monthToDate, projectTotal, providerTotals } from '../budget/ledger.ts';
import type { IO } from '../io.ts';
import { revisionLockStatus } from '../revise-lock.ts';

const staticDir = join(dirname(fileURLToPath(import.meta.url)), 'static');
const buildDir = join(dirname(fileURLToPath(import.meta.url)), 'build');
function tailLog(path: string) {
  const fd = openSync(path, 'r');
  try {
    const size = statSync(path).size, length = Math.min(size, 65536), buffer = Buffer.alloc(length);
    const read = readSync(fd, buffer, 0, length, size - length);
    const text = buffer.subarray(0, read).toString('utf8');
    const lines = (size > length ? text.slice(text.indexOf('\n') + 1) : text).split(/\r?\n/);
    if (!lines.at(-1)) lines.pop();
    return lines.slice(-50);
  } finally { closeSync(fd); }
}
const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.pdf': 'application/pdf', '.vtt': 'text/vtt; charset=utf-8' };
function send(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(value));
}
function unauthenticated(req: IncomingMessage, res: ServerResponse, error: string) {
  if (req.method === 'GET' && (req.headers.accept ?? '').includes('text/html')) {
    res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Session expired — Blast Studio</title><main><h1>Session expired</h1><p>Run <code>bstudio dashboard</code> again and open the new URL.</p></main></html>');
  } else send(res, 401, { error });
}
function equal(a: string, b: string) { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); }
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  let data = '';
  for await (const chunk of req) { data += chunk; if (data.length > 16384) throw new Error('Request too large'); }
  const result: unknown = JSON.parse(data);
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Expected an object');
  return result as Record<string, unknown>;
}
function serveFile(req: IncomingMessage, res: ServerResponse, path: string, media = false) {
  const size = statSync(path).size, type = types[extname(path).toLowerCase()] ?? 'application/octet-stream';
  const headers: Record<string, string | number> = { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', ...(media ? { 'Content-Security-Policy': "sandbox; default-src 'none'" } : type.startsWith('text/html') ? { 'Content-Security-Policy': "default-src 'self'; font-src 'self' data:; img-src 'self' data:; media-src 'self'; frame-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'" } : {}) };
  const range = req.headers.range;
  if (range && type.startsWith('video/')) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!m || (!m[1] && !m[2])) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return; }
    const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start >= size || end < start) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return; }
    res.writeHead(206, { ...headers, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
    createReadStream(path, { start, end }).pipe(res); return;
  }
  res.writeHead(200, { ...headers, 'Content-Length': size, ...(type.startsWith('video/') ? { 'Accept-Ranges': 'bytes' } : {}) }); createReadStream(path).pipe(res);
}
export async function startDashboard(io: IO, options: { port?: number; host?: string; spawnRevise?: typeof spawn } = {}) {
  const host = options.host ?? '127.0.0.1';
  if (host !== '127.0.0.1') throw new Error('Dashboard may only bind to 127.0.0.1');
  const token = randomBytes(32).toString('hex');
  const root = loadConfig(io).root, keyFile = join(root, '.dashboard-key');
  mkdirSync(root, { recursive: true });
  if (!existsSync(keyFile)) {
    const temp = join(root, `.dashboard-key-${randomBytes(16).toString('hex')}.tmp`);
    try {
      writeFileSync(temp, randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' });
      try { linkSync(temp, keyFile); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    } finally { if (existsSync(temp)) unlinkSync(temp); }
  }
  const metadata = lstatSync(keyFile), key = readFileSync(keyFile, 'utf8');
  if (!metadata.isFile() || (metadata.mode & 0o077) !== 0 || !/^[a-f0-9]{64}$/.test(key)) throw new Error(`Invalid dashboard signing key or permissions: ${keyFile}`);
  const signature = (payload: string) => createHmac('sha256', key).update(payload).digest('hex');
  const sessionCookie = () => { const payload = `${Date.now() + 12 * 60 * 60 * 1000}.${randomBytes(16).toString('hex')}`; return `bs=${payload}.${signature(payload)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`; };
  const validSession = (value: string) => { const parts = value.split('.'); if (parts.length !== 3 || !/^\d+$/.test(parts[0]) || !/^[a-f0-9]{32}$/.test(parts[1])) return false; const expiry = Number(parts[0]); return Number.isSafeInteger(expiry) && expiry > Date.now() && equal(parts[2], signature(`${parts[0]}.${parts[1]}`)); };
  let unused = true;
  const runs = new Map<string, { running: boolean; exitCode: number | null; log: string }>();
  const spawnRevise = options.spawnRevise ?? spawn;
  const server = createServer(async (req, res) => {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : options.port ?? 4848;
    if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(req.headers.host ?? '')) { send(res, 421, { error: 'Invalid host' }); return; }
    try {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
      if (req.method === 'GET' && url.pathname === '/' && url.searchParams.has('t')) {
        if (!unused || !equal(url.searchParams.get('t') ?? '', token)) { unauthenticated(req, res, 'Invalid token'); return; }
        unused = false; res.writeHead(302, { 'Set-Cookie': sessionCookie(), Location: '/', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); res.end(); return;
      }
      const cookie = (req.headers.cookie ?? '').split(';').map(s => s.trim()).find(s => s.startsWith('bs='))?.slice(3) ?? '';
      if (!validSession(cookie)) { unauthenticated(req, res, 'Authentication required'); return; }
      res.setHeader('Set-Cookie', sessionCookie());
      const rawPath = (req.url ?? '').split('?')[0];
      if (rawPath.startsWith('/media/') && decodeURIComponent(rawPath).split(/[\\/]/).some(part => part === '..' || part === '.')) { send(res, 403, { error: 'Forbidden' }); return; }
      const config = loadConfig(io), pathname = url.pathname;
      const projectApi = /^\/api\/projects\/([^/]+)\/(feedback|revise|status)$/.exec(pathname);
      if (projectApi) {
        const slug = decodeURIComponent(projectApi[1]), dir = projectDir(config, slug), action = projectApi[2];
        if (!existsSync(dir)) { send(res, 404, { error: 'Project not found' }); return; }
        if (req.method === 'GET' && action === 'status') {
          const run = runs.get(slug), lock = revisionLockStatus(dir), logs = join(dir, 'logs');
          const latest = existsSync(logs) ? readdirSync(logs).filter(name => /^revise-.*\.log$/.test(name)).sort().at(-1) : undefined;
          const log = run?.log ?? (latest ? join(logs, latest) : undefined);
          const lines = log && existsSync(log) ? tailLog(log) : [];
          send(res, 200, { running: !!run?.running || lock === 'running', staleLock: lock === 'stale', exitCode: run?.exitCode ?? null, lines }); return;
        }
        if (req.method === 'POST' && (action === 'feedback' || action === 'revise')) {
          if (req.headers['x-requested-with'] !== 'bstudio') { send(res, 403, { error: 'Missing request header' }); return; }
          if (action === 'feedback') {
            const data = await body(req), target = data.target;
            if (!target || typeof target !== 'object' || Array.isArray(target) || Object.keys(target).some(key => key !== 'platform' && key !== 'asset') || typeof data.note !== 'string' || !data.note.trim() || data.note.length > 4000) { send(res, 400, { error: 'Invalid feedback' }); return; }
            const selection = target as { platform?: unknown; asset?: unknown };
            if ((selection.platform !== undefined && typeof selection.platform !== 'string') || (selection.asset !== undefined && typeof selection.asset !== 'string') || (selection.platform !== undefined && selection.asset !== undefined)) { send(res, 400, { error: 'Invalid feedback target' }); return; }
            send(res, 201, addFeedback(dir, selection as { platform?: string; asset?: string }, data.note.trim())); return;
          }
          if (runs.get(slug)?.running || revisionLockStatus(dir) !== 'absent') { send(res, 409, { error: revisionLockStatus(dir) === 'stale' ? `Stale revision lock at ${join(dir, '.revise.lock')}; remove it after confirming no revision is running` : 'Revision already running' }); return; }
          const logs = join(dir, 'logs'); mkdirSync(logs, { recursive: true });
          const oldLogs = readdirSync(logs).filter(name => /^revise-.*\.log$/.test(name)).sort().reverse();
          for (const name of oldLogs.slice(9)) unlinkSync(join(logs, name));
          const log = join(logs, `revise-${Date.now()}-${randomBytes(4).toString('hex')}.log`), fd = openSync(log, 'a');
          const run = { running: true, exitCode: null as number | null, log }; runs.set(slug, run);
          try {
            const child: ChildProcess = spawnRevise(process.execPath, [fileURLToPath(new URL('../../bin/bstudio.mjs', import.meta.url)), 'revise', slug, '--feedback-only'], { detached: true, stdio: ['ignore', fd, fd], env: { ...process.env, ...io.env, BSTUDIO_HOME: config.root, BSTUDIO_CONFIG: config.file } });
            child.once('error', () => { run.running = false; run.exitCode = 1; });
            child.once('exit', code => { run.running = false; run.exitCode = code ?? 1; });
            child.unref();
          } catch (error) { run.running = false; run.exitCode = 1; throw error; } finally { closeSync(fd); }
          send(res, 202, { running: true }); return;
        }
      }
      if (req.method === 'GET') {
        if (pathname === '/api/library') { send(res, 200, loadLibrary(config, url.searchParams.get('q') ?? '')); return; }
        if (pathname === '/api/budget') { send(res, 200, { cap: config.budget.monthlyUsd, perProject: config.budget.perProjectUsd, mtd: monthToDate(config.root), providerTotals: providerTotals(config.root), projects: Object.fromEntries(loadLibrary(config).map(p => [p.slug, projectTotal(config.root, p.slug)])), providers: { images: config.images.provider, voice: config.voice.provider }, brand: config.brand }); return; }
        if (pathname === '/api/sources') { send(res, 200, latestSources(config)); return; }
        if (pathname.startsWith('/api/project/')) { const slug = decodeURIComponent(pathname.slice(13)); const dir = projectDir(config, slug); if (!existsSync(dir)) { send(res, 404, { error: 'Project not found' }); return; } send(res, 200, projectReview(config, slug)); return; }
        if (pathname.startsWith('/media/')) {
          const parts = pathname.slice(7).split('/').map(decodeURIComponent), slug = parts.shift() ?? '';
          const project = projectDir(config, slug), base = realpathSync(project), root = realpathSync(join(config.root, 'projects'));
          if (relative(root, base).startsWith('..') || parts.some(p => p === '..' || p === '.' || p.includes('/') || p.includes('\\'))) { send(res, 403, { error: 'Forbidden' }); return; }
          const file = realpathSync(resolve(base, ...parts)), rel = relative(base, file);
          if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || !statSync(file).isFile()) { send(res, 403, { error: 'Forbidden' }); return; }
          serveFile(req, res, file, true); return;
        }
        const staticFile = pathname === '/' ? 'index.html' : pathname === '/app.js' ? 'app.js' : pathname === '/app.css' ? 'app.css' : '';
        if (staticFile) {
          const built = join(buildDir, staticFile), file = staticFile !== 'index.html' && existsSync(built) ? built : join(staticDir, staticFile);
          if (staticFile === 'index.html' && !existsSync(join(buildDir, 'app.js')) && !existsSync(join(staticDir, 'app.js'))) { res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end('<!doctype html><html lang="en"><meta charset="utf-8"><title>Dashboard assets missing</title><h1>Dashboard assets missing</h1><p>Run <code>npm run build:ui</code> in the source checkout, then reload.</p></html>'); return; }
          serveFile(req, res, file); return;
        }
      }
      if (req.method === 'PUT' && (pathname === '/api/budget' || pathname === '/api/providers')) {
        if (req.headers['x-requested-with'] !== 'bstudio') { send(res, 403, { error: 'Missing request header' }); return; }
        const data = await body(req);
        if (pathname === '/api/budget') {
          if (Object.keys(data).sort().join(',') !== 'monthlyUsd,perProjectUsd' || ![data.monthlyUsd, data.perProjectUsd].every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0)) { send(res, 400, { error: 'Budget values must be non-negative numbers' }); return; }
          writeConfigField(config, ['budget', 'monthlyUsd'], data.monthlyUsd); writeConfigField(config, ['budget', 'perProjectUsd'], data.perProjectUsd);
        } else {
          if (Object.keys(data).sort().join(',') !== 'images,voice' || typeof data.images !== 'string' || !['none', 'gemini', 'openai', 'omp'].includes(data.images) || typeof data.voice !== 'string' || !['none', 'openai'].includes(data.voice)) { send(res, 400, { error: 'Invalid providers' }); return; }
          writeConfigField(config, ['images', 'provider'], data.images); writeConfigField(config, ['voice', 'provider'], data.voice);
        }
        send(res, 200, { ok: true }); return;
      }
      send(res, 404, { error: 'Not found' });
    } catch (error) { const code = (error as NodeJS.ErrnoException).code; send(res, code === 'ENOENT' || code === 'ENOTDIR' ? 404 : 400, { error: (error as Error).message }); }
  });
  await new Promise<void>((resolveListen, reject) => { server.once('error', reject); server.listen(options.port ?? 4848, host, () => { server.off('error', reject); resolveListen(); }); });
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No server address');
  const url = `http://127.0.0.1:${address.port}/?t=${token}`;
  return { server, url, token, port: address.port };
}
