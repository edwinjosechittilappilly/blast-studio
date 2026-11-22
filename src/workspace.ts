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

export async function runAgentInWorkspace({ config, io, projectDir, files, allowOut, prompt, timeoutMs, passEnv = [] }: { config: StudioConfig; io: IO; projectDir: string; files: Record<string, string>; allowOut: RegExp[]; prompt: string; timeoutMs: number; passEnv?: string[] }): Promise<{ copied: string[]; ignored: string[] }> {
  const dir = mkdtempSync(join(tmpdir(), 'bstudio-agent-'));
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
      TMPDIR: dir,
    };
    for (const key of ['LANG', 'LC_ALL', 'TERM', 'USER', 'SYSTEMROOT']) if (io.env[key]) env[key] = io.env[key];
    for (const [key, value] of Object.entries(io.env)) if (key.startsWith('XDG_') && value) env[key] = value;
    for (const key of passEnv) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || deniedEnv.includes(key.toUpperCase()) || ['PATH', 'HOME', 'TMPDIR'].includes(key.toUpperCase())) throw new UserError(`Disallowed agent environment variable: ${key}`);
      if (io.env[key] !== undefined) env[key] = io.env[key];
    }
    const started = Date.now();
    let report: string;
    try {
      report = await io.run(config.agent.command[0], [...config.agent.command.slice(1), prompt], { cwd: dir, env, timeoutMs });
    } finally {
      await recordAgentRun(config, { model: config.agent.command.join(' '), ms: Date.now() - started, usd: null, projectSlug: basename(projectDir) });
    }
    if (report.trim()) io.out(report.trim());
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
        try { if (/\.ya?ml$/i.test(rel)) { const parsed = parse(data.toString('utf8')); if (!parsed || typeof parsed !== 'object') throw new Error('expected object or array'); } } catch { throw new UserError(`Invalid YAML output: ${rel}`); }
        if (/^posts\/[^/]+\.md$/.test(rel)) parsePost(rel, data.toString('utf8'));
        if (/\.json$/i.test(rel)) { try { JSON.parse(data.toString('utf8')); } catch { throw new UserError(`Invalid JSON output: ${rel}`); } }
        const target = resolve(projectDir, rel);
        if (!target.startsWith(resolve(projectDir) + sep)) throw new UserError(`Unsafe output path: ${rel}`);
        let parent = projectDir;
        for (const part of rel.split('/').slice(0, -1)) { parent = join(parent, part); if (existsSync(parent) && lstatSync(parent).isSymbolicLink()) throw new UserError(`Unsafe output directory: ${rel}`); }
        if (existsSync(target) && lstatSync(target).isSymbolicLink()) throw new UserError(`Unsafe output: ${rel}`);
        mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, data); copied.push(rel);
      }
    };
    visit(dir); for (const path of ignored) io.err(`Ignored agent output: ${path}`);
    return { copied, ignored };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
