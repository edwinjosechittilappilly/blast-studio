import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync, realpathSync, statSync, lstatSync, createReadStream, mkdirSync, unlinkSync, linkSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addFeedback } from '../feedback.ts';
import { loadConfig, campaignDir, writeConfigField } from '../config.ts';
import { listExports, loadLibrary, projectReview, latestSources } from '../library.ts';
import { monthToDate, projectTotal, providerTotals } from '../budget/ledger.ts';
import type { IO } from '../io.ts';
import { handleJobsApi } from './jobs-api.ts';
import { buildOperation } from '../jobs/registry.ts';
import { campaignLockStatus, JobConflict, jobLogTail, listJobs, startJob } from '../jobs/runner.ts';
import { containedPath, listProjects, readProject, validateId } from '../campaigns.ts';
import { parseBrief } from '../brief.ts';
import { historyEntries } from '../history.ts';
import { loadEnvWithSources } from '../env.ts';
import { listBlockers, readResolutions } from '../blockers.ts';

const staticDir = join(dirname(fileURLToPath(import.meta.url)), 'static');
const buildDir = join(dirname(fileURLToPath(import.meta.url)), 'build');
const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.pdf': 'application/pdf', '.vtt': 'text/vtt; charset=utf-8' };
const errorPageCsp = "default-src 'none'; style-src 'self'; font-src 'self' data:; base-uri 'none'";
function errorPage(title: string, message: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} — Blast Studio</title><link rel="stylesheet" href="/app.css"></head><body class="cds--g10"><header class="shell-header"><span class="shell-name">Blast Studio</span></header><div class="shell-layout"><aside class="shell-nav" aria-hidden="true"></aside><main id="main"><section class="surface"><h1>${title}</h1><p>${message}</p><a class="cds--btn cds--btn--primary" href="/">Reload dashboard</a></section></main></div></body></html>`;
}
function send(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(value));
}
function unauthenticated(req: IncomingMessage, res: ServerResponse, error: string) {
  if (req.method === 'GET' && (req.headers.accept ?? '').includes('text/html')) {
    res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': errorPageCsp });
    res.end(errorPage('Session expired', 'Run <code>bstudio dashboard</code> again and open the new URL.'));
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
  const headers: Record<string, string | number> = { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', ...(media ? { 'Content-Security-Policy': type === 'application/pdf' ? "default-src 'none'" : "sandbox; default-src 'none'" } : type.startsWith('text/html') ? { 'Content-Security-Policy': "default-src 'self'; font-src 'self' data:; img-src 'self' data:; media-src 'self'; frame-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'" } : {}) };
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
  if (!metadata.isFile() || !/^[a-f0-9]{64}$/.test(key)) throw new Error(`Invalid dashboard signing key: ${keyFile}`);
  if (process.platform !== 'win32' && (metadata.mode & 0o077) !== 0) throw new Error(`Invalid dashboard signing key permissions: ${keyFile}; run chmod 600 "${keyFile}"`);
  const signature = (payload: string) => createHmac('sha256', key).update(payload).digest('hex');
  const sessionCookie = () => { const payload = `${Date.now() + 12 * 60 * 60 * 1000}.${randomBytes(16).toString('hex')}`; return `bs=${payload}.${signature(payload)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`; };
  const validSession = (value: string) => { const parts = value.split('.'); if (parts.length !== 3 || !/^\d+$/.test(parts[0]) || !/^[a-f0-9]{32}$/.test(parts[1])) return false; const expiry = Number(parts[0]); return Number.isSafeInteger(expiry) && expiry > Date.now() && equal(parts[2], signature(`${parts[0]}.${parts[1]}`)); };
  let unused = true;
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
      if (req.method === 'GET' && url.pathname === '/app.css') {
        const file = join(buildDir, 'app.css');
        if (existsSync(file)) { serveFile(req, res, file); return; }
      }
      const cookie = (req.headers.cookie ?? '').split(';').map(s => s.trim()).find(s => s.startsWith('bs='))?.slice(3) ?? '';
      if (!validSession(cookie)) { unauthenticated(req, res, 'Authentication required'); return; }
      if (req.method !== 'GET' && req.method !== 'HEAD' && (req.headers.origin !== `http://${req.headers.host}` || req.headers['x-requested-with'] !== 'bstudio')) { send(res, 403, { error: 'Invalid origin or request header' }); return; }
      res.setHeader('Set-Cookie', sessionCookie());
      const rawPath = (req.url ?? '').split('?')[0];
      if ((rawPath.startsWith('/media/') || rawPath.startsWith('/api/project/') || rawPath.startsWith('/api/projects/')) && decodeURIComponent(rawPath).split(/[\\/]/).some(part => part === '..' || part === '.')) { send(res, 403, { error: 'Forbidden' }); return; }
      const config = loadConfig(io), pathname = url.pathname;
      if (await handleJobsApi(req, res, { config, port, sessionCheck: () => validSession(cookie), env: { ...io.env, BSTUDIO_HOME: config.root, BSTUDIO_CONFIG: config.file } })) return;
      const projectApi = /^\/api\/projects\/([^/]+)\/(feedback|revise|status)$/.exec(pathname);
      if (projectApi) {
        const slug = decodeURIComponent(projectApi[1]), dir = campaignDir(config, slug), action = projectApi[2];
        if (!existsSync(dir)) { send(res, 404, { error: 'Project not found' }); return; }
        if (req.method === 'GET' && action === 'status') {
          const job = listJobs(config.root).find(item => item.campaign === slug && item.operation === 'revise');
          const lock = campaignLockStatus(config.root, slug);
          const lines = job ? jobLogTail(config.root, job.id) : [];
          send(res, 200, { running: lock === 'running', staleLock: false, exitCode: job?.exitCode ?? null, lines }); return;
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
          const args = { campaign: slug, feedbackOnly: true };
          const built = buildOperation('revise', args, { imageProvider: config.images.provider, root: config.root });
          if (built.requiresTTY) { send(res, 422, { error: 'This operation requires a terminal', command: built.command }); return; }
          const job = startJob(config.root, 'revise', args, { imageProvider: config.images.provider, env: { ...io.env, BSTUDIO_HOME: config.root, BSTUDIO_CONFIG: config.file } });
          send(res, 202, job); return;
        }
      }
      if (req.method === 'GET') {
        const blockersApi = /^\/api\/campaigns\/([^/]+)\/([^/]+)\/blockers$/.exec(pathname);
        if (blockersApi) {
          const dir = campaignDir(config, { project: decodeURIComponent(blockersApi[1]), campaign: decodeURIComponent(blockersApi[2]) });
          if (!existsSync(dir)) { send(res, 404, { error: 'Campaign not found' }); return; }
          send(res, 200, { blockers: listBlockers(dir), resolutions: readResolutions(dir) }); return;
        }
        const historyApi = /^\/api\/campaigns\/([^/]+)\/([^/]+)\/history$/.exec(pathname);
        if (historyApi) {
          const dir = campaignDir(config, { project: decodeURIComponent(historyApi[1]), campaign: decodeURIComponent(historyApi[2]) });
          if (!existsSync(dir)) { send(res, 404, { error: 'Campaign not found' }); return; }
          const root = join(dir, 'history');
          if (!existsSync(root) || lstatSync(root).isSymbolicLink()) { send(res, 200, []); return; }
          const sizeOf = (path: string): number => readdirSync(path, { withFileTypes: true }).reduce((sum, entry) => {
            const child = join(path, entry.name);
            return sum + (entry.isDirectory() ? sizeOf(child) : entry.isFile() ? lstatSync(child).size : 0);
          }, 0);
          const entries = historyEntries(dir).flatMap(name => {
            const match = /^(\d+)-([a-z]+)-(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2}\.\d{3}Z)$/.exec(name), path = join(root, name);
            if (!match || !lstatSync(path).isDirectory()) return [];
            return [{ n: Number(match[1]), step: match[2], time: `${match[3]}:${match[4]}:${match[5]}`, size: sizeOf(path) }];
          });
          send(res, 200, entries); return;
        }
        const exportsApi = /^\/api\/campaigns\/([^/]+)\/([^/]+)\/exports(?:\/(.+))?$/.exec(pathname);
        if (exportsApi) {
          const project = decodeURIComponent(exportsApi[1]), campaign = decodeURIComponent(exportsApi[2]);
          const dir = campaignDir(config, { project, campaign });
          if (!existsSync(dir)) { send(res, 404, { error: 'Campaign not found' }); return; }
          const campaignBase = realpathSync(dir), exportDir = join(dir, 'export');
          if (existsSync(exportDir)) {
            const rel = relative(campaignBase, realpathSync(exportDir));
            if (!rel || rel === '..' || rel.startsWith(`..${sep}`)) { send(res, 403, { error: 'Forbidden' }); return; }
          }
          const entries = listExports(config, { project, campaign }).filter(entry => {
            let path = exportDir;
            try { for (const segment of entry.name.split('/').filter(Boolean)) { path = join(path, segment); if (lstatSync(path).isSymbolicLink()) return false; } return true; } catch { return false; }
          });
          if (!exportsApi[3]) { send(res, 200, entries); return; }
          const name = decodeURIComponent(exportsApi[3]);
          if (!entries.some(entry => entry.kind === 'zip' && entry.name === name)) { send(res, 404, { error: 'Export not found' }); return; }
          const exportBase = realpathSync(exportDir);
          const file = realpathSync(join(exportBase, name)), rel = relative(exportBase, file);
          if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || !statSync(file).isFile() || extname(file).toLowerCase() !== '.zip') { send(res, 403, { error: 'Forbidden' }); return; }
          res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name.split('/').pop()!)}`);
          serveFile(req, res, file); return;
        }
        if (pathname === '/api/projects' || /^\/api\/projects\/[^/]+$/.test(pathname)) {
          const id = pathname === '/api/projects' ? null : validateId(decodeURIComponent(pathname.slice('/api/projects/'.length)));
          const projects = listProjects(config), library = loadLibrary(config);
          const selected = id ? projects.filter(project => project.project === id) : projects;
          if (id && !selected.length) { send(res, 404, { error: 'Project not found' }); return; }
          const result = selected.map(project => {
            const metadata = readProject(config, project.project);
            const campaigns = library.filter(campaign => campaign.slug.split('/')[0] === project.project).map(campaign => ({
              id: campaign.slug.split('/')[1], updatedAt: campaign.updatedAt,
              verdicts: campaign.reviews.map(review => review.verdict),
            }));
            const evidenceFile = containedPath(config.root, 'projects', project.project, 'evidence', 'sources.md');
            const evidence = id && existsSync(evidenceFile) ? parseBrief(readFileSync(evidenceFile, 'utf8')).map(section => ({
              title: section.title, source: /^Source:\s*(.+)$/m.exec(section.body.split(/^ {0,3}(?:`{3,}|~{3,})/m, 1)[0])?.[1],
            })) : [];
            return { id: project.project, ...metadata, repo: metadata.links?.repository, campaigns, updatedAt: project.updatedAt.toISOString(), ...(id ? { evidence } : {}) };
          });
          send(res, 200, id ? result[0] : result); return;
        }
        if (pathname === '/api/library') { send(res, 200, loadLibrary(config, url.searchParams.get('q') ?? '')); return; }
        if (pathname === '/api/secrets/status') {
          const keys = ['GEMINI_API_KEY', 'OPENAI_API_KEY'];
          const { sources } = loadEnvWithSources(config.root, io.env, io.keychain, keys);
          send(res, 200, Object.fromEntries(keys.map(key => [key, { set: sources[key] !== 'unset', source: sources[key] === 'shell' ? 'env' : sources[key] }])));
          return;
        }
        if (pathname === '/api/budget') { send(res, 200, { cap: config.budget.monthlyUsd, perProject: config.budget.perProjectUsd, mtd: monthToDate(config.root), providerTotals: providerTotals(config.root), projects: Object.fromEntries(loadLibrary(config).map(p => [p.slug, projectTotal(config.root, p.slug)])), providers: { images: config.images.provider, voice: config.voice.provider, allowUpload: config.providers.allowUpload }, brand: config.brand }); return; }
        if (pathname === '/api/sources') { send(res, 200, latestSources(config)); return; }
        if (pathname.startsWith('/api/project/')) { const slug = decodeURIComponent(pathname.slice(13)); const dir = campaignDir(config, slug); if (!existsSync(dir)) { send(res, 404, { error: 'Project not found' }); return; } send(res, 200, projectReview(config, slug, { cwd: io.cwd, home: io.env.HOME || process.env.HOME || '' })); return; }
        if (pathname.startsWith('/media/')) {
          const parts = pathname.slice(7).split('/').map(decodeURIComponent), project = parts.shift() ?? '', campaign = parts.shift() ?? '';
          if (parts.some(p => !p || p === '..' || p === '.' || p.includes('/') || p.includes('\\'))) { send(res, 403, { error: 'Forbidden' }); return; }
          const base = realpathSync(campaignDir(config, { project, campaign }));
          const file = realpathSync(resolve(base, ...parts)), rel = relative(base, file);
          if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || !statSync(file).isFile()) { send(res, 403, { error: 'Forbidden' }); return; }
          serveFile(req, res, file, true); return;
        }
        const staticFile = pathname === '/' ? 'index.html' : pathname === '/app.js' ? 'app.js' : pathname === '/app.css' ? 'app.css' : '';
        if (staticFile) {
          const built = join(buildDir, staticFile), file = staticFile !== 'index.html' && existsSync(built) ? built : join(staticDir, staticFile);
          if (staticFile === 'index.html' && !existsSync(join(buildDir, 'app.js')) && !existsSync(join(staticDir, 'app.js'))) { res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': errorPageCsp }); res.end(errorPage('Dashboard assets missing', 'Run <code>npm run build:ui</code> in the source checkout, then run <code>bstudio dashboard</code> and reload.')); return; }
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
          if (Object.keys(data).some(key => !['images', 'voice', 'allowUpload'].includes(key)) || typeof data.images !== 'string' || !['none', 'gemini', 'openai', 'omp'].includes(data.images) || typeof data.voice !== 'string' || !['none', 'openai'].includes(data.voice) || (data.allowUpload !== undefined && typeof data.allowUpload !== 'boolean')) { send(res, 400, { error: 'Invalid providers' }); return; }
          writeConfigField(config, ['images', 'provider'], data.images); writeConfigField(config, ['voice', 'provider'], data.voice);
          if (data.allowUpload !== undefined) writeConfigField(config, ['providers', 'allowUpload'], data.allowUpload);
        }
        send(res, 200, { ok: true }); return;
      }
      send(res, 404, { error: 'Not found' });
    } catch (error) { const code = (error as NodeJS.ErrnoException).code; send(res, error instanceof JobConflict ? 409 : code === 'ENOENT' || code === 'ENOTDIR' ? 404 : 400, { error: (error as Error).message }); }
  });
  await new Promise<void>((resolveListen, reject) => { server.once('error', reject); server.listen(options.port ?? 4848, host, () => { server.off('error', reject); resolveListen(); }); });
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No server address');
  const url = `http://127.0.0.1:${address.port}/?t=${token}`;
  return { server, url, token, port: address.port };
}
