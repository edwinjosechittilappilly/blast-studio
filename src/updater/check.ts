import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPacks, loadSources } from '../packs.ts';
import type { SourceRow } from '../packs.ts';
import type { IO } from '../io.ts';
import { UserError } from '../types.ts';
import { loadConfig } from '../config.ts';

export const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
export interface Result { id: string; status: 'changed' | 'unchanged' | 'new' | 'failed' | 'manual'; fields: string[]; error?: string; old?: string; text?: string }

function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of tag.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) result[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  return result;
}
function matches(name: string, attrs: Record<string, string>, selector: string): boolean {
  if (/^[\w-]+$/.test(selector)) return name === selector.toLowerCase();
  if (/^#[\w-]+$/.test(selector)) return attrs.id === selector.slice(1);
  if (/^\.[\w-]+$/.test(selector)) return (attrs.class ?? '').split(/\s+/).includes(selector.slice(1));
  const m = /^\[([\w-]+)=(?:"([^"]*)"|'([^']*)'|([^\]]+))\]$/.exec(selector);
  if (m) return attrs[m[1].toLowerCase()] === (m[2] ?? m[3] ?? m[4]);
  throw new UserError(`Unsupported selector: ${selector}`);
}
function subtree(html: string, selector: string): string | undefined {
  const tags = /<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>/g; let start = -1, depth = 0, selected = '';
  for (const match of html.matchAll(tags)) {
    const token = match[0]; if (token.startsWith('<!--')) continue;
    const m = /^<(\/)?([\w-]+)([\s\S]*?)>$/.exec(token); if (!m) continue;
    const name = m[2].toLowerCase(), closing = !!m[1], voidTag = /\/$/.test(m[3].trim()) || /^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/.test(name);
    if (start < 0) { if (!closing && matches(name, attributes(m[3]), selector)) { start = match.index! + token.length; selected = name; depth = 1; if (voidTag) return ''; } }
    else if (name === selected) { if (closing && --depth === 0) return html.slice(start, match.index); if (!closing && !voidTag) depth++; }
  }
  return start < 0 ? undefined : html.slice(start);
}
export function extractText(html: string, selector?: string): string {
  const clean = html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|nav|footer)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
  const content = selector ? subtree(clean, selector) : subtree(clean, 'main') ?? subtree(clean, 'article') ?? subtree(clean, 'body') ?? clean;
  if (content === undefined) throw new UserError(`Selector not found: ${selector}`);
  return content.replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|#160);/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n))).replace(/\s+/g, ' ').trim();
}
export function governedFields(packs: Map<string, unknown>, id: string): string[] {
  const result: string[] = [];
  function visit(value: unknown, path: string): void {
    if (!value || typeof value !== 'object') return;
    if (!Array.isArray(value) && (value as Record<string, unknown>).source === id) result.push(path);
    if (!Array.isArray(value) && (value as Record<string, unknown>).aiSource === id) result.push(`${path}.ai`);
    for (const [key, child] of Object.entries(value)) visit(child, `${path}.${key}`);
  }
  for (const [platform, pack] of packs) visit(pack, platform);
  return result;
}
async function detect(row: SourceRow, io: IO): Promise<string> {
  if (row.detector.kind === 'git-path') {
    const d = row.detector, query = new URLSearchParams({ path: d.path, per_page: '1' }); if (d.branch) query.set('sha', d.branch);
    const data: unknown = JSON.parse(await io.run('gh', ['api', `repos/${d.repo}/commits?${query}`]));
    const sha = Array.isArray(data) && data[0] && typeof data[0].sha === 'string' ? data[0].sha : '';
    if (!/^[a-f\d]{40,64}$/i.test(sha)) throw new Error('No valid path commit returned'); return sha;
  }
  if (row.detector.kind !== 'page-hash') throw new Error('Manual source');
  const response = await io.fetch(row.url, { headers: { 'user-agent': 'BlastStudio/0.1 (+platform source monitor)' }, redirect: 'manual', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = extractText(await response.text(), row.detector.selector);
  if (!text) throw new Error('Source returned no extractable text');
  return text;
}
export async function check(io: IO, options: { root?: string; sources?: SourceRow[]; packs?: Map<string, unknown>; only?: string[]; write?: boolean; date?: string } = {}): Promise<{ results: Result[]; code: number; report: string }> {
  const inCheckout = existsSync(join(repoRoot, '.git')) && !relative(repoRoot, resolve(io.cwd)).startsWith(`..${sep}`) && relative(repoRoot, resolve(io.cwd)) !== '..';
  const root = options.root ?? (options.write && inCheckout ? repoRoot : loadConfig(io).root), sources = options.sources ?? loadSources(), packs = options.packs ?? loadPacks(), date = options.date ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new UserError('Invalid source report date');
  if (options.only) for (const id of options.only) if (!sources.some(s => s.id === id)) throw new UserError(`Unknown source: ${id}`);
  const results: Result[] = [];
  for (const row of sources) {
    if (options.only && !options.only.includes(row.id)) continue;
    if (!/^[a-zA-Z0-9_-]+$/.test(row.id)) throw new UserError(`Invalid source id: ${row.id}`);
    const fields = governedFields(packs, row.id), file = join(root, 'platforms/snapshots', `${row.id}.txt`);
    if (row.detector.kind === 'manual') { results.push({ id: row.id, status: 'manual', fields }); continue; }
    try {
      const baseline = existsSync(file) ? file : join(repoRoot, 'platforms/snapshots', `${row.id}.txt`);
      const text = await detect(row, io), old = existsSync(baseline) ? readFileSync(baseline, 'utf8') : undefined;
      const status = old === undefined ? 'new' : old === text ? 'unchanged' : 'changed';
      if (options.write) { mkdirSync(join(root, 'platforms/snapshots'), { recursive: true }); writeFileSync(file, text); writeFileSync(file.replace(/\.txt$/, '.sha256'), createHash('sha256').update(text).digest('hex') + '\n'); }
      results.push({ id: row.id, status, fields, old, text });
    } catch (error) { results.push({ id: row.id, status: 'failed', fields, error: error instanceof Error ? error.message : String(error) }); }
  }
  const relevant = results.filter(r => r.status !== 'unchanged');
  const lines = [`# Platform sources ${date}`, '', ...relevant.flatMap(r => { const source = sources.find(s => s.id === r.id)!; return [`## ${r.id}: ${r.status}${r.status === 'manual' ? ' (human check needed)' : ''}`, `Title: ${source.scope}`, `URL: ${source.url}`, r.error ? `Error: ${r.error}` : '', `Fields: ${r.fields.join(', ') || '(none)'}`, ...(r.status === 'changed' ? [`Previous: ${JSON.stringify(r.old)}`, `Current: ${JSON.stringify(r.text)}`] : []), '']; })];
  const report = lines.join('\n'); mkdirSync(join(root, 'updates'), { recursive: true });
  writeFileSync(join(root, 'updates', `${date}.md`), report);
  writeFileSync(join(root, 'updates', `${date}.json`), JSON.stringify(results, null, 2));
  io.out(report); return { results, code: results.some(r => r.status === 'changed') ? 2 : results.some(r => r.status === 'failed' || r.status === 'new') ? 1 : 0, report };
}
