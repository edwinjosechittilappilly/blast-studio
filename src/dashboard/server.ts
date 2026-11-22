import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync, createReadStream } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, projectDir, writeConfigField } from '../config.ts';
import { loadLibrary, projectDetails, latestSources } from '../library.ts';
import { monthToDate, projectTotal, providerTotals } from '../budget/ledger.ts';
import type { IO } from '../io.ts';

const staticDir = join(dirname(fileURLToPath(import.meta.url)), 'static');
const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.pdf': 'application/pdf', '.vtt': 'text/vtt; charset=utf-8' };
function send(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(value));
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
  const headers: Record<string, string | number> = { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', ...(media ? { 'Content-Security-Policy': "sandbox; default-src 'none'" } : {}) };
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
export async function startDashboard(io: IO, options: { port?: number; host?: string } = {}) {
  const host = options.host ?? '127.0.0.1';
  if (host !== '127.0.0.1') throw new Error('Dashboard may only bind to 127.0.0.1');
  const token = randomBytes(32).toString('hex'), session = randomBytes(32).toString('hex');
  let unused = true;
  const server = createServer(async (req, res) => {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : options.port ?? 4848;
    if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(req.headers.host ?? '')) { send(res, 421, { error: 'Invalid host' }); return; }
    try {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
      if (req.method === 'GET' && url.pathname === '/' && url.searchParams.has('t')) {
        if (!unused || !equal(url.searchParams.get('t') ?? '', token)) { send(res, 401, { error: 'Invalid token' }); return; }
        unused = false; res.writeHead(302, { 'Set-Cookie': `bs=${session}; HttpOnly; SameSite=Strict; Path=/`, Location: '/', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); res.end(); return;
      }
      const cookie = (req.headers.cookie ?? '').split(';').map(s => s.trim()).find(s => s.startsWith('bs='))?.slice(3) ?? '';
      if (!equal(cookie, session)) { send(res, 401, { error: 'Authentication required' }); return; }
      const rawPath = (req.url ?? '').split('?')[0];
      if (rawPath.startsWith('/media/') && decodeURIComponent(rawPath).split(/[\\/]/).some(part => part === '..' || part === '.')) { send(res, 403, { error: 'Forbidden' }); return; }
      const config = loadConfig(io), pathname = url.pathname;
      if (req.method === 'GET') {
        if (pathname === '/api/library') { send(res, 200, loadLibrary(config, url.searchParams.get('q') ?? '')); return; }
        if (pathname === '/api/budget') { send(res, 200, { cap: config.budget.monthlyUsd, perProject: config.budget.perProjectUsd, mtd: monthToDate(config.root), providerTotals: providerTotals(config.root), projects: Object.fromEntries(loadLibrary(config).map(p => [p.slug, projectTotal(config.root, p.slug)])), providers: { images: config.images.provider, voice: config.voice.provider }, brand: config.brand }); return; }
        if (pathname === '/api/sources') { send(res, 200, latestSources(config)); return; }
        if (pathname.startsWith('/api/project/')) { const slug = decodeURIComponent(pathname.slice(13)); const dir = projectDir(config, slug); if (!existsSync(dir)) { send(res, 404, { error: 'Project not found' }); return; } send(res, 200, projectDetails(config, slug)); return; }
        if (pathname.startsWith('/media/')) {
          const parts = pathname.slice(7).split('/').map(decodeURIComponent), slug = parts.shift() ?? '';
          const project = projectDir(config, slug), base = realpathSync(project), root = realpathSync(join(config.root, 'projects'));
          if (relative(root, base).startsWith('..') || parts.some(p => p === '..' || p === '.' || p.includes('/') || p.includes('\\'))) { send(res, 403, { error: 'Forbidden' }); return; }
          const file = realpathSync(resolve(base, ...parts)), rel = relative(base, file);
          if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || !statSync(file).isFile()) { send(res, 403, { error: 'Forbidden' }); return; }
          serveFile(req, res, file, true); return;
        }
        const staticFile = pathname === '/' ? 'index.html' : pathname === '/app.js' ? 'app.js' : pathname === '/app.css' ? 'app.css' : '';
        if (staticFile) { serveFile(req, res, join(staticDir, staticFile)); return; }
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
