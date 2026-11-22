import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync, statSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import type { IO } from './io.ts';
import { UserError, type Env, type StudioConfig } from './types.ts';
import { parseAgentOutput, recordAgentRun, reserveAgentRun, settleAgentRun } from './budget/ledger.ts';
const protectedEnv = new Set(['DEV_API_KEY', 'HASHNODE_TOKEN', 'GITHUB_TOKEN', 'GH_TOKEN', 'BLUESKY_IDENTIFIER', 'BLUESKY_APP_PASSWORD', 'BLUESKY_HOST', 'MASTODON_TOKEN', 'MASTODON_HOST', 'LINKEDIN_ACCESS_TOKEN', 'LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'LINKEDIN_TOKEN_ISSUED', 'X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET', 'NOSTR_PRIVATE_KEY']);
const providerKeys = new Set(['GEMINI_API_KEY', 'OPENAI_API_KEY']);

/** Build a subprocess environment without inheriting arbitrary credentials. */
export function agentEnv(io: IO, options: { temp: string; home?: string; bin?: string; passEnv?: string[]; minimal?: boolean; billing?: 'subscription' | 'api' }): Env {
  const env: Env = { PATH: io.env.PATH ?? '/usr/bin:/bin', HOME: options.home ?? io.env.HOME ?? options.temp, TMPDIR: options.temp };
  if (options.bin) env.PATH = `${options.bin}${process.platform === 'win32' ? ';' : ':'}${env.PATH}`;
  for (const [key, value] of Object.entries(io.env)) {
    if ((['USER', 'LANG', 'LC_ALL', 'TERM', 'SYSTEMROOT'].includes(key) || (!options.minimal && key.startsWith('XDG_'))) && value !== undefined) env[key] = value;
  }
  const passed: string[] = [];
  for (const key of new Set(options.passEnv ?? [])) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || ['PATH', 'HOME', 'TMPDIR'].includes(key.toUpperCase()) || protectedEnv.has(key.toUpperCase()) || (providerKeys.has(key.toUpperCase()) && options.billing !== 'api')) throw new UserError(`Disallowed agent environment variable: ${key}`);
    if (io.env[key] !== undefined) { env[key] = io.env[key]; passed.push(key); }
  }
  if (passed.length) io.err(`Warning: explicitly passing environment variables to agent: ${passed.join(', ')}`);
  return env;
}

let warnedSandbox = false;
let bwrapProbe: { path: string; available: boolean } | undefined;
/** Wrap subprocesses in the OS sandbox where available. */
export function sandboxCommand(io: IO, config: StudioConfig, workspace: string, temp: string, command: string, args: string[], options: { render?: boolean; loopback?: boolean; pty?: boolean; readPaths?: string[]; readDirs?: string[]; writeDirs?: string[] } = {}): { command: string; args: string[] } {
  if (config.agent.sandbox !== 'on') return { command, args };
  const home = io.env.HOME;
  const canonical = (path: string) => { try { return realpathSync(path); } catch { return resolve(path); } };
  const writable = [workspace, temp].map(canonical);
  const readable = home && !options.render ? ['.omp', '.claude', '.codex', '.local/bin', '.local/share', '.nvm', '.npm-global', '.config/omp'].map(p => canonical(join(home, p))) : home ? ['.local/bin', '.local/share', '.nvm', '.npm-global', 'Library/Caches/ms-playwright'].map(p => canonical(join(home, p))) : [];
  readable.push(...(options.readDirs ?? []).map(canonical));
  if (options.render) readable.push(canonical(fileURLToPath(new URL('..', import.meta.url))));
  const packageMetadata: string[] = [];
  if (options.render) {
    let dir = canonical(fileURLToPath(new URL('..', import.meta.url)));
    while (dir !== dirname(dir)) { packageMetadata.push(join(dir, 'package.json')); dir = dirname(dir); }
  }
  const readPaths = (options.readPaths ?? []).map(canonical);
  const toolWrites = (options.writeDirs ?? []).map(canonical);
  const stateDirs = home && !options.render ? [canonical(join(home, '.omp/agent/sessions'))] : [];
  const stateFiles = home && !options.render ? ['agent.db', 'agent.db-wal', 'agent.db-shm', 'history.db', 'history.db-wal', 'history.db-shm', 'models.db', 'models.db-wal', 'models.db-shm', 'skill-descriptions.db', 'skill-descriptions.db-wal', 'skill-descriptions.db-shm'].map(p => canonical(join(home, '.omp/agent', p))) : [];
  if (process.platform === 'darwin') {
    const profile = ['(version 1)', '(allow default)', '(deny file-write*)',
      ...(options.render ? [tmpdir(), '/tmp'].map(p => `(allow file-write* (regex #${JSON.stringify(`^${canonical(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[.]?com[.]google[.](Chrome|chrome[.]for[.]testing)[.]`)}))`) : []),
      '(allow file-write* (literal "/dev/null") (literal "/dev/tty") (regex #"^/dev/fd/"))',
      ...(options.pty ? ['(allow file-write* (literal "/dev/ptmx") (regex #"^/dev/ttys[0-9]+$"))'] : []),
      ...(home ? [`(deny file-read* (subpath ${JSON.stringify(canonical(home))}))`] : []),
      ...(home ? [`(allow file-read-metadata (subpath ${JSON.stringify(canonical(home))}))`] : []),
      ...packageMetadata.map(p => `(allow file-read* (literal ${JSON.stringify(p)}))`),
      ...readable.map(p => `(allow file-read* (subpath ${JSON.stringify(p)}))`),
      ...stateDirs.map(p => `(allow file-write* (subpath ${JSON.stringify(p)}))`),
      ...stateFiles.map(p => `(allow file-write* (literal ${JSON.stringify(p)}))`),
      ...toolWrites.map(p => `(allow file-write* (subpath ${JSON.stringify(p)}))`),
      ...[config.root, config.file].map(p => `(deny file-read* file-write* (subpath ${JSON.stringify(canonical(p))}))`),
      ...readPaths.map(p => `(allow file-read* (literal ${JSON.stringify(p)}))`),
      ...writable.map(p => `(allow file-read* file-write* (subpath ${JSON.stringify(p)}))`),
      ...(options.render ? ['(deny network*)', '(allow network* (local unix-socket))', ...(options.loopback ? ['(allow network-bind (local ip "localhost:*"))', '(allow network-inbound (local ip "localhost:*"))', '(allow network-outbound (remote ip "localhost:*"))'] : [])] : [])].join('\n');
    return { command: '/usr/bin/sandbox-exec', args: ['-p', profile, command, ...args] };
  }
  if (process.platform === 'linux') {
    const bwrap = (io.env.PATH ?? '/usr/bin:/bin').split(delimiter).map(p => join(p, 'bwrap')).find(existsSync);
    if (bwrap && (!bwrapProbe || bwrapProbe.path !== bwrap)) bwrapProbe = { path: bwrap, available: spawnSync(bwrap, ['--ro-bind', '/', '/', '--', '/bin/true'], { stdio: 'ignore' }).status === 0 };
    // Bubblewrap brings up loopback in the isolated network namespace for local renderer servers.
    if (bwrap && bwrapProbe?.available) {
      const mounts = ['--unshare-pid', '--die-with-parent', ...(options.render ? ['--unshare-net'] : []), '--ro-bind', '/', '/', '--dev', '/dev', '--proc', '/proc'];
      if (home && existsSync(home)) mounts.push('--tmpfs', canonical(home));
      const bind = (path: string, write: boolean) => {
        if (!existsSync(path)) return;
        if (home && path.startsWith(canonical(home) + '/')) {
          const parents: string[] = []; let dir = dirname(path);
          while (dir !== canonical(home) && dir.startsWith(canonical(home) + '/')) { parents.unshift(dir); dir = dirname(dir); }
          for (const parent of parents) mounts.push('--dir', parent);
        }
        mounts.push(write ? '--bind' : '--ro-bind', path, path);
      };
      for (const path of readable) bind(path, false);
      for (const path of [...stateDirs, ...stateFiles]) bind(path, true);
      for (const path of toolWrites) bind(path, true);
      for (const path of [config.root, config.file].map(canonical)) if (existsSync(path)) mounts.push(...(statSync(path).isDirectory() ? ['--tmpfs', path] : ['--ro-bind', '/dev/null', path]));
      for (const path of readPaths) bind(path, false);
      for (const path of writable) bind(path, true);
      return { command: bwrap, args: [...mounts, '--', command, ...args] };
    }
    if (!warnedSandbox) { io.err('Warning: bwrap is unavailable or unusable; process is running without an OS sandbox.'); warnedSandbox = true; }
  }
  return { command, args };
}

/** Reserve before API-billed calls and settle even when a subprocess fails. */
export async function runBilledAgent(io: IO, config: StudioConfig, settings: { billing?: 'subscription' | 'api'; maxUsdPerRun?: number }, projectSlug: string, command: string[], prompt: string, cwd: string, temp: string, env: Env, timeoutMs: number): Promise<string> {
  const model = command.join(' ');
  const maxUsd = settings.maxUsdPerRun;
  if (settings.billing === 'api' && (!(maxUsd && maxUsd > 0) || !Number.isFinite(maxUsd))) throw new UserError('API-billed agent requires a positive maxUsdPerRun');
  const id = settings.billing === 'api' ? await reserveAgentRun(config, { command: model, projectSlug, maxUsd: maxUsd! }) : undefined;
  const started = Date.now();
  let report = '';
  try {
    // Agent CLIs parse a positional argument starting with "-" as a flag (a SKILL.md begins with "---"), so the
    // prompt always starts with a plain word.
    const safePrompt = /^\s*-/.test(prompt) ? `Task:\n${prompt}` : prompt;
    const wrapped = sandboxCommand(io, config, cwd, temp, command[0], [...command.slice(1), safePrompt]);
    report = await io.run(wrapped.command, wrapped.args, { cwd, env, timeoutMs });
    return report;
  } finally {
    if (id) {
      const parsed = parseAgentOutput(report);
      const usd = parsed.usd ?? maxUsd!, usage = parsed.usage;
      await settleAgentRun(config, id, { usd, usage });
    } else await recordAgentRun(config, { model, ms: Date.now() - started, usd: null, projectSlug });
  }
}
