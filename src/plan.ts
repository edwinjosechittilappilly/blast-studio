import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { PLATFORM_IDS, UserError } from './types.ts';
import type { PlanEntry } from './types.ts';

export function readPlan(projectDir: string): PlanEntry[] {
  const path = join(projectDir, 'plan.yml');
  let value: unknown;
  try { value = parse(readFileSync(path, 'utf8')); } catch (e) { throw new UserError(`Cannot read plan.yml: ${String(e)}`); }
  if (!Array.isArray(value)) throw new UserError('plan.yml must be an array of platform plans');
  const seen = new Set<string>(), assets = new Set<string>();
  for (const p of value) {
    if (!p || !PLATFORM_IDS.includes(p.platform) || seen.has(p.platform) || !['text','thread','article','image','carousel','diagram','poster','logo','video','terminal-demo'].includes(p.type) || typeof p.angle !== 'string' || !p.angle.trim() || !Array.isArray(p.hooks) || p.hooks.length !== 3 || !p.hooks.every((h: unknown) => typeof h === 'string' && h.trim()) || !Array.isArray(p.assets)) throw new UserError('Invalid platform plan: expected unique platform, type, angle, three hooks and assets');
    seen.add(p.platform);
    for (const a of p.assets) {
      if (!a || typeof a.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(a.id) || assets.has(a.id) || !['card','poster','carousel','logo','diagram','video','terminal-demo','illustration','voiceover'].includes(a.kind) || typeof a.brief !== 'string' || !a.brief.trim() || (a.aspect !== undefined && typeof a.aspect !== 'string')) throw new UserError(`Invalid asset in plan for ${p.platform}`);
      assets.add(a.id);
    }
  }
  return value as PlanEntry[];
}
