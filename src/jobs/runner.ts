import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFileSync, closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UserError } from '../types.ts';
import { buildOperation, campaignRef } from './registry.ts';

export type JobState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export interface Job { id: string; operation: string; campaign?: string; state: JobState; createdAt: string; updatedAt: string; pid?: number; exitCode?: number | null; command: string; cancelRequested?: boolean; processGroup?: boolean; childPids?: number[] }
export class JobConflict extends Error { owner: string; constructor(owner: string) { super(`Campaign is locked by ${owner}`); this.owner = owner; } }
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const bin = fileURLToPath(new URL('../../bin/bstudio.mjs', import.meta.url));
function alive(pid: number): boolean { try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; } }
function safeDir(root: string, parts: string[]): string {
  const base = resolve(root); mkdirSync(base, { recursive: true });
  const canonical = realpathSync(base); let current = canonical;
  for (const part of parts) {
    current = join(current, part);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new UserError('Unsafe job directory');
    mkdirSync(current, { recursive: true });
    const rel = relative(canonical, realpathSync(current));
    if (rel === '..' || rel.startsWith(`..${sep}`)) throw new UserError('Unsafe job directory');
  }
  return current;
}
export function campaignDirectory(root: string, ref: string): string {
  const parts = campaignRef(ref).split('/');
  return safeDir(root, parts.length === 1 ? ['projects', parts[0]] : ['projects', parts[0], 'campaigns', parts[1]]);
}
function logDir(root: string, ref?: string): string { return ref ? safeDir(campaignDirectory(root, ref), ['logs', 'jobs']) : safeDir(root, ['logs', 'jobs']); }
function recordPath(dir: string, id: string): string { if (!idPattern.test(id)) throw new UserError('Invalid job id'); return join(dir, `${id}.json`); }
function writeJob(dir: string, job: Job): void {
  const path = recordPath(dir, job.id), temp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temp, JSON.stringify(job) + '\n', { mode: 0o600, flag: 'wx' }); renameSync(temp, path);
}
function lockPath(root: string, ref: string): string { return join(campaignDirectory(root, ref), '.bstudio-job.lock'); }
type Lock = { id: string; pid: number; childPids?: number[] };
function readLock(path: string): Lock | undefined { try { return JSON.parse(readFileSync(path, 'utf8')) as Lock; } catch { return undefined; } }
function lockAlive(lock: Lock): boolean {
  return alive(lock.pid) || (lock.childPids ?? []).some(pid => {
    try { process.kill(process.platform === 'win32' ? pid : -pid, 0); return true; }
    catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
  });
}
export function acquireCampaignLock(root: string, ref: string, id: string = randomUUID()): () => void {
  const path = lockPath(root, ref);
  for (;;) {
    try {
      const fd = openSync(path, 'wx', 0o600); try { writeFileSync(fd, JSON.stringify({ id, pid: process.pid })); } finally { closeSync(fd); }
      return () => { if (readLock(path)?.id === id) rmSync(path, { force: true }); };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const lock = readLock(path);
      if (lock && lock.id === id && process.env.BSTUDIO_JOB_ID === id) return () => {};
      if (!lock || !Number.isInteger(lock.pid) || lockAlive(lock)) throw new JobConflict(lock?.id ?? 'another process');
      const guard = `${path}.recovery`;
      try { mkdirSync(guard); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new JobConflict('lock recovery'); throw e; }
      try {
        const current = readLock(path);
        if (current && Number.isInteger(current.pid) && !lockAlive(current)) rmSync(path, { force: true });
      } finally { rmSync(guard, { recursive: true, force: true }); }
    }
  }
}
/** Register a foreground CLI operation in the same durable store as dashboard jobs. */
export function startCliJob(root: string, ref: string, operation: string): { id: string; log: (line: string) => void; finish: (code: number, cancelled?: boolean) => void } {
  const id = randomUUID(), dir = logDir(root, ref), release = acquireCampaignLock(root, ref, id);
  const now = new Date().toISOString();
  const job: Job = { id, operation, campaign: ref, state: 'running', createdAt: now, updatedAt: now, pid: process.pid, command: `bstudio ${operation} ${ref}` };
  try { writeJob(dir, job); }
  catch (error) { release(); throw error; }
  return {
    id,
    log: line => appendFileSync(join(dir, `${id}.log`), `${line}\n`, { mode: 0o600 }),
    finish: (code, cancelled) => { try { job.exitCode = code; job.state = cancelled ? 'cancelled' : code === 0 ? 'succeeded' : 'failed'; job.updatedAt = new Date().toISOString(); writeJob(dir, job); } finally { release(); } },
  };
}
/** The spawned CLI records its outcome even if its launching dashboard has exited. */
export function finishSpawnedJob(root: string, ref: string, id: string, code: number): void {
  const dir = logDir(root, ref), path = recordPath(dir, id);
  const job = JSON.parse(readFileSync(path, 'utf8')) as Job;
  if (job.id !== id || job.campaign !== ref) throw new UserError('Invalid job record');
  job.exitCode = code; job.state = job.cancelRequested ? 'cancelled' : code === 0 ? 'succeeded' : 'failed'; job.updatedAt = new Date().toISOString();
  writeJob(dir, job);
}
export function updateJobProcesses(root: string, ref: string, id: string, pids: number[]): void {
  const dir = logDir(root, ref), job = JSON.parse(readFileSync(recordPath(dir, id), 'utf8')) as Job;
  if (job.id !== id || job.campaign !== ref) throw new UserError('Invalid job record');
  job.childPids = pids; job.updatedAt = new Date().toISOString(); writeJob(dir, job);
  const path = lockPath(root, ref), lock = readLock(path);
  if (lock?.id === id) { lock.childPids = pids; writeFileSync(path, JSON.stringify(lock), { mode: 0o600 }); }
}
export function startJob(root: string, name: string, values: unknown, options: { imageProvider?: string; env?: NodeJS.ProcessEnv; cwd?: string } = {}): Job {
  const built = buildOperation(name, values, options);
  if (built.requiresTTY) throw new UserError(`Requires a terminal; run ${built.command}`);
  const id = randomUUID(), dir = logDir(root, built.campaign), release = built.campaign ? acquireCampaignLock(root, built.campaign, id) : () => {};
  const now = new Date().toISOString();
  const job: Job = { id, operation: name, campaign: built.campaign, state: 'queued', createdAt: now, updatedAt: now, command: built.command };
  try {
    writeJob(dir, job);
    const fd = openSync(join(dir, `${id}.log`), 'a', 0o600);
    let child;
    try { child = spawn(process.execPath, [bin, ...built.args], { cwd: options.cwd, env: { ...process.env, ...options.env, BSTUDIO_JOB_ID: id }, detached: process.platform !== 'win32', stdio: ['ignore', fd, fd] }); }
    finally { closeSync(fd); }
    if (built.campaign && child.pid) writeFileSync(lockPath(root, built.campaign), JSON.stringify({ id, pid: child.pid }), { mode: 0o600 });
    job.pid = child.pid; job.processGroup = process.platform !== 'win32'; job.state = 'running'; job.updatedAt = new Date().toISOString(); writeJob(dir, job);
    child.once('error', () => { job.state = 'failed'; job.updatedAt = new Date().toISOString(); writeJob(dir, job); release(); });
    child.once('exit', (code) => {
      const current = JSON.parse(readFileSync(recordPath(dir, id), 'utf8')) as Job;
      current.state = current.cancelRequested ? 'cancelled' : code === 0 ? 'succeeded' : 'failed';
      current.exitCode = code; current.updatedAt = new Date().toISOString(); writeJob(dir, current); release();
    });
    return job;
  } catch (error) { release(); throw error; }
}
function dirs(root: string): string[] {
  const result = [logDir(root)], projects = join(resolve(root), 'projects');
  if (!existsSync(projects)) return result;
  for (const project of readdirSync(projects, { withFileTypes: true })) {
    if (!project.isDirectory() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(project.name)) continue;
    const p = join(projects, project.name), legacy = join(p, 'logs', 'jobs');
    if (existsSync(legacy)) result.push(legacy);
    const campaigns = join(p, 'campaigns'); if (!existsSync(campaigns) || lstatSync(campaigns).isSymbolicLink()) continue;
    for (const c of readdirSync(campaigns, { withFileTypes: true })) if (c.isDirectory() && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c.name)) { const d = join(campaigns, c.name, 'logs', 'jobs'); if (existsSync(d)) result.push(d); }
  }
  return result;
}
export function listJobs(root: string): Job[] {
  const result: Job[] = [];
  for (const dir of dirs(root)) {
    const rel = relative(resolve(root), dir);
    let part = resolve(root), unsafe = false;
    for (const segment of rel.split(sep)) { part = join(part, segment); if (lstatSync(part).isSymbolicLink()) { unsafe = true; break; } }
    if (unsafe) continue;
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.json') || !idPattern.test(name.slice(0, -5)) || lstatSync(join(dir, name)).isSymbolicLink()) continue;
      try {
        const job = JSON.parse(readFileSync(join(dir, name), 'utf8')) as Job;
        if (job.id !== name.slice(0, -5)) continue;
        if ((job.state === 'running' || job.state === 'queued') && job.pid && !alive(job.pid)) { job.state = job.cancelRequested ? 'cancelled' : 'failed'; job.updatedAt = new Date().toISOString(); writeJob(dir, job); }
        result.push(job);
      } catch { /* A damaged record cannot be used to control processes. */ }
    }
  }
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export function findJob(root: string, id: string): Job { if (!idPattern.test(id)) throw new UserError('Invalid job id'); const job = listJobs(root).find(j => j.id === id); if (!job) throw new UserError('Job not found'); return job; }
export function jobLog(root: string, id: string): string {
  const job = findJob(root, id), path = join(logDir(root, job.campaign), `${id}.log`);
  try { if (lstatSync(path).isSymbolicLink()) throw new UserError('Unsafe job log'); return readFileSync(path, 'utf8'); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return ''; throw e; }
}
export function cancelJob(root: string, id: string): Job {
  const job = findJob(root, id); if (job.state !== 'running' || !job.pid) throw new UserError('Job is not running');
  job.cancelRequested = true; job.updatedAt = new Date().toISOString(); writeJob(logDir(root, job.campaign), job);
  try { process.kill(job.processGroup ? -job.pid : job.pid, 'SIGTERM'); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ESRCH') throw e; }
  return job;
}
