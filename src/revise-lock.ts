import { randomUUID } from 'node:crypto';
import { existsSync, linkSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { UserError } from './types.ts';

export function revisionLockStatus(dir: string): 'absent' | 'running' | 'stale' {
  const path = join(dir, '.revise.lock');
  try {
    const value = readFileSync(path, 'utf8').trim();
    if (!/^\d+$/.test(value) || Number(value) <= 0) return Date.now() - statSync(path).mtimeMs > 30000 ? 'stale' : 'running';
    try { process.kill(Number(value), 0); return 'running'; }
    catch (error) { return (error as NodeJS.ErrnoException).code === 'ESRCH' ? 'stale' : 'running'; }
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'absent'; throw error; }
}

export function acquireRevisionLock(dir: string, slug: string): () => void {
  const path = join(dir, '.revise.lock'), temp = join(dir, `.revise-${randomUUID()}.lock`);
  writeFileSync(temp, String(process.pid), { mode: 0o600, flag: 'wx' });
  try {
    try { linkSync(temp, path); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (revisionLockStatus(dir) !== 'stale') throw new UserError(`Revision already in progress for ${slug} (${path})`);
      // Do not silently remove a lock another process may be inspecting or replacing.
      throw new UserError(`Stale revision lock at ${path}; remove it after confirming no revision is running`);
    }
    const identity = statSync(path);
    return () => { try { const current = statSync(path); if (current.dev === identity.dev && current.ino === identity.ino) unlinkSync(path); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } };
  } finally { if (existsSync(temp)) unlinkSync(temp); }
}
