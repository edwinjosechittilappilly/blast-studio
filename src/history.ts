import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { UserError } from './types.ts';

const roots = ['posts', 'assets', 'reviews', 'review.md'];

export function historyEntries(dir: string): string[] {
  const root = join(dir, 'history');
  return existsSync(root) ? readdirSync(root).filter(name => /^\d+-/.test(name)).sort((a, b) => Number(b.split('-')[0]) - Number(a.split('-')[0])) : [];
}

function same(a: string, b: string): boolean {
  const ae = existsSync(a), be = existsSync(b);
  if (!ae || !be) return ae === be;
  const as = statSync(a), bs = statSync(b);
  if (as.isDirectory() !== bs.isDirectory()) return false;
  if (!as.isDirectory()) return as.size === bs.size && readFileSync(a).equals(readFileSync(b));
  const ac = readdirSync(a).sort(), bc = readdirSync(b).sort();
  return ac.length === bc.length && ac.every((name, i) => name === bc[i] && same(join(a, name), join(b, name)));
}


export function snapshot(dir: string, step: string, preserve?: string): void {
  const entries = historyEntries(dir), root = join(dir, 'history');
  if (!roots.some(name => existsSync(join(dir, name)))) return;
  if (entries.length && roots.every(name => same(join(dir, name), join(root, entries[0], name)))) return;
  const n = entries.length ? Number(entries[0].split('-')[0]) + 1 : 1;
  const target = join(root, `${n}-${step}-${new Date().toISOString().replace(/:/g, '-')}`);
  mkdirSync(target, { recursive: true });
  for (const name of roots) if (existsSync(join(dir, name))) cpSync(join(dir, name), join(target, name), { recursive: true });
  const old = historyEntries(dir).filter(name => name !== preserve);
  for (const name of old.slice(preserve ? 19 : 20)) rmSync(join(root, name), { recursive: true, force: true });
}

export function restore(dir: string, number: string): void {
  const entry = historyEntries(dir).find(name => name.split('-')[0] === number);
  if (!entry) throw new UserError(`Unknown history snapshot: ${number}`);
  snapshot(dir, 'restore', entry);
  const source = join(dir, 'history', entry);
  for (const name of roots) {
    rmSync(join(dir, name), { recursive: true, force: true });
    if (existsSync(join(source, name))) cpSync(join(source, name), join(dir, name), { recursive: true });
  }
}
