import { randomUUID } from 'node:crypto';
import { existsSync, linkSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { UserError, type FeedbackEntry } from './types.ts';
import { readPlan } from './plan.ts';
import { loadPosts } from './posts.ts';
import type { PlatformId } from './types.ts';

export function validateFeedbackTarget(projectDir: string, target: FeedbackEntry['target']): void {
  const plan = readPlan(projectDir), posts = loadPosts(projectDir), { asset, platform } = target;
  if (asset !== undefined && (!asset || !plan.some(p => p.assets.some(a => a.id === asset)) || !existsSync(join(projectDir, 'assets', asset, 'asset.yml')))) throw new UserError(`Unknown asset: ${asset}`);
  if (platform !== undefined && (!platform || !plan.some(p => p.platform === platform) || !posts.has(platform as PlatformId))) throw new UserError(`Unknown platform: ${platform}`);
  if (asset && platform && !plan.some(p => p.platform === platform && p.assets.some(a => a.id === asset))) throw new UserError(`Asset ${asset} is not planned for ${platform}`);
}

function writeFeedback(projectDir: string, entries: FeedbackEntry[]): void {
  const file = join(projectDir, 'feedback.yml'), temp = join(projectDir, `.feedback-${randomUUID()}.tmp`);
  try { writeFileSync(temp, stringify(entries), { flag: 'wx' }); renameSync(temp, file); }
  finally { if (existsSync(temp)) unlinkSync(temp); }
}

// Publish a fully written lock atomically so other processes never observe a partial owner.
function updateFeedback<T>(projectDir: string, update: (entries: FeedbackEntry[]) => T): T {
  const lock = join(projectDir, '.feedback.lock'), temp = join(projectDir, `.feedback-${randomUUID()}.lock`);
  writeFileSync(temp, String(process.pid), { mode: 0o600, flag: 'wx' });
  let acquired = false;
  try {
    const deadline = Date.now() + 30000, waiter = new Int32Array(new SharedArrayBuffer(4));
    for (;;) {
      try { linkSync(temp, lock); acquired = true; break; }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        if (Date.now() >= deadline) throw new UserError(`Feedback is locked at ${lock}; remove the lock only after confirming no feedback update is running`);
        Atomics.wait(waiter, 0, 0, 10);
      }
    }
    const entries = loadFeedback(projectDir);
    const result = update(entries);
    writeFeedback(projectDir, entries);
    return result;
  } finally {
    try { if (acquired) unlinkSync(lock); }
    finally { unlinkSync(temp); }
  }
}

export function loadFeedback(projectDir: string): FeedbackEntry[] {
  const file = join(projectDir, 'feedback.yml');
  if (!existsSync(file)) return [];
  const entries: unknown = parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(entries) || !entries.every(entry => entry && typeof entry.id === 'string' && entry.target && typeof entry.target === 'object' && !Array.isArray(entry.target) && (entry.target.asset === undefined || typeof entry.target.asset === 'string') && (entry.target.platform === undefined || typeof entry.target.platform === 'string') && typeof entry.note === 'string' && typeof entry.at === 'string' && (entry.status === 'pending' || entry.status === 'applied' || entry.status === 'rejected') && (entry.rejectedReason === undefined || typeof entry.rejectedReason === 'string'))) throw new UserError('feedback.yml: expected a list of feedback entries');
  return entries as FeedbackEntry[];
}

export function addFeedback(projectDir: string, target: FeedbackEntry['target'], note: string): FeedbackEntry {
  validateFeedbackTarget(projectDir, target);
  return updateFeedback(projectDir, entries => {
    const entry: FeedbackEntry = { id: randomUUID(), target, note, at: new Date().toISOString(), status: 'pending' };
    entries.push(entry);
    return entry;
  });
}

export function removeFeedback(projectDir: string, id: string): void {
  const entries = loadFeedback(projectDir), entry = entries.find(item => item.id === id);
  if (!entry) throw new UserError(`Unknown feedback: ${id}`);
  if (entry.status === 'applied') throw new UserError(`Cannot remove applied feedback: ${id}`);
  writeFeedback(projectDir, entries.filter(item => item.id !== id));
}

export function markApplied(projectDir: string, ids: string[]): void {
  updateFeedback(projectDir, entries => {
    const selected = new Set(ids), appliedAt = new Date().toISOString();
    for (const entry of entries) if (selected.has(entry.id)) { entry.status = 'applied'; entry.appliedAt = appliedAt; }
  });
}

export function rejectFeedback(projectDir: string, reasons: Map<string, string>): void {
  updateFeedback(projectDir, entries => {
    for (const entry of entries) {
      const reason = reasons.get(entry.id);
      if (reason !== undefined && entry.status === 'pending') { entry.status = 'rejected'; entry.rejectedReason = reason; }
    }
  });
}
