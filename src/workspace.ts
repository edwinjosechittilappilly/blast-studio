import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';
import type { IO } from './io.ts';
import type { Post, StudioConfig } from './types.ts';
import { UserError } from './types.ts';
import { agentEnv, runBilledAgent } from './agent-env.ts';
import { campaignAddressForDir } from './campaigns.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
import { parsePost, serializePost } from './posts.ts';
function safePath(path: string): boolean { return !!path && !isAbsolute(path) && normalize(path) === path && !path.split(/[\\/]/).some(p => p === '..' || p === '.'); }

export async function runAgentInWorkspace({ config, io, projectDir, files, allowOut, prompt, timeoutMs, passEnv = [], validate, preserveBlockers = false, workspaceOnly = [] }: { config: StudioConfig; io: IO; projectDir: string; files: Record<string, string>; allowOut: RegExp[]; prompt: string; timeoutMs: number; passEnv?: string[]; validate?: (workspace: string) => { path: string; message: string }[]; preserveBlockers?: boolean; workspaceOnly?: string[] }): Promise<{ copied: string[]; ignored: string[] }> {
  const dir = mkdtempSync(join(tmpdir(), 'bstudio-agent-'));
  const temp = mkdtempSync(join(tmpdir(), 'bstudio-agent-tmp-'));
  const copied: string[] = [], ignored: string[] = [];
  try {
    for (const [path, content] of Object.entries(files)) {
      if (!safePath(path)) throw new UserError(`Unsafe workspace path: ${path}`);
      mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), content);
    }
    if (existsSync(join(root, 'templates'))) cpSync(join(root, 'templates'), join(dir, 'templates'), { recursive: true, force: false });
    const bin = join(dir, '.bin'); mkdirSync(bin);
    const shim = join(bin, 'bstudio');
    const cli = fileURLToPath(new URL('../bin/bstudio.mjs', import.meta.url));
    writeFileSync(shim, `#!/bin/sh\nif [ "$1" != render-preview ]; then echo 'Only render-preview is available' >&2; exit 1; fi\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(cli)} "$@"\n`); chmodSync(shim, 0o755);
    const env = agentEnv(io, { temp, bin, billing: config.agent.billing, passEnv: [...(config.agent.passEnv ?? []), ...passEnv] });
    for (let attempt = 0; attempt < 2; attempt++) {
      const report = await runBilledAgent(io, config, config.agent, campaignAddressForDir(config, projectDir), config.agent.command, prompt, dir, temp, env, timeoutMs);
      if (report.trim()) io.out(report.trim());
      const outputs: { rel: string; data: Buffer }[] = [];
      const errors: { path: string; message: string }[] = [];
      ignored.length = 0;
      const visit = (base: string, relative = '') => {
        for (const name of readdirSync(base)) {
          const rel = relative ? `${relative}/${name}` : name, path = join(base, name);
          if (rel === '.bin' || rel === 'templates') continue;
          const st = lstatSync(path);
          if (st.isSymbolicLink()) { ignored.push(rel); continue; }
          if (st.isDirectory()) { visit(path, rel); continue; }
          if (st.isFile() && workspaceOnly.includes(rel)) continue;
          const permitted = allowOut.some(re => { re.lastIndex = 0; return re.test(rel); });
          if (st.isFile() && Object.hasOwn(files, rel) && readFileSync(path, 'utf8') === files[rel]) continue;
          if (!st.isFile() || !permitted) { ignored.push(rel); continue; }
          const data = readFileSync(path);
          try {
            if (/\.ya?ml$/i.test(rel)) { const parsed = parse(data.toString('utf8')); if (!parsed || typeof parsed !== 'object') throw new Error('expected object or array'); }
            if (/^posts\/[^/]+\.md$/.test(rel)) { const post = parsePost(rel, data.toString('utf8')); if (`posts/${post.platform}.md` !== rel) throw new Error(`platform ${JSON.stringify(post.platform)} does not match ${rel}`); }
            if (/\.json$/i.test(rel)) JSON.parse(data.toString('utf8'));
          } catch (error) { errors.push({ path: rel, message: `${rel}: ${error instanceof Error ? error.message : String(error)}` }); }
          outputs.push({ rel, data });
        }
      };
      visit(dir);
      if (validate) errors.push(...validate(dir));
      if (errors.length) {
        const rejected: string[] = [];
        for (const rel of new Set(errors.map(e => e.path))) {
          if (!safePath(rel)) throw new UserError(`Unsafe rejected path: ${rel}`);
          const source = join(dir, rel), dest = join(projectDir, '.rejected', rel);
          if (existsSync(source) && lstatSync(source).isFile()) {
            let parent = projectDir;
            for (const part of ['.rejected', ...rel.split('/').slice(0, -1)]) {
              parent = join(parent, part);
              if (existsSync(parent) && lstatSync(parent).isSymbolicLink()) throw new UserError(`Unsafe rejected directory: ${parent}`);
            }
            if (existsSync(dest) && lstatSync(dest).isSymbolicLink()) throw new UserError(`Unsafe rejected file: ${dest}`);
            mkdirSync(dirname(dest), { recursive: true }); writeFileSync(dest, readFileSync(source));
          }
          rejected.push(dest);
        }
        const detail = errors.map(e => e.message).join('\n');
        if (attempt === 1) throw new UserError(`Agent output failed validation:\n${detail}\nRejected files: ${rejected.join(', ')}`);
        prompt += `\n\nValidation failed. Fix exactly these problems in the same files:\n${detail}`;
        continue;
      }
      for (const { rel, data } of outputs) {
        const target = resolve(projectDir, rel);
        if (!target.startsWith(resolve(projectDir) + sep)) throw new UserError(`Unsafe output path: ${rel}`);
        let parent = projectDir;
        for (const part of rel.split('/').slice(0, -1)) { parent = join(parent, part); if (existsSync(parent) && lstatSync(parent).isSymbolicLink()) throw new UserError(`Unsafe output directory: ${rel}`); }
        if (existsSync(target) && lstatSync(target).isSymbolicLink()) throw new UserError(`Unsafe output: ${rel}`);
        let content: Buffer | string = data;
        if (/^assets\/[^/]+\/asset\.yml$/.test(rel)) {
          const asset = parse(data.toString('utf8')) as Record<string, unknown>;
          delete asset.trademarkChecked;
          delete asset.license;
          asset.outputs = [];
          if (existsSync(target)) {
            const previous = parse(readFileSync(target, 'utf8')) as Record<string, unknown>;
            if (Object.hasOwn(previous, 'outputs')) asset.outputs = previous.outputs;
          }
          if (preserveBlockers && existsSync(target)) {
            const previous = parse(readFileSync(target, 'utf8')) as Record<string, unknown>;
            if (Object.hasOwn(previous, 'blockers')) asset.blockers = previous.blockers;
          }
          content = stringify(asset);
        }
        else if (preserveBlockers && /^posts\/[^/]+\.md$/.test(rel) && existsSync(target)) {
          const post = parsePost(rel, data.toString('utf8')) as Post & { blockers?: unknown };
          const previous = parsePost(rel, readFileSync(target, 'utf8')) as typeof post;
          if (Object.hasOwn(previous, 'blockers')) post.blockers = previous.blockers;
          content = serializePost(post);
        }
        mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, content); copied.push(rel);
      }
      if (ignored.length) io.err(`Ignored ${ignored.length} agent output(s): ${ignored.slice(0, 10).join(', ')}${ignored.length > 10 ? ', …' : ''}`);
      return { copied, ignored };
    }
    throw new UserError('Agent output failed validation');
  } finally { rmSync(dir, { recursive: true, force: true }); rmSync(temp, { recursive: true, force: true }); }
}
