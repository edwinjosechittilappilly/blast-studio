import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { UserError, type FeedbackEntry } from './types.ts';

export function loadFeedback(projectDir: string): FeedbackEntry[] {
  const file = join(projectDir, 'feedback.yml');
  if (!existsSync(file)) return [];
  const entries: unknown = parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(entries) || !entries.every(entry => entry && typeof entry.id === 'string' && entry.target && typeof entry.target === 'object' && !Array.isArray(entry.target) && (entry.target.asset === undefined || typeof entry.target.asset === 'string') && (entry.target.platform === undefined || typeof entry.target.platform === 'string') && typeof entry.note === 'string' && typeof entry.at === 'string' && (entry.status === 'pending' || entry.status === 'applied'))) throw new UserError('feedback.yml: expected a list of feedback entries');
  return entries as FeedbackEntry[];
}

export function addFeedback(projectDir: string, target: FeedbackEntry['target'], note: string): FeedbackEntry {
  const entries = loadFeedback(projectDir);
  const entry: FeedbackEntry = { id: randomUUID(), target, note, at: new Date().toISOString(), status: 'pending' };
  entries.push(entry);
  writeFileSync(join(projectDir, 'feedback.yml'), stringify(entries));
  return entry;
}

export function markApplied(projectDir: string, ids: string[]): void {
  const entries = loadFeedback(projectDir), selected = new Set(ids), appliedAt = new Date().toISOString();
  for (const entry of entries) if (selected.has(entry.id)) { entry.status = 'applied'; entry.appliedAt = appliedAt; }
  writeFileSync(join(projectDir, 'feedback.yml'), stringify(entries));
}
