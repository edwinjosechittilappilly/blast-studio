import type { IncomingMessage, ServerResponse } from 'node:http';
import type { StudioConfig } from '../types.ts';
import { UserError } from '../types.ts';
import { buildOperation, operations } from '../jobs/registry.ts';
import { cancelJob, findJob, JobConflict, JobNotFound, JobNotRunning, jobLog, listJobs, startJob } from '../jobs/runner.ts';
import { saveSecret } from '../jobs/secrets.ts';

export interface JobsApiOptions { config: StudioConfig; port: number; sessionCheck: (req: IncomingMessage) => boolean; allowedHosts?: string[]; cwd?: string; env?: NodeJS.ProcessEnv }
class RequestTooLarge extends UserError {}
function send(res: ServerResponse, code: number, value: unknown): void {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(value));
}
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const part of req) { const chunk = Buffer.from(part); size += chunk.length; if (size > 16384) throw new RequestTooLarge('Request too large'); chunks.push(chunk); }
  let value: unknown; try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new UserError('Invalid JSON'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new UserError('Expected an object');
  return value as Record<string, unknown>;
}
/** Returns false for routes owned by the enclosing server. */
export async function handleJobsApi(req: IncomingMessage, res: ServerResponse, options: JobsApiOptions): Promise<boolean> {
  const raw = (req.url ?? '/').split('?')[0];
  if (raw !== '/api/operations' && raw !== '/api/jobs' && !raw.startsWith('/api/jobs/') && raw !== '/api/secrets') return false;
  const host = req.headers.host ?? '';
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '') || !(options.allowedHosts ?? [`127.0.0.1:${options.port}`, `localhost:${options.port}`]).includes(host)) { send(res, 421, { error: 'Invalid host' }); return true; }
  if (!options.sessionCheck(req)) { send(res, 401, { error: 'Authentication required' }); return true; }
  if (req.method !== 'GET' && (req.headers.origin !== `http://${host}` || req.headers['x-requested-with'] !== 'bstudio')) { send(res, 403, { error: 'Invalid origin or request header' }); return true; }
  try {
    const url = new URL(req.url ?? '/', `http://${host}`);
    if (raw === '/api/operations' && req.method === 'GET') { send(res, 200, operations); return true; }
    if (raw === '/api/jobs' && req.method === 'GET') {
      const campaign = url.searchParams.get('campaign');
      send(res, 200, listJobs(options.config.root).filter(job => !campaign || job.campaign === campaign)); return true;
    }
    if (raw === '/api/jobs' && req.method === 'POST') {
      const data = await body(req);
      if (Object.keys(data).some(key => !['op', 'campaign', 'args'].includes(key)) || typeof data.op !== 'string' || !data.args || typeof data.args !== 'object' || Array.isArray(data.args) || (data.campaign !== undefined && typeof data.campaign !== 'string')) throw new UserError('Invalid job request');
      const args = { ...data.args as Record<string, unknown>, ...(data.campaign !== undefined ? { campaign: data.campaign } : {}) };
      const runnerOptions = { imageProvider: options.config.images.provider, cwd: options.cwd, env: options.env };
      const built = buildOperation(data.op, args, runnerOptions);
      if (built.requiresTTY) { send(res, 422, { error: 'This operation requires a terminal', command: built.command }); return true; }
      send(res, 202, startJob(options.config.root, data.op, args, runnerOptions)); return true;
    }
    if (raw === '/api/secrets' && req.method === 'POST') {
      const data = await body(req);
      if (Object.keys(data).sort().join(',') !== 'key,value') throw new UserError('Invalid credential request');
      saveSecret(data.key, data.value); send(res, 200, { ok: true }); return true;
    }
    const match = /^\/api\/jobs\/([0-9a-f-]+)(?:\/(log|cancel))?$/.exec(raw);
    if (match && req.method === 'GET' && !match[2]) { send(res, 200, findJob(options.config.root, match[1])); return true; }
    if (match && req.method === 'GET' && match[2] === 'log') {
      const tail = url.searchParams.get('tail');
      if (tail !== null && (!/^\d+$/.test(tail) || Number(tail) > 10000)) throw new UserError('Invalid tail');
      const log = jobLog(options.config.root, match[1]);
      send(res, 200, { log: tail === null ? log : Number(tail) === 0 ? '' : log.split('\n').slice(-Number(tail)).join('\n') }); return true;
    }
    if (match && req.method === 'POST' && match[2] === 'cancel') { send(res, 200, cancelJob(options.config.root, match[1])); return true; }
    send(res, 404, { error: 'Not found' }); return true;
  } catch (error) {
    const code = error instanceof JobConflict || error instanceof JobNotRunning ? 409 : error instanceof JobNotFound ? 404 : error instanceof RequestTooLarge ? 413 : error instanceof UserError ? 400 : 500;
    send(res, code, { error: code === 500 ? 'Job request failed' : (error as Error).message }); return true;
  }
}
