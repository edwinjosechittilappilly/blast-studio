import type { IncomingMessage, ServerResponse } from 'node:http';
import type { StudioConfig } from '../types.ts';
import { UserError } from '../types.ts';
import { buildOperation } from '../jobs/registry.ts';
import { cancelJob, findJob, JobConflict, jobLog, listJobs, startJob } from '../jobs/runner.ts';
import { saveSecret } from '../jobs/secrets.ts';

export interface JobsApiOptions { config: StudioConfig; port: number; sessionCheck: (req: IncomingMessage) => boolean; allowedHosts?: string[]; cwd?: string; env?: NodeJS.ProcessEnv }
function send(res: ServerResponse, code: number, value: unknown): void {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(value));
}
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const part of req) { const chunk = Buffer.from(part); size += chunk.length; if (size > 16384) throw new UserError('Request too large'); chunks.push(chunk); }
  let value: unknown; try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new UserError('Invalid JSON'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new UserError('Expected an object');
  return value as Record<string, unknown>;
}
/** Returns false for routes owned by the enclosing server. */
export async function handleJobsApi(req: IncomingMessage, res: ServerResponse, options: JobsApiOptions): Promise<boolean> {
  const raw = (req.url ?? '/').split('?')[0];
  if (raw !== '/api/jobs' && !raw.startsWith('/api/jobs/') && raw !== '/api/secrets') return false;
  const host = req.headers.host ?? '';
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '') || !(options.allowedHosts ?? [`127.0.0.1:${options.port}`, `localhost:${options.port}`]).includes(host)) { send(res, 421, { error: 'Invalid host' }); return true; }
  if (!options.sessionCheck(req)) { send(res, 401, { error: 'Authentication required' }); return true; }
  if (req.method !== 'GET' && (req.headers.origin !== `http://${host}` || req.headers['x-requested-with'] !== 'bstudio')) { send(res, 403, { error: 'Invalid origin or request header' }); return true; }
  try {
    if (raw === '/api/jobs' && req.method === 'GET') { send(res, 200, listJobs(options.config.root)); return true; }
    if (raw === '/api/jobs' && req.method === 'POST') {
      const data = await body(req);
      if (Object.keys(data).sort().join(',') !== 'args,operation' || typeof data.operation !== 'string') throw new UserError('Invalid job request');
      const runnerOptions = { imageProvider: options.config.images.provider, cwd: options.cwd, env: options.env };
      const built = buildOperation(data.operation, data.args, runnerOptions);
      if (built.requiresTTY) { send(res, 422, { error: 'This operation requires a terminal', command: built.command }); return true; }
      send(res, 202, startJob(options.config.root, data.operation, data.args, runnerOptions)); return true;
    }
    if (raw === '/api/secrets' && req.method === 'POST') {
      const data = await body(req);
      if (Object.keys(data).sort().join(',') !== 'key,value') throw new UserError('Invalid credential request');
      saveSecret(data.key, data.value); send(res, 200, { ok: true }); return true;
    }
    const match = /^\/api\/jobs\/([0-9a-f-]+)(?:\/(log|cancel))?$/.exec(raw);
    if (match && req.method === 'GET' && !match[2]) { send(res, 200, findJob(options.config.root, match[1])); return true; }
    if (match && req.method === 'GET' && match[2] === 'log') { send(res, 200, { log: jobLog(options.config.root, match[1]) }); return true; }
    if (match && req.method === 'POST' && match[2] === 'cancel') { send(res, 200, cancelJob(options.config.root, match[1])); return true; }
    send(res, 404, { error: 'Not found' }); return true;
  } catch (error) {
    const code = error instanceof JobConflict ? 409 : error instanceof UserError ? 400 : 500;
    send(res, code, { error: code === 500 ? 'Job request failed' : (error as Error).message }); return true;
  }
}
