import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFileSync, closeSync, existsSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UserError } from '../types.ts';
import { buildOperation, campaignRef } from './registry.ts';

export type JobState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export interface Job { id: string; operation: string; campaign?: string; state: JobState; createdAt: string; updatedAt: string; pid?: number; processStarted?: string; childStarted?: Record<string, string>; exitCode?: number | null; completed?: boolean; command: string; cancelRequested?: boolean; processGroup?: boolean; childPids?: number[] }
export class JobConflict extends Error { owner: string; constructor(owner: string) { super(`Campaign is locked by ${owner}`); this.owner = owner; } }
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const bin = fileURLToPath(new URL('../../bin/bstudio.mjs', import.meta.url));
function alive(pid: number): boolean { try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; } }
function processStarted(pid: number): string | undefined {
  try { return execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || undefined; }
  catch { return undefined; }
}
function sameProcess(pid: number, started?: string): boolean {
  return Boolean(started && processStarted(pid) === started);
}
function sameGroup(pid: number, started?: string): boolean {
  if (!started) return false;
  const current = processStarted(pid);
  if (current) return current === started;
  try { process.kill(process.platform === 'win32' ? pid : -pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
}
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
export function campaignDirectory(root: string, ref: string, create = false): string {
  const slug = campaignRef(ref);
  if (slug.includes('/')) throw new UserError('Project/campaign addresses are not yet supported');
  const path = join(resolve(root), 'projects', slug);
  if (!create && !existsSync(path)) throw new UserError(`Campaign not found: ${slug}`);
  return safeDir(root, ['projects', slug]);
}
function logDir(root: string, ref?: string): string { return ref ? safeDir(campaignDirectory(root, ref), ['logs', 'jobs']) : safeDir(root, ['logs', 'jobs']); }
function recordPath(dir: string, id: string): string { if (!idPattern.test(id)) throw new UserError('Invalid job id'); return join(dir, `${id}.json`); }
function writeJob(dir: string, job: Job): void {
  const path = recordPath(dir, job.id), temp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temp, JSON.stringify(job) + '\n', { mode: 0o600, flag: 'wx' }); renameSync(temp, path);
}
function lockPath(root: string, ref: string): string { return join(campaignDirectory(root, ref), '.bstudio-job.lock'); }
type Lock = { id: string; pid: number; processStarted?: string; childPids?: number[]; childStarted?: Record<string, string> };
function readLock(path: string): Lock | undefined { try { return JSON.parse(readFileSync(path, 'utf8')) as Lock; } catch { return undefined; } }
function writeLock(path: string, lock: Lock): void {
  const temp = `${path}.${randomUUID()}.tmp`;
  try { writeFileSync(temp, JSON.stringify(lock), { mode: 0o600, flag: 'wx' }); renameSync(temp, path); }
  finally { rmSync(temp, { force: true }); }
}
function lockAlive(lock: Lock): boolean {
  return (lock.processStarted ? sameProcess(lock.pid, lock.processStarted) : alive(lock.pid)) || (lock.childPids ?? []).some(pid => sameGroup(pid, lock.childStarted?.[pid]));
}
export function acquireCampaignLock(root: string, ref: string, id: string = randomUUID()): () => void {
  const path = lockPath(root, ref);
  for (;;) {
    try {
      const temp = `${path}.${randomUUID()}.tmp`;
      try { writeFileSync(temp, JSON.stringify({ id, pid: process.pid, processStarted: processStarted(process.pid) }), { mode: 0o600, flag: 'wx' }); linkSync(temp, path); }
      finally { rmSync(temp, { force: true }); }
      return () => { if (readLock(path)?.id === id) rmSync(path, { force: true }); };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const lock = readLock(path);
      if (!lock && !existsSync(path)) continue;
      if (lock && lock.id === id && process.env.BSTUDIO_JOB_ID === id) return () => {};
      if ((!lock && Date.now() - statSync(path).mtimeMs < 30000) || (lock && (!Number.isInteger(lock.pid) || lockAlive(lock)))) throw new JobConflict(lock?.id ?? 'another process');
      const guard = `${path}.recovery`;
      try { mkdirSync(guard); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new JobConflict('lock recovery'); throw e; }
      try {
        const current = readLock(path);
        if ((!current && existsSync(path) && Date.now() - statSync(path).mtimeMs >= 30000) || (current && Number.isInteger(current.pid) && !lockAlive(current))) rmSync(path, { force: true });
      } finally { rmSync(guard, { recursive: true, force: true }); }
    }
  }
}
/** Register a foreground CLI operation in the same durable store as dashboard jobs. */
export function startCliJob(root: string, ref: string, operation: string): { id: string; log: (line: string) => void; finish: (code: number, cancelled?: boolean) => void } {
  if (operation === 'new' || operation === 'brief') campaignDirectory(root, ref, true);
  const id = randomUUID(), dir = logDir(root, ref), release = acquireCampaignLock(root, ref, id);
  const now = new Date().toISOString();
  const job: Job = { id, operation, campaign: ref, state: 'running', createdAt: now, updatedAt: now, pid: process.pid, processStarted: processStarted(process.pid), command: `bstudio ${operation} ${ref}` };
  try { writeJob(dir, job); }
  catch (error) { release(); throw error; }
  return {
    id,
    log: line => appendFileSync(join(dir, `${id}.log`), `${line}\n`, { mode: 0o600 }),
    finish: (code, cancelled) => { try { job.exitCode = code; job.state = cancelled ? 'cancelled' : code === 0 ? 'succeeded' : 'failed'; job.updatedAt = new Date().toISOString(); writeJob(dir, job); } finally { release(); } },
  };
}
/** The spawned CLI records its outcome even if its launching dashboard has exited. */
export function finishSpawnedJob(root: string, ref: string | undefined, id: string, code: number, cancelled = false): void {
  const dir = logDir(root, ref), path = recordPath(dir, id);
  const job = JSON.parse(readFileSync(path, 'utf8')) as Job;
  if (job.id !== id || job.campaign !== ref) throw new UserError('Invalid job record');
  job.exitCode = code; job.completed = true; job.cancelRequested ||= cancelled; job.updatedAt = new Date().toISOString();
  writeJob(dir, job);
}
export function updateJobProcesses(root: string, ref: string | undefined, id: string, pids: number[]): void {
  const dir = logDir(root, ref), job = JSON.parse(readFileSync(recordPath(dir, id), 'utf8')) as Job;
  if (job.id !== id || job.campaign !== ref) throw new UserError('Invalid job record');
  job.childPids = pids; job.childStarted = Object.fromEntries(pids.flatMap(pid => { const started = processStarted(pid); return started ? [[String(pid), started]] : []; })); job.updatedAt = new Date().toISOString(); writeJob(dir, job);
  if (!ref) return;
  const path = lockPath(root, ref), lock = readLock(path);
  if (lock?.id === id) {
    lock.childPids = pids; lock.childStarted = job.childStarted;
    writeLock(path, lock);
  }
}
export function startJob(root: string, name: string, values: unknown, options: { imageProvider?: string; env?: NodeJS.ProcessEnv; cwd?: string } = {}): Job {
  const built = buildOperation(name, values, options);
  if (built.requiresTTY) throw new UserError(`Requires a terminal; run ${built.command}`);
  if (built.campaign && (name === 'new' || name === 'brief')) campaignDirectory(root, built.campaign, true);
  const id = randomUUID(), dir = logDir(root, built.campaign), release = built.campaign && built.operation.campaign ? acquireCampaignLock(root, built.campaign, id) : () => {};
  const now = new Date().toISOString();
  const job: Job = { id, operation: name, campaign: built.campaign, state: 'queued', createdAt: now, updatedAt: now, command: built.command };
  try {
    writeJob(dir, job);
    const fd = openSync(join(dir, `${id}.log`), 'a', 0o600);
    let child;
    try { child = spawn(process.execPath, [bin, ...built.args], { cwd: options.cwd, env: { ...process.env, ...options.env, BSTUDIO_JOB_ID: id, BSTUDIO_JOB_CAMPAIGN: built.campaign }, detached: process.platform !== 'win32', stdio: ['ignore', fd, fd] }); }
    finally { closeSync(fd); }
    const started = child.pid ? processStarted(child.pid) : undefined;
    if (built.campaign && built.operation.campaign && child.pid) writeLock(lockPath(root, built.campaign), { id, pid: child.pid, processStarted: started });
    job.pid = child.pid; job.processStarted = started; job.processGroup = process.platform !== 'win32'; job.state = 'running'; job.updatedAt = new Date().toISOString(); writeJob(dir, job);
    child.once('error', () => { job.state = 'failed'; job.updatedAt = new Date().toISOString(); writeJob(dir, job); release(); });
    child.once('exit', (code) => {
      try {
        const current = JSON.parse(readFileSync(recordPath(dir, id), 'utf8')) as Job;
        const childrenAlive = (current.childPids ?? []).some(pid => sameGroup(pid, current.childStarted?.[pid]));
        current.state = childrenAlive ? 'running' : current.cancelRequested ? 'cancelled' : code === 0 ? 'succeeded' : 'failed';
        current.exitCode = code; current.updatedAt = new Date().toISOString(); writeJob(dir, current);
        if (!childrenAlive) release();
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    });
    return job;
  } catch (error) { release(); throw error; }
}
function dirs(root: string): string[] {
  const result = [logDir(root)], projects = join(realpathSync(resolve(root)), 'projects');
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
    const base = realpathSync(resolve(root)), rel = relative(base, dir);
    let part = base, unsafe = false;
    for (const segment of rel.split(sep)) { part = join(part, segment); if (lstatSync(part).isSymbolicLink()) { unsafe = true; break; } }
    if (unsafe) continue;
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.json') || !idPattern.test(name.slice(0, -5)) || lstatSync(join(dir, name)).isSymbolicLink()) continue;
      try {
        const job = JSON.parse(readFileSync(join(dir, name), 'utf8')) as Job;
        if (job.id !== name.slice(0, -5)) continue;
        if ((job.state === 'running' || job.state === 'queued') && job.pid && !sameProcess(job.pid, job.processStarted) && !(job.childPids ?? []).some(pid => sameGroup(pid, job.childStarted?.[pid]))) {
          const current = JSON.parse(readFileSync(join(dir, name), 'utf8')) as Job;
          if (current.state === 'running' || current.state === 'queued') { current.state = current.cancelRequested ? 'cancelled' : current.completed && current.exitCode === 0 ? 'succeeded' : 'failed'; current.updatedAt = new Date().toISOString(); writeJob(dir, current); }
          result.push(current); continue;
        }
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
  const dir = logDir(root, job.campaign), current = JSON.parse(readFileSync(recordPath(dir, id), 'utf8')) as Job;
  if (current.state !== 'running') throw new UserError('Job is not running');
  current.cancelRequested = true; current.updatedAt = new Date().toISOString(); writeJob(dir, current);
  const signal = (pid: number, group: boolean, started?: string) => {
    if (!(group ? sameGroup(pid, started) : sameProcess(pid, started))) return;
    try { process.kill(group ? -pid : pid, 'SIGTERM'); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ESRCH') throw e; }
  };
  signal(job.pid, Boolean(job.processGroup), job.processStarted);
  for (const pid of job.childPids ?? []) signal(pid, process.platform !== 'win32', job.childStarted?.[pid]);
  return current;
}
