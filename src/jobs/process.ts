import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export function linuxStat(pid: number): string[] | undefined {
  try { const raw = readFileSync(`/proc/${pid}/stat`, 'utf8'); const end = raw.lastIndexOf(')'); return end < 0 ? undefined : raw.slice(end + 2).trim().split(/\s+/); }
  catch { return undefined; }
}

export function processAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  if (process.platform === 'linux' && linuxStat(pid)?.[0] === 'Z') return false;
  try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
}

export function processStarted(pid: number): string | undefined {
  if (process.platform === 'linux') {
    const started = linuxStat(pid)?.[19];
    return started ? `linux:${started}` : undefined;
  }
  try { return execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 1000 }).trim() || undefined; }
  catch { return undefined; }
}

export function sameProcess(pid: number, started?: string): boolean {
  if (!processAlive(pid)) return false;
  const current = processStarted(pid);
  if (!started || !current) return true;
  // Records written before procfs identities used ps's textual date.
  if (current.startsWith('linux:') && /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s/.test(started)) return true;
  return current === started;
}
