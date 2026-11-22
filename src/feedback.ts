import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
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

export function loadFeedback(projectDir: string): FeedbackEntry[] {
  const file = join(projectDir, 'feedback.yml');
  if (!existsSync(file)) return [];
  const entries: unknown = parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(entries) || !entries.every(entry => entry && typeof entry.id === 'string' && entry.target && typeof entry.target === 'object' && !Array.isArray(entry.target) && (entry.target.asset === undefined || typeof entry.target.asset === 'string') && (entry.target.platform === undefined || typeof entry.target.platform === 'string') && typeof entry.note === 'string' && typeof entry.at === 'string' && (entry.status === 'pending' || entry.status === 'applied' || entry.status === 'rejected') && (entry.rejectedReason === undefined || typeof entry.rejectedReason === 'string'))) throw new UserError('feedback.yml: expected a list of feedback entries');
  return entries as FeedbackEntry[];
}

export function addFeedback(projectDir: string, target: FeedbackEntry['target'], note: string): FeedbackEntry {
  validateFeedbackTarget(projectDir, target);
  const entries = loadFeedback(projectDir);
  const entry: FeedbackEntry = { id: randomUUID(), target, note, at: new Date().toISOString(), status: 'pending' };
  entries.push(entry);
  writeFeedback(projectDir, entries);
  return entry;
}

export function markApplied(projectDir: string, ids: string[]): void {
  const entries = loadFeedback(projectDir), selected = new Set(ids), appliedAt = new Date().toISOString();
  for (const entry of entries) if (selected.has(entry.id)) { entry.status = 'applied'; entry.appliedAt = appliedAt; }
  writeFeedback(projectDir, entries);
}

export function rejectFeedback(projectDir: string, reasons: Map<string, string>): void {
  const entries = loadFeedback(projectDir);
  for (const entry of entries) {
    const reason = reasons.get(entry.id);
    if (reason !== undefined && entry.status === 'pending') { entry.status = 'rejected'; entry.rejectedReason = reason; }
  }
  writeFeedback(projectDir, entries);
}
