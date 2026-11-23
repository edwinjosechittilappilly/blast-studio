import { existsSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { parse, parseDocument, stringify } from 'yaml';
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
  const doc = parseDocument(frontmatter ? frontmatter[2] : original);
  if (doc.errors.length) throw new UserError(`${target}: invalid YAML`);
  const data = doc.toJS() as { blockers?: unknown } | null;
  if (!data || typeof data !== 'object' || !validBlockers(data.blockers)) throw new UserError(`${target}: invalid blockers`);
  const blockers = data.blockers as string[] | undefined | null;
  if (!blockers || blockers[index] !== text) throw new UserError('This blocker list changed — refresh');
  const resolutions = readResolutions(dir);
  const resolution: BlockerResolution = { target, text, reason: reason.trim(), resolvedAt: new Date().toISOString(), by: 'owner' };
  doc.deleteIn(['blockers', index]);
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  const yaml = doc.toString({ lineWidth: 0, flowCollectionPadding: false }).replace(/\n/g, eol);
  const updated = frontmatter ? `${frontmatter[1]}${yaml.endsWith(eol) ? yaml.slice(0, -eol.length) : yaml}${frontmatter[3]}${frontmatter[4]}` : original.endsWith('\n') ? yaml : yaml.replace(/\r?\n$/, '');
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
