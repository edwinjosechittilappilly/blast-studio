import { existsSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { isAlias, isMap, isScalar, isSeq, parse, parseDocument, stringify } from 'yaml';
import { loadPosts } from './posts.ts';
import { snapshot } from './history.ts';
import { containedPath } from './campaigns.ts';
import { PLATFORM_IDS, UserError } from './types.ts';

export interface Blocker { target: string; index: number; text: string }
export interface BlockerResolution { target: string; text: string; reason: string; resolvedAt: string; by: 'owner' }

export function listBlockers(dir: string): Blocker[] {
  const result: Blocker[] = [];
  const add = (target: string, file: string, value: unknown) => {
    if (!validBlockers(value)) throw new UserError(`${file}: invalid blockers`);
    (value as string[] | undefined | null)?.forEach((text, index) => result.push({ target, index, text }));
  };
  for (const post of loadPosts(dir).values()) add(`post:${post.platform}`, post.path, (post as typeof post & { blockers?: unknown }).blockers);
  const assets = join(dir, 'assets');
  if (existsSync(assets)) for (const entry of readdirSync(assets, { withFileTypes: true }).filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = join(assets, entry.name, 'asset.yml');
    if (!existsSync(file)) continue;
    let asset: { blockers?: unknown } | null;
    try { asset = parse(readFileSync(file, 'utf8')); } catch { throw new UserError(`${file}: invalid YAML`); }
    add(`asset:${entry.name}`, file, asset?.blockers);
  }
  return result;
}

export function readResolutions(dir: string): BlockerResolution[] {
  const file = containedPath(dir, 'resolutions.yml');
  if (!existsSync(file)) return [];
  let value: unknown;
  try { value = parse(readFileSync(file, 'utf8')); } catch { throw new UserError('Invalid resolutions.yml'); }
  if (!Array.isArray(value) || value.some(item => !item || typeof item !== 'object' || typeof item.target !== 'string' || typeof item.text !== 'string' || typeof item.reason !== 'string' || typeof item.resolvedAt !== 'string' || item.by !== 'owner')) throw new UserError('Invalid resolutions.yml');
  return value as BlockerResolution[];
}

export function resolveBlocker(dir: string, target: string, index: number, text: string, reason: string): BlockerResolution {
  const match = /^(post|asset):([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(target);
  if (!match || (match[1] === 'post' && !(PLATFORM_IDS as readonly string[]).includes(match[2]))) throw new UserError(`Invalid blocker target: ${target}`);
  if (!Number.isSafeInteger(index) || index < 0 || typeof text !== 'string' || !text.trim() || !reason.trim()) throw new UserError('A non-negative blocker index, expected text and reason are required');
  const file = match[1] === 'post' ? containedPath(dir, 'posts', `${match[2]}.md`) : containedPath(dir, 'assets', match[2], 'asset.yml');
  if (!existsSync(file)) throw new UserError(`Blocker target not found: ${target}`);
  const original = readFileSync(file, 'utf8');
  const frontmatter = match[1] === 'post' ? original.match(/^(---\s*\r?\n)([\s\S]*?)(\r?\n---\s*(?:\r?\n|$))([\s\S]*)$/) : null;
  if (match[1] === 'post' && !frontmatter) throw new UserError(`${target}: expected YAML frontmatter`);
  const source = frontmatter ? frontmatter[2] : original;
  const doc = parseDocument(source, { keepSourceTokens: true });
  if (doc.errors.length) throw new UserError(`${target}: invalid YAML`);
  const data = doc.toJS() as { blockers?: unknown } | null;
  if (!data || typeof data !== 'object' || !validBlockers(data.blockers)) throw new UserError(`${target}: invalid blockers`);
  const blockers = data.blockers as string[] | undefined | null;
  if (!blockers || blockers[index] !== text) throw new UserError('This blocker list changed — refresh');
  const resolutions = readResolutions(dir);
  const resolution: BlockerResolution = { target, text, reason: reason.trim(), resolvedAt: new Date().toISOString(), by: 'owner' };
  const sequence = doc.get('blockers', true);
  let start: number, end: number, replacement = '';
  if (isAlias(sequence) && sequence.range) {
    [start, end] = sequence.range;
    replacement = JSON.stringify(blockers.filter((_, i) => i !== index));
  } else {
    if (!isSeq(sequence) || !sequence.srcToken || !isMap(doc.contents)) throw new UserError(`${target}: invalid blockers sequence`);
    const item = sequence.items[index];
    if ((!isScalar(item) && !isAlias(item)) || !item.range) throw new UserError(`${target}: invalid blocker`);
    const token = sequence.srcToken;
    if (token.type === 'flow-collection') {
      start = item.range[0];
      end = item.range[1];
      if (sequence.items.length > 1) {
        if (index < sequence.items.length - 1) {
          const comma = token.items[index + 1].start.find(part => part.type === 'comma');
          if (!comma) throw new UserError(`${target}: invalid blockers sequence`);
          const between = source.slice(end, comma.offset);
          if (between.includes('#')) replacement = between;
          end = comma.offset + comma.source.length;
          if (!replacement) while (source[end] === ' ' || source[end] === '\t') end++;
        } else {
          const comma = token.items[index].start.find(part => part.type === 'comma');
          if (!comma) throw new UserError(`${target}: invalid blockers sequence`);
          const between = source.slice(comma.offset + comma.source.length, start);
          if (between.includes('#')) replacement = between;
          start = comma.offset;
        }
      }
    } else if (token.type === 'block-seq') {
      const indicator = token.items[index].start.find(part => part.type === 'seq-item-ind');
      if (!indicator) throw new UserError(`${target}: invalid blockers sequence`);
      start = source.lastIndexOf('\n', indicator.offset - 1) + 1;
      end = item.range[2];
      const trailing = source.slice(item.range[1], item.range[2]);
      if (trailing.includes('#')) {
        start = indicator.offset;
        end = item.range[1];
      }
      if (sequence.items.length === 1) {
        const pair = doc.contents.items.find(entry => isScalar(entry.key) && entry.key.value === 'blockers');
        if (!pair || !isScalar(pair.key) || !pair.key.range) throw new UserError(`${target}: invalid blockers sequence`);
        const colon = source.indexOf(':', pair.key.range[1]);
        if (colon >= 0 && /^\s*$/.test(source.slice(colon + 1, start))) {
          start = colon + 1;
          replacement = ' []';
          if (end === item.range[2] && source.slice(0, end).endsWith('\r\n')) replacement += '\r\n';
          else if (end === item.range[2] && source[end - 1] === '\n') replacement += '\n';
        } else {
          replacement = source.slice(start, indicator.offset) + '[]';
          if (end === item.range[2] && source.slice(0, end).endsWith('\r\n')) replacement += '\r\n';
          else if (end === item.range[2] && source[end - 1] === '\n') replacement += '\n';
        }
      }
    } else throw new UserError(`${target}: invalid blockers sequence`);
  }
  const yaml = source.slice(0, start) + replacement + source.slice(end);
  let parsed: unknown;
  try {
    const updatedDoc = parseDocument(yaml);
    if (updatedDoc.errors.length) throw new Error('Invalid YAML');
    parsed = updatedDoc.toJS();
  } catch {
    throw new UserError(`${target}: cannot safely update blockers`);
  }
  if (!isDeepStrictEqual(parsed, { ...data, blockers: blockers.filter((_, i) => i !== index) })) {
    throw new UserError(`${target}: cannot safely update blockers`);
  }
  const updated = frontmatter ? `${frontmatter[1]}${yaml}${frontmatter[3]}${frontmatter[4]}` : yaml;
  const log = containedPath(dir, 'resolutions.yml'), temp = `${log}.${randomUUID()}.tmp`;
  const targetTemp = `${file}.${randomUUID()}.tmp`, rollback = `${file}.${randomUUID()}.tmp`;
  snapshot(dir, 'blockers');
  let keepRollback = false;
  try {
    const mode = statSync(file).mode & 0o777;
    writeFileSync(temp, stringify([...resolutions, resolution]), { flag: 'wx', mode: 0o600 });
    writeFileSync(targetTemp, updated, { flag: 'wx', mode });
    writeFileSync(rollback, original, { flag: 'wx', mode });
    renameSync(targetTemp, file);
    try { renameSync(temp, log); } catch (error) {
      try { renameSync(rollback, file); } catch (rollbackError) {
        keepRollback = true;
        throw new UserError(`Resolution write and rollback failed: ${String(rollbackError)}. Original remains at ${rollback}`);
      }
      throw error;
    }
  } finally {
    rmSync(temp, { force: true });
    rmSync(targetTemp, { force: true });
    if (!keepRollback) rmSync(rollback, { force: true });
  }
  return resolution;
}

export function validBlockers(value: unknown): boolean {
  return value == null || Array.isArray(value) && value.every(item => typeof item === 'string' && item.trim().length > 0);
}

export function blockerTexts(value: unknown): string[] {
  if (value == null) return [];
  if (!validBlockers(value)) return ['Invalid blockers: expected an array of non-empty strings'];
  return value as string[];
}
