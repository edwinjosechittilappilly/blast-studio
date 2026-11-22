import { UserError } from '../types.ts';

type Kind = 'id' | 'ids' | 'text' | 'url' | 'path' | 'number' | 'bool' | 'repo' | 'sha';
type Field = { kind: Kind; required?: boolean; positional?: boolean; flag?: string };
export type Operation = { fields: Record<string, Field>; campaign: boolean; paid: boolean; step: string; requiresTTY: boolean };
const campaign: Field = { kind: 'id', required: true, positional: true };
const id = (required = false): Field => ({ kind: 'id', required, positional: true });
const option = (kind: Kind, flag: string): Field => ({ kind, flag });
const scope = { platforms: option('ids', '--platforms'), assets: option('ids', '--assets') };
const inputs = { idea: option('text', '--idea'), note: option('text', '--note'), url: option('url', '--url'), pr: option('number', '--pr'), commit: option('sha', '--commit'), repo: option('repo', '--repo'), mbBrief: option('path', '--mb-brief'), force: option('bool', '--force') };
const operation = (step: string, fields: Record<string, Field>, paid = false, campaignScoped = true): Operation => ({ step, fields, paid, campaign: campaignScoped, requiresTTY: false });
/** All command vectors originate here; callers cannot supply flags or executable paths. */
export const operations: Readonly<Record<string, Operation>> = {
  init: operation('init', {}, false, false), doctor: operation('doctor', {}, false, false),
  'project new': operation('project', { project: id(true), ...inputs }, false, false),
  'project list': operation('project', {}, false, false),
  new: operation('new', { campaign, ...inputs, from: option('id', '--from') }, true),
  brief: operation('brief', { campaign, ...inputs }),
  plan: operation('plan', { campaign, ...scope }, true),
  make: operation('make', { campaign, ...scope }, true),
  render: operation('render', { campaign, ...scope, regen: option('bool', '--regen') }, true),
  review: operation('review', { campaign, platforms: scope.platforms }, true),
  revise: operation('revise', { campaign, note: inputs.note, asset: option('id', '--asset'), platform: option('id', '--platform'), feedbackOnly: option('bool', '--feedback-only') }, true),
  accept: operation('accept', { campaign, platform: id(true), reason: { ...option('text', '--reason'), required: true } }),
  confirm: operation('confirm', { campaign, asset: id(true), trademarkChecked: option('bool', '--trademark-checked'), license: option('text', '--license') }),
  export: operation('export', { campaign, mb: option('path', '--mb'), force: inputs.force, dir: option('bool', '--dir') }),
  mark: operation('mark', { campaign, platform: id(true), url: { ...inputs.url, required: true } }),
  status: operation('status', { campaign: { ...campaign, required: false }, verbose: option('bool', '--verbose') }, false, false),
  library: operation('library', {}, false, false),
  'budget show': operation('budget', {}, false, false),
  'budget set': operation('budget', { amount: { kind: 'number', required: true, positional: true } }, false, false),
  'budget set-project': operation('budget', { amount: { kind: 'number', required: true, positional: true } }, false, false),
  'sources check': operation('sources', { only: option('ids', '--only'), write: option('bool', '--write') }, false, false),
  'sources verify': operation('sources', { source: id(true) }, false, false),
  'auth list': operation('auth', {}, false, false),
  history: operation('history', { campaign }),
  restore: operation('restore', { campaign, version: { kind: 'number', required: true, positional: true } }),
  'feedback list': operation('feedback', { campaign }),
  'feedback add': operation('feedback', { campaign, note: { ...inputs.note, required: true }, asset: option('id', '--asset'), platform: option('id', '--platform') }),
  'feedback rm': operation('feedback', { campaign, id: id(true) }),
};
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** A single identity seam, replaceable by the project/campaign resolver. */
export function campaignRef(value: unknown): string {
  if (typeof value !== 'string' || value.length > 201 || !value.split('/').every(s => s.length <= 100 && slug.test(s)) || value.split('/').length > 2) throw new UserError('Invalid campaign address');
  return value;
}
function validate(value: unknown, kind: Kind, key: string): string | boolean {
  if (kind === 'bool') { if (typeof value !== 'boolean') throw new UserError(`Invalid ${key}`); return value; }
  if (typeof value !== 'string' || !value || value.length > 4096 || value.includes('\0')) throw new UserError(`Invalid ${key}`);
  if (kind === 'id' && !slug.test(value)) throw new UserError(`Invalid ${key}`);
  if (kind === 'ids' && !value.split(',').every(s => slug.test(s))) throw new UserError(`Invalid ${key}`);
  if (kind === 'number' && !/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value)) throw new UserError(`Invalid ${key}`);
  if (kind === 'sha' && !/^[a-f\d]{4,64}$/i.test(value)) throw new UserError(`Invalid ${key}`);
  if (kind === 'repo' && value !== 'local' && !/^[\w.-]+\/[\w.-]+$/.test(value)) throw new UserError(`Invalid ${key}`);
  if (kind === 'url') { try { const u = new URL(value); if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error(); } catch { throw new UserError(`Invalid ${key}`); } }
  if (kind === 'path' && (value.startsWith('-') || value.split(/[\\/]/).includes('..'))) throw new UserError(`Invalid ${key}`);
  return value;
}
export function buildOperation(name: string, raw: unknown, options: { imageProvider?: string } = {}): { operation: Operation; args: string[]; campaign?: string; command: string; requiresTTY: boolean } {
  const op = Object.hasOwn(operations, name) ? operations[name] : undefined;
  if (!op || !raw || typeof raw !== 'object' || Array.isArray(raw)) throw new UserError('Unknown operation or invalid arguments');
  const values = raw as Record<string, unknown>;
  if (Object.keys(values).some(k => !Object.hasOwn(op.fields, k))) throw new UserError('Unknown argument');
  const [cmd, ...sub] = name.split(' '), positional: string[] = [], flags: string[] = [];
  let ref: string | undefined;
  for (const [key, field] of Object.entries(op.fields)) {
    const v = values[key];
    if (v === undefined) { if (field.required) throw new UserError(`Missing ${key}`); continue; }
    const parsed = key === 'campaign' ? campaignRef(v) : validate(v, field.kind, key);
    if (key === 'campaign') ref = parsed as string;
    if (field.positional) positional.push(String(parsed));
    else if (field.flag && parsed !== false) {
      if (parsed === true) flags.push(field.flag);
      else if (field.flag === '--assets' || field.flag === '--platforms') flags.push(`${field.flag}=${parsed}`);
      else flags.push(field.flag, String(parsed));
    }
  }
  // Feedback syntax places the action after its campaign.
  const args = cmd === 'feedback' ? [cmd, ...positional.slice(0, 1), ...sub, ...positional.slice(1), ...flags] : [cmd, ...sub, ...positional, ...flags];
  const quote = (s: string) => /^[a-zA-Z0-9_./:=,-]+$/.test(s) ? s : `'${s.replaceAll("'", "'\\''")}'`;
  return { operation: op, args, campaign: ref, command: ['bstudio', ...args].map(quote).join(' '), requiresTTY: op.requiresTTY || (['render', 'new', 'revise'].includes(cmd) && options.imageProvider === 'omp') };
}
