import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { PLATFORM_IDS, UserError } from './types.ts';
import type { PlanEntry } from './types.ts';

export function readPlan(projectDir: string): PlanEntry[] {
  const path = join(projectDir, 'plan.yml');
  let value: unknown;
  try { value = parse(readFileSync(path, 'utf8')); } catch (e) { throw new UserError(`plan.yml: ${String(e)}`); }
  return validatePlan(value);
}

export function validatePlan(value: unknown): PlanEntry[] {
  if (!Array.isArray(value)) throw new UserError(`plan.yml: expected an array, got ${JSON.stringify(value)}`);
  const errors: string[] = [], seen = new Set<string>();
  const assets = new Map<string, { kind: unknown; aspect: unknown }>();
  const types = ['text', 'thread', 'article', 'image', 'carousel', 'diagram', 'poster', 'logo', 'video', 'terminal-demo'];
  const kinds = ['card', 'poster', 'carousel', 'logo', 'diagram', 'video', 'terminal-demo', 'illustration', 'voiceover'];
  for (const [index, p] of value.entries()) {
    const name = typeof p?.platform === 'string' ? p.platform : `plan[${index}]`;
    const problem = (field: string, actual: unknown, expectation: string) => errors.push(`${name}.${field} ${JSON.stringify(actual) ?? 'undefined'} ${expectation}`);
    if (!p || typeof p !== 'object' || Array.isArray(p)) { errors.push(`${name} ${JSON.stringify(p)} must be an object`); continue; }
    if (!PLATFORM_IDS.includes(p.platform)) problem('platform', p.platform, `is not one of ${PLATFORM_IDS.join(', ')}`);
    if (seen.has(p.platform)) problem('platform', p.platform, 'is duplicated');
    seen.add(p.platform);
    if (!types.includes(p.type)) problem('type', p.type, `is not one of ${types.join(', ')}`);
    if (typeof p.angle !== 'string' || !p.angle.trim()) problem('angle', p.angle, 'must be a nonempty string');
    if (!Array.isArray(p.hooks) || p.hooks.length !== 3) problem('hooks', p.hooks, 'must contain exactly three hooks');
    else p.hooks.forEach((hook: unknown, i: number) => { if (typeof hook !== 'string' || !hook.trim()) problem(`hooks[${i}]`, hook, 'must be a nonempty string'); });
    if (!Array.isArray(p.assets)) { problem('assets', p.assets, 'must be an array'); continue; }
    for (const [i, a] of p.assets.entries()) {
      const field = `assets[${i}]`;
      if (!a || typeof a !== 'object' || Array.isArray(a)) { problem(field, a, 'must be an object'); continue; }
      if (typeof a.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(a.id)) problem(`${field}.id`, a.id, 'must be a lowercase asset id');
      if (!kinds.includes(a.kind)) problem(`${field}.kind`, a.kind, `is not one of ${kinds.join(', ')}`);
      if (typeof a.brief !== 'string' || !a.brief.trim()) problem(`${field}.brief`, a.brief, 'must be a nonempty string');
      if (a.aspect !== undefined && (typeof a.aspect !== 'string' || !a.aspect.trim())) problem(`${field}.aspect`, a.aspect, 'must be a nonempty string');
      if (typeof a.id === 'string') {
        const prior = assets.get(a.id);
        if (prior && prior.kind !== a.kind) problem(`${field}.kind`, a.kind, `conflicts with shared asset ${a.id} kind ${JSON.stringify(prior.kind)}`);
        if (prior && prior.aspect !== undefined && a.aspect !== undefined && prior.aspect !== a.aspect) problem(`${field}.aspect`, a.aspect, `conflicts with shared asset ${a.id} aspect ${JSON.stringify(prior.aspect)}`);
        if (!prior) assets.set(a.id, { kind: a.kind, aspect: a.aspect });
        else if (prior.aspect === undefined) prior.aspect = a.aspect;
      }
    }
  }
  if (errors.length) throw new UserError(errors.join('\n'));
  return value as PlanEntry[];
}
