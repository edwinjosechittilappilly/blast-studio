import { existsSync } from 'node:fs';
import { containedPath, parseCampaignRef } from '../campaigns.ts';
import { readPlan } from '../plan.ts';
import { UserError } from '../types.ts';

type Kind = 'id' | 'campaign' | 'ids' | 'text' | 'url' | 'path' | 'number' | 'bool' | 'repo' | 'sha' | 'blockerTarget' | 'index';
type Field = { kind: Kind; required?: boolean; positional?: boolean; flag?: string; multiple?: boolean };
export type Operation = { fields: Record<string, Field>; campaign: boolean; paid: boolean; step: string; requiresTTY: boolean };
const campaign: Field = { kind: 'campaign', required: true, positional: true };
const id = (required = false): Field => ({ kind: 'id', required, positional: true });
const option = (kind: Kind, flag: string): Field => ({ kind, flag });
const scope = { platforms: option('ids', '--platforms'), assets: option('ids', '--assets') };
const inputs = { idea: option('text', '--idea'), note: option('text', '--note'), url: option('url', '--url'), pr: option('number', '--pr'), commit: option('sha', '--commit'), repo: option('repo', '--repo'), mbBrief: option('path', '--mb-brief'), force: option('bool', '--force') };
const operation = (step: string, fields: Record<string, Field>, paid = false, campaignScoped = true): Operation => ({ step, fields, paid, campaign: campaignScoped, requiresTTY: false });
/** All command vectors originate here; callers cannot supply flags or executable paths. */
export const operations: Readonly<Record<string, Operation>> = {
  init: operation('init', {}, false, false), doctor: operation('doctor', {}, false, false),
  'project new': operation('project', { project: id(true), repo: option('repo', '--repo'), url: { ...option('url', '--url'), multiple: true }, note: { ...option('text', '--note'), multiple: true } }, false, false),
  'project list': operation('project', {}, false, false),
  'project rename': operation('project', { project: id(true), destination: id(true) }, false, false),
  'campaign rename': operation('campaign', { source: { kind: 'campaign', required: true, positional: true }, destination: { kind: 'campaign', required: true, positional: true } }, false, false),
  new: operation('new', { campaign, ...inputs }, true),
  brief: operation('brief', { campaign, ...inputs }),
  plan: operation('plan', { campaign, ...scope }, true),
  make: operation('make', { campaign, ...scope }, true),
  render: operation('render', { campaign, ...scope, regen: option('bool', '--regen') }, true),
  review: operation('review', { campaign, platforms: scope.platforms }, true),
  revise: operation('revise', { campaign, note: inputs.note, asset: option('id', '--asset'), platform: option('id', '--platform'), feedbackOnly: option('bool', '--feedback-only') }, true),
  accept: operation('accept', { campaign, platform: id(true), reason: { ...option('text', '--reason'), required: true } }),
  confirm: operation('confirm', { campaign, asset: id(true), trademarkChecked: option('bool', '--trademark-checked'), license: option('text', '--license') }),
  export: operation('export', { campaign, mb: option('path', '--mb'), force: inputs.force, local: option('bool', '--local'), dir: option('bool', '--dir') }),
  mark: operation('mark', { campaign, platform: id(true), url: { ...inputs.url, required: true } }),
  status: operation('status', { campaign: { ...campaign, required: false }, verbose: option('bool', '--verbose') }, false, false),
  library: operation('library', {}, false, false),
  'budget show': operation('budget', {}, false, false),
  'budget set': operation('budget', { amount: { kind: 'number', required: true, positional: true } }, false, false),
  'budget set-project': operation('budget', { amount: { kind: 'number', required: true, positional: true } }, false, false),
  'sources check': operation('sources', { only: option('ids', '--only'), write: option('bool', '--write') }, false, false),
  'sources verify': operation('sources', { source: id(true) }, false, false),
  'auth list': operation('auth', {}, false, false),
  history: operation('history', { campaign }, false, false),
  restore: operation('restore', { campaign, version: { kind: 'number', required: true, positional: true } }),
  'feedback list': operation('feedback', { campaign }, false, false),
  'feedback add': operation('feedback', { campaign, note: { ...inputs.note, required: true }, asset: option('id', '--asset'), platform: option('id', '--platform') }),
  'feedback rm': operation('feedback', { campaign, id: id(true) }),
  'blockers resolve': operation('blockers', { campaign, target: { kind: 'blockerTarget', required: true, positional: true }, index: { kind: 'index', required: true, positional: true }, text: { ...option('text', '--text'), required: true }, reason: { ...option('text', '--reason'), required: true } }),
};
export function operationRequiresTTY(name: string, operation: Operation, imageProvider?: string, root?: string, ref?: string): boolean {
  if (operation.requiresTTY || (name === 'new' && imageProvider === 'omp')) return true;
  if (!['render', 'make', 'revise'].includes(name) || imageProvider !== 'omp' || !root || !ref) return false;
  const { project, campaign } = parseCampaignRef(ref);
  const projectDir = containedPath(root, 'projects', project);
  const dir = containedPath(projectDir, 'campaigns', campaign);
  const plan = containedPath(dir, 'plan.yml');
  return existsSync(plan) && readPlan(dir).some(entry => entry.assets.some(asset => asset.kind === 'illustration'));
}
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function campaignRef(value: unknown): string {
  if (typeof value !== 'string') throw new UserError('Invalid campaign address');
  parseCampaignRef(value);
  return value;
}
function validate(value: unknown, kind: Kind, key: string): string | boolean {
  if (kind === 'bool') { if (typeof value !== 'boolean') throw new UserError(`Invalid ${key}`); return value; }
  if (typeof value !== 'string' || !value || value.length > 4096 || value.includes('\0')) throw new UserError(`Invalid ${key}`);
  if (kind === 'campaign') return campaignRef(value);
  if (kind === 'id' && !slug.test(value)) throw new UserError(`Invalid ${key}`);
  if (kind === 'ids' && !value.split(',').every(s => slug.test(s))) throw new UserError(`Invalid ${key}`);
  if (kind === 'blockerTarget' && !/^(?:post|asset):[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) throw new UserError(`Invalid ${key}`);
  if (kind === 'index' && (!/^(?:0|[1-9]\d*)$/.test(value) || !Number.isSafeInteger(Number(value)))) throw new UserError(`Invalid ${key}`);
  if ((key === 'reason' || key === 'text') && !value.trim()) throw new UserError(`Invalid ${key}`);
  if (kind === 'number' && !/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value)) throw new UserError(`Invalid ${key}`);
  if ((key === 'pr' || key === 'version') && !/^\d+$/.test(value)) throw new UserError(`Invalid ${key}`);
  if (kind === 'sha' && !/^[a-f\d]{4,64}$/i.test(value)) throw new UserError(`Invalid ${key}`);
  if (kind === 'repo' && value !== 'local' && !/^[\w.-]+\/[\w.-]+$/.test(value)) throw new UserError(`Invalid ${key}`);
  if (kind === 'url') { try { const u = new URL(value); if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error(); } catch { throw new UserError(`Invalid ${key}`); } }
  if (kind === 'path' && (value.startsWith('-') || value.split(/[\\/]/).includes('..'))) throw new UserError(`Invalid ${key}`);
  return value;
}
export function buildOperation(name: string, raw: unknown, options: { imageProvider?: string; root?: string } = {}): { operation: Operation; args: string[]; campaign?: string; command: string; requiresTTY: boolean } {
  const op = Object.hasOwn(operations, name) ? operations[name] : undefined;
  if (!op || !raw || typeof raw !== 'object' || Array.isArray(raw)) throw new UserError('Unknown operation or invalid arguments');
  const values = raw as Record<string, unknown>;
  if (Object.keys(values).some(k => !Object.hasOwn(op.fields, k))) throw new UserError('Unknown argument');
  if (name === 'export' && values.local === true && (values.force === true || values.mb !== undefined)) throw new UserError('Local export cannot be combined with force or a Market Blaster path');
  const [cmd, ...sub] = name.split(' '), positional: string[] = [], flags: string[] = [];
  let ref: string | undefined;
  for (const [key, field] of Object.entries(op.fields)) {
    const v = values[key];
    if (v === undefined) { if (field.required) throw new UserError(`Missing ${key}`); continue; }
    const items = field.multiple && Array.isArray(v) ? v : [v];
    if (!items.length) throw new UserError(`Invalid ${key}`);
    for (const item of items) {
      const parsed = validate(item, field.kind, key);
      if (name === 'project new' && key === 'repo' && parsed === 'local') throw new UserError('Invalid repo');
      if (key === 'campaign') ref = parsed as string;
      if (field.positional) positional.push(String(parsed));
      else if (field.flag && parsed !== false) {
        if (parsed === true) flags.push(field.flag);
        else flags.push(`${field.flag}=${parsed}`);
      }
    }
  }
  // Feedback and blockers syntax place the action after the campaign.
  const args = cmd === 'feedback' || cmd === 'blockers' ? [cmd, ...positional.slice(0, 1), ...sub, ...positional.slice(1), ...flags] : [cmd, ...sub, ...positional, ...flags];
  const quote = (s: string) => /^[a-zA-Z0-9_./:=,-]+$/.test(s) ? s : `'${s.replaceAll("'", "'\\''")}'`;
  return { operation: op, args, campaign: ref, command: ['bstudio', ...args].map(quote).join(' '), requiresTTY: operationRequiresTTY(name, op, options.imageProvider, options.root, ref) };
}
