import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFileSync, closeSync, existsSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCampaignRef } from '../campaigns.ts';
import { withStudioLock } from '../migrate.ts';
import { UserError } from '../types.ts';
import { buildOperation } from './registry.ts';
import { linuxStat, processAlive, processStarted, sameProcess } from './process.ts';

export type JobState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export interface Job { id: string; operation: string; campaign?: string; state: JobState; createdAt: string; updatedAt: string; pid?: number; processStarted?: string; childStarted?: Record<string, string>; exitCode?: number | null; completed?: boolean; command: string; cancelRequested?: boolean; processGroup?: boolean; childPids?: number[] }
export class JobConflict extends Error { owner: string; constructor(owner: string) { super(`Campaign is locked by ${owner}`); this.owner = owner; } }
export class JobNotFound extends UserError { constructor() { super('Job not found'); } }
export class JobNotRunning extends UserError { constructor() { super('Job is not running'); } }
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const bin = fileURLToPath(new URL('../../bin/bstudio.mjs', import.meta.url));
export function processGroupRunning(pid: number): boolean {
  if (process.platform === 'linux') {
    try {
      for (const name of readdirSync('/proc')) {
        if (!/^\d+$/.test(name)) continue;
        const stat = linuxStat(Number(name));
        if (stat && Number(stat[2]) === pid && stat[0] !== 'Z') return true;
      }
      return false;
    } catch { /* Fall back to the OS group probe if procfs is unavailable. */ }
  }
  try { process.kill(process.platform === 'win32' ? pid : -pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
}
function sameGroup(pid: number, started?: string): boolean {
  const current = started ? processStarted(pid) : undefined;
  if (started && current && current !== started && !(current.startsWith('linux:') && /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s/.test(started))) return false;
  return processGroupRunning(pid);
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
  return create ? withStudioLock(root, () => resolveCampaignDirectory(root, ref, true)) : resolveCampaignDirectory(root, ref, false);
}
function resolveCampaignDirectory(root: string, ref: string, create: boolean): string {
  const { project, campaign } = parseCampaignRef(ref);
  const projects = join(resolve(root), 'projects');
  const projectDir = join(projects, project);
  for (const path of [projects, projectDir]) {
    if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new UserError('Unsafe job directory');
  }
  if (existsSync(join(projectDir, 'brief.md')) || existsSync(join(projectDir, '.bstudio-migration.json')))
    throw new UserError(`Campaign migration is incomplete for ${projectDir}; resolve the migration warning before retrying`);
  const metadata = join(projectDir, 'project.yml');
  if (!existsSync(metadata) || lstatSync(metadata).isSymbolicLink()) throw new UserError(`Project ${project} does not exist; run bstudio project new ${project}`);
  const path = join(projectDir, 'campaigns', campaign);
  if (!create && !existsSync(path)) throw new UserError(`Campaign not found: ${ref}`);
  return safeDir(root, ['projects', project, 'campaigns', campaign]);
}
function logDir(root: string, ref?: string): string { return ref ? safeDir(campaignDirectory(root, ref), ['logs', 'jobs']) : safeDir(root, ['logs', 'jobs']); }
function recordPath(dir: string, id: string): string { if (!idPattern.test(id)) throw new UserError('Invalid job id'); return join(dir, `${id}.json`); }
function writeJob(dir: string, job: Job): void {
  const path = recordPath(dir, job.id), temp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temp, JSON.stringify(job) + '\n', { mode: 0o600, flag: 'wx' }); renameSync(temp, path);
}
function updateJob(root: string, dir: string, id: string, update: (job: Job) => void): Job {
  return withStudioLock(root, () => {
    const job = JSON.parse(readFileSync(recordPath(dir, id), 'utf8')) as Job;
    if (job.id !== id) throw new UserError('Invalid job record');
    update(job);
    writeJob(dir, job);
    return job;
  });
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
  return (lock.processStarted ? sameProcess(lock.pid, lock.processStarted) : processAlive(lock.pid)) || (lock.childPids ?? []).some(pid => sameGroup(pid, lock.childStarted?.[pid]));
}
/** Inspect the campaign lock without recovering or changing it. */
export function campaignLockStatus(root: string, ref: string): 'absent' | 'running' | 'stale' {
  const path = lockPath(root, ref);
  const lock = readLock(path);
  if (lock) return !Number.isSafeInteger(lock.pid) || lock.pid <= 0 || lockAlive(lock) ? 'running' : 'stale';
  try { return Date.now() - statSync(path).mtimeMs < 30000 ? 'running' : 'stale'; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'absent'; throw error; }
}
export function acquireCampaignLock(root: string, ref: string, id: string = randomUUID()): () => void {
  return withStudioLock(root, () => {
    const path = lockPath(root, ref);
    for (;;) {
      try {
        const temp = `${path}.${randomUUID()}.tmp`;
        const contents = JSON.stringify({ id, pid: process.pid, processStarted: processStarted(process.pid) });
        try {
          writeFileSync(temp, contents, { mode: 0o600, flag: 'wx' });
          try { linkSync(temp, path); }
          catch (error) {
            if (!['EPERM', 'ENOTSUP', 'EOPNOTSUPP'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
            writeFileSync(path, contents, { mode: 0o600, flag: 'wx' });
          }
        }
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
  });
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
    finish: (code, cancelled) => { try { updateJob(root, dir, id, current => { current.exitCode = code; current.state = cancelled || current.cancelRequested ? 'cancelled' : code === 0 ? 'succeeded' : 'failed'; current.updatedAt = new Date().toISOString(); }); } finally { release(); } },
  };
}
/** The spawned CLI records its outcome even if its launching dashboard has exited. */
export function finishSpawnedJob(root: string, ref: string | undefined, id: string, code: number, cancelled = false): void {
  const dir = logDir(root, ref);
  updateJob(root, dir, id, job => {
    if (job.campaign !== ref) throw new UserError('Invalid job record');
    job.exitCode = code; job.completed = true; job.cancelRequested ||= cancelled; job.updatedAt = new Date().toISOString();
  });
}
export function updateJobProcesses(root: string, ref: string | undefined, id: string, pids: number[]): void {
  const dir = logDir(root, ref);
  const job = updateJob(root, dir, id, job => {
    if (job.campaign !== ref) throw new UserError('Invalid job record');
    job.childPids = pids; job.childStarted = Object.fromEntries(pids.flatMap(pid => { const started = processStarted(pid); return started ? [[String(pid), started]] : []; })); job.updatedAt = new Date().toISOString();
  });
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
    const running = updateJob(root, dir, id, current => { current.pid = child.pid; current.processStarted = started; current.processGroup = process.platform !== 'win32'; current.state = 'running'; current.updatedAt = new Date().toISOString(); });
    child.once('error', () => {
      try {
        updateJob(root, dir, id, current => { current.state = 'failed'; current.updatedAt = new Date().toISOString(); });
        release();
      } catch (recordError) { console.error('Failed to update job after spawn error:', recordError); }
    });
    child.once('exit', (code) => {
      try {
        let childrenAlive = false;
        updateJob(root, dir, id, current => {
          childrenAlive = (current.childPids ?? []).some(pid => sameGroup(pid, current.childStarted?.[pid]));
          current.state = childrenAlive ? 'running' : current.cancelRequested ? 'cancelled' : code === 0 ? 'succeeded' : 'failed';
          current.exitCode = code; current.updatedAt = new Date().toISOString();
        });
        if (!childrenAlive) release();
      } catch (error) { console.error('Failed to update job after exit:', error); }
    });
    return running;
  } catch (error) { release(); throw error; }
}
function dirs(root: string): string[] {
  const result = [logDir(root)], projects = join(realpathSync(resolve(root)), 'projects');
  if (!existsSync(projects) || lstatSync(projects).isSymbolicLink()) return result;
  for (const project of readdirSync(projects, { withFileTypes: true })) {
    if (!project.isDirectory() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(project.name)) continue;
    const p = join(projects, project.name);
    const legacy = join(p, 'logs', 'jobs'); if (existsSync(legacy)) result.push(legacy);
    const campaigns = join(p, 'campaigns'); if (!existsSync(campaigns) || lstatSync(campaigns).isSymbolicLink()) continue;
    for (const c of readdirSync(campaigns, { withFileTypes: true })) if (c.isDirectory() && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c.name)) { const d = join(campaigns, c.name, 'logs', 'jobs'); if (existsSync(d)) result.push(d); }
  }
  return result;
}
type LocatedJob = { job: Job; dir: string };
function locatedJobs(root: string): LocatedJob[] {
  const result: LocatedJob[] = [];
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
          const current = updateJob(root, dir, job.id, current => {
            if ((current.state === 'running' || current.state === 'queued') && current.pid && !sameProcess(current.pid, current.processStarted) && !(current.childPids ?? []).some(pid => sameGroup(pid, current.childStarted?.[pid]))) {
              current.state = current.cancelRequested ? 'cancelled' : current.completed && current.exitCode === 0 ? 'succeeded' : 'failed'; current.updatedAt = new Date().toISOString();
            }
          });
          result.push({ job: current, dir }); continue;
        }
        result.push({ job, dir });
      } catch { /* A damaged record cannot be used to control processes. */ }
    }
  }
  return result.sort((a, b) => b.job.createdAt.localeCompare(a.job.createdAt));
}
export function listJobs(root: string): Job[] { return locatedJobs(root).map(({ job }) => job); }
function findLocatedJob(root: string, id: string): LocatedJob { if (!idPattern.test(id)) throw new UserError('Invalid job id'); const found = locatedJobs(root).find(({ job }) => job.id === id); if (!found) throw new JobNotFound(); return found; }
export function findJob(root: string, id: string): Job { return findLocatedJob(root, id).job; }
export function jobLog(root: string, id: string): string {
  const { dir } = findLocatedJob(root, id), path = join(dir, `${id}.log`);
  try { if (lstatSync(path).isSymbolicLink()) throw new UserError('Unsafe job log'); return readFileSync(path, 'utf8'); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return ''; throw e; }
}
export function cancelJob(root: string, id: string): Job {
  const { dir } = findLocatedJob(root, id);
  const current = updateJob(root, dir, id, current => {
    if (current.state !== 'running' || !current.pid) throw new JobNotRunning();
    current.cancelRequested = true; current.updatedAt = new Date().toISOString();
  });
  const signal = (pid: number, group: boolean, started?: string) => {
    if (!(group ? sameGroup(pid, started) : sameProcess(pid, started))) return;
    try { process.kill(group ? -pid : pid, 'SIGTERM'); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ESRCH') throw e; }
  };
  signal(current.pid!, Boolean(current.processGroup), current.processStarted);
  for (const pid of current.childPids ?? []) signal(pid, process.platform !== 'win32', current.childStarted?.[pid]);
  return current;
}
