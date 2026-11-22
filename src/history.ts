import { randomUUID } from 'node:crypto';
import { closeSync, cpSync, existsSync, linkSync, mkdirSync, openSync, readSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { UserError } from './types.ts';

const roots = ['plan.yml', 'posts', 'assets', 'reviews', 'review.md'];

export function historyEntries(dir: string): string[] {
  const root = join(dir, 'history');
  return existsSync(root) ? readdirSync(root).filter(name => /^\d+-/.test(name)).sort((a, b) => Number(b.split('-')[0]) - Number(a.split('-')[0])) : [];
}

function sameFile(a: string, b: string): boolean {
  if (!existsSync(b)) return false;
  const as = statSync(a), bs = statSync(b);
  if (!as.isFile() || !bs.isFile() || as.size !== bs.size || Math.abs(as.mtimeMs - bs.mtimeMs) >= 1) return false;
  const af = openSync(a, 'r'), bf = openSync(b, 'r');
  try {
    const ab = Buffer.allocUnsafe(65536), bb = Buffer.allocUnsafe(65536);
    for (;;) {
      const n = readSync(af, ab, 0, ab.length, null), m = readSync(bf, bb, 0, bb.length, null);
      if (n !== m || !ab.subarray(0, n).equals(bb.subarray(0, m))) return false;
      if (!n) return true;
    }
  } finally { closeSync(af); closeSync(bf); }
}

function same(a: string, b: string): boolean {
  const ae = existsSync(a), be = existsSync(b);
  if (!ae || !be) return ae === be;
  const as = statSync(a), bs = statSync(b);
  if (as.isDirectory() !== bs.isDirectory()) return false;
  if (!as.isDirectory()) return sameFile(a, b);
  const ac = readdirSync(a).sort(), bc = readdirSync(b).sort();
  return ac.length === bc.length && ac.every((name, i) => name === bc[i] && same(join(a, name), join(b, name)));
}

function copySnapshot(source: string, target: string, previous: string): void {
  const st = statSync(source);
  if (st.isDirectory()) {
    mkdirSync(target, { recursive: true });
    for (const name of readdirSync(source)) copySnapshot(join(source, name), join(target, name), join(previous, name));
  } else if (sameFile(source, previous)) linkSync(previous, target);
  else cpSync(source, target, { preserveTimestamps: true });
}

export function snapshot(dir: string, step: string, preserve?: string): string | undefined {
  const entries = historyEntries(dir), root = join(dir, 'history');
  if (!roots.some(name => existsSync(join(dir, name)))) return;
  if (entries.length && roots.every(name => same(join(dir, name), join(root, entries[0], name)))) return entries[0];
  const n = entries.length ? Number(entries[0].split('-')[0]) + 1 : 1;
  const name = `${n}-${step}-${new Date().toISOString().replace(/:/g, '-')}`, temp = join(root, `.tmp-${randomUUID()}`);
  mkdirSync(temp, { recursive: true });
  try {
    for (const item of roots) if (existsSync(join(dir, item))) copySnapshot(join(dir, item), join(temp, item), join(root, entries[0] ?? '', item));
    renameSync(temp, join(root, name));
  } finally { rmSync(temp, { recursive: true, force: true }); }
  const old = historyEntries(dir).filter(item => item !== preserve);
  for (const item of old.slice(preserve ? 19 : 20)) rmSync(join(root, item), { recursive: true, force: true });
  return name;
}

export function restore(dir: string, number: string): void {
  const entry = historyEntries(dir).find(name => name.split('-')[0] === number);
  if (!entry) throw new UserError(`Unknown history snapshot: ${number}`);
  const saved = snapshot(dir, 'restore', entry);
  const source = join(dir, 'history', entry), temp = join(dir, `.restore-${randomUUID()}`), stage = join(temp, 'stage'), backup = join(temp, 'backup');
  mkdirSync(stage, { recursive: true }); mkdirSync(backup);
  const moved: string[] = [], installed: string[] = [];
  let keepTemp = false;
  try {
    for (const item of roots) if (existsSync(join(source, item))) cpSync(join(source, item), join(stage, item), { recursive: true, preserveTimestamps: true });
    for (const item of roots) {
      if (existsSync(join(dir, item))) { renameSync(join(dir, item), join(backup, item)); moved.push(item); }
      if (existsSync(join(stage, item))) { renameSync(join(stage, item), join(dir, item)); installed.push(item); }
    }
  } catch (error) {
    try {
      for (const item of installed.reverse()) rmSync(join(dir, item), { recursive: true, force: true });
      for (const item of moved.reverse()) renameSync(join(backup, item), join(dir, item));
    } catch (rollbackError) {
      keepTemp = true;
      throw new UserError(`Restore and rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}. Backup remains at ${backup}; pre-restore state saved as snapshot ${saved?.split('-')[0] ?? 'none'}`);
    }
    throw new UserError(`Restore failed: ${error instanceof Error ? error.message : String(error)}. Pre-restore state saved as snapshot ${saved?.split('-')[0] ?? 'none'}`);
  } finally { if (!keepTemp) rmSync(temp, { recursive: true, force: true }); }
}
