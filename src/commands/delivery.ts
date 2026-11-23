import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual, parseArgs } from 'node:util';
import { isMap, isNode, isScalar, parse, parseDocument } from 'yaml';
import { containedPath } from '../campaigns.ts';
import { campaignDir, loadConfig } from '../config.ts';
import { snapshot } from '../history.ts';
import type { Command } from '../io.ts';
import { loadPack } from '../packs.ts';
import { parsePost } from '../posts.ts';
import { PLATFORM_IDS, UserError, type PlatformId } from '../types.ts';

const usage = 'usage: bstudio delivery <project>/<campaign> <platform> manual|marketBlaster';

export const run: Command = async (args, io) => {
  let parsed;
  try { parsed = parseArgs({ args, allowPositionals: true, options: { help: { type: 'boolean', short: 'h' } } }); }
  catch { throw new UserError(usage); }
  if (parsed.values.help) { io.out(usage); return 0; }
  const [address, platform, delivery] = parsed.positionals;
  if (parsed.positionals.length !== 3 || !PLATFORM_IDS.includes(platform as PlatformId) || (delivery !== 'manual' && delivery !== 'marketBlaster')) throw new UserError(usage);
  const dir = campaignDir(loadConfig(io), address);
  if (!existsSync(dir)) throw new UserError(`Campaign not found: ${address}`);
  if (delivery === 'marketBlaster' && !loadPack(platform as PlatformId).marketBlaster) throw new UserError(`${platform}: Market Blaster delivery is not available`);
  const file = containedPath(dir, 'posts', `${platform}.md`);
  if (!existsSync(file)) throw new UserError(`${platform}: post not found`);
  const original = readFileSync(file, 'utf8');
  const match = original.match(/^(---\s*\r?\n)([\s\S]*?)(\r?\n---\s*(?:\r?\n|$))([\s\S]*)$/);
  if (!match) throw new UserError(`${file}: expected YAML frontmatter`);
  const source = match[2], doc = parseDocument(source, { keepSourceTokens: true });
  if (doc.errors.length || !isMap(doc.contents)) throw new UserError(`${platform}: cannot safely update delivery`);
  const value = doc.get('delivery', true);
  let updated: string;
  if (value === undefined) {
    const newline = match[1].endsWith('\r\n') ? '\r\n' : '\n';
    updated = `${source}${newline}delivery: ${delivery}`;
  } else {
    if (!isNode(value) || !value.range) throw new UserError(`${platform}: cannot safely update delivery`);
    if (isScalar(value) && value.value === null && value.range[0] === value.range[1]) {
      const key = doc.contents.items.find(pair => isScalar(pair.key) && pair.key.value === 'delivery')?.key;
      if (!isNode(key) || !key.range) throw new UserError(`${platform}: cannot safely update delivery`);
      const lineStart = source.lastIndexOf('\n', key.range[0] - 1) + 1;
      const lineEnd = source.indexOf('\n', key.range[1]);
      const end = lineEnd === -1 ? source.length : lineEnd;
      const line = source.slice(lineStart, end);
      const empty = line.match(/^([^\r\n]*?:[ \t]*)(#[^\r\n]*)?(\r?)$/);
      if (!empty) throw new UserError(`${platform}: cannot safely update delivery`);
      updated = source.slice(0, lineStart) + empty[1] + (empty[1].endsWith(':') ? ' ' : '') + delivery + (empty[2] ? ` ${empty[2]}` : '') + empty[3] + source.slice(end);
    } else {
      const removed = source.slice(value.range[0], value.range[1]);
      const newline = !isScalar(value) && /\r?\n$/.test(removed) ? (removed.endsWith('\r\n') ? '\r\n' : '\n') : '';
      updated = source.slice(0, value.range[0]) + delivery + newline + source.slice(value.range[1]);
    }
  }
  try {
    const before = doc.toJS();
    if (!isDeepStrictEqual(parse(updated), { ...before, delivery })) throw new Error();
  } catch { throw new UserError(`${platform}: cannot safely update delivery`); }
  const updatedPost = `${match[1]}${updated}${match[3]}${match[4]}`;
  const post = parsePost(file, updatedPost);
  if (post.platform !== platform) throw new UserError(`${file}: platform does not match filename`);
  if (updatedPost === original) { io.out(`${platform}: delivery already ${delivery}`); return 0; }
  const temp = `${file}.${randomUUID()}.tmp`;
  snapshot(dir, 'delivery');
  try {
    writeFileSync(temp, updatedPost);
    renameSync(temp, file);
  } finally { rmSync(temp, { force: true }); }
  io.out(`${platform}: delivery set to ${delivery}`);
  return 0;
};
