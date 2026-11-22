import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import type { IO } from './io.ts';
import type { StudioConfig } from './types.ts';
import { UserError } from './types.ts';
import { recordAgentRun } from './budget/ledger.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
import { parsePost } from './posts.ts';
function safePath(path: string): boolean { return !!path && !isAbsolute(path) && normalize(path) === path && !path.split(/[\\/]/).some(p => p === '..' || p === '.'); }
const deniedEnv = ['DEV_API_KEY', 'HASHNODE_TOKEN', 'GITHUB_TOKEN', 'BLUESKY_IDENTIFIER', 'BLUESKY_APP_PASSWORD', 'BLUESKY_HOST', 'MASTODON_TOKEN', 'MASTODON_HOST', 'LINKEDIN_ACCESS_TOKEN', 'LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'LINKEDIN_TOKEN_ISSUED', 'X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET', 'NOSTR_PRIVATE_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY'];

export async function runAgentInWorkspace({ config, io, projectDir, files, allowOut, prompt, timeoutMs, passEnv = [], validate }: { config: StudioConfig; io: IO; projectDir: string; files: Record<string, string>; allowOut: RegExp[]; prompt: string; timeoutMs: number; passEnv?: string[]; validate?: (workspace: string) => { path: string; message: string }[] }): Promise<{ copied: string[]; ignored: string[] }> {
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
    // HOME stays the user's real home so the agent CLI (omp, claude, codex) finds its own login; isolation comes from
    // the temp working directory and the allowlisted environment, not from hiding HOME.
    const env: Record<string, string | undefined> = {
      PATH: `${bin}${process.platform === 'win32' ? ';' : ':'}${io.env.PATH ?? '/usr/bin:/bin'}`,
      HOME: io.env.HOME ?? dir,
      TMPDIR: temp,
    };
    for (const key of ['LANG', 'LC_ALL', 'TERM', 'USER', 'SYSTEMROOT']) if (io.env[key]) env[key] = io.env[key];
    for (const [key, value] of Object.entries(io.env)) if (key.startsWith('XDG_') && value) env[key] = value;
    for (const key of passEnv) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || deniedEnv.includes(key.toUpperCase()) || ['PATH', 'HOME', 'TMPDIR'].includes(key.toUpperCase())) throw new UserError(`Disallowed agent environment variable: ${key}`);
      if (io.env[key] !== undefined) env[key] = io.env[key];
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      const started = Date.now();
      let report: string;
      try {
        report = await io.run(config.agent.command[0], [...config.agent.command.slice(1), prompt], { cwd: dir, env, timeoutMs });
      } finally {
        await recordAgentRun(config, { model: config.agent.command.join(' '), ms: Date.now() - started, usd: null, projectSlug: basename(projectDir) });
      }
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
        mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, data); copied.push(rel);
      }
      if (ignored.length) io.err(`Ignored ${ignored.length} agent output(s): ${ignored.slice(0, 10).join(', ')}${ignored.length > 10 ? ', …' : ''}`);
      return { copied, ignored };
    }
    throw new UserError('Agent output failed validation');
  } finally { rmSync(dir, { recursive: true, force: true }); rmSync(temp, { recursive: true, force: true }); }
}
