import { existsSync, realpathSync, statSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import type { IO } from './io.ts';
import { UserError, type Env, type StudioConfig } from './types.ts';
import { recordAgentRun, reserveAgentRun, settleAgentRun } from './budget/ledger.ts';
const protectedEnv = new Set(['DEV_API_KEY', 'HASHNODE_TOKEN', 'GITHUB_TOKEN', 'GH_TOKEN', 'BLUESKY_IDENTIFIER', 'BLUESKY_APP_PASSWORD', 'BLUESKY_HOST', 'MASTODON_TOKEN', 'MASTODON_HOST', 'LINKEDIN_ACCESS_TOKEN', 'LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'LINKEDIN_TOKEN_ISSUED', 'X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET', 'NOSTR_PRIVATE_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY']);

/** Build a subprocess environment without inheriting arbitrary credentials. */
export function agentEnv(io: IO, options: { temp: string; home?: string; bin?: string; passEnv?: string[]; minimal?: boolean }): Env {
  const env: Env = { PATH: io.env.PATH ?? '/usr/bin:/bin', HOME: options.home ?? io.env.HOME ?? options.temp, TMPDIR: options.temp };
  if (options.bin) env.PATH = `${options.bin}${process.platform === 'win32' ? ';' : ':'}${env.PATH}`;
  for (const [key, value] of Object.entries(io.env)) {
    if ((['USER', 'LANG', 'LC_ALL', 'TERM', 'SYSTEMROOT'].includes(key) || (!options.minimal && key.startsWith('XDG_'))) && value !== undefined) env[key] = value;
  }
  const passed: string[] = [];
  for (const key of new Set(options.passEnv ?? [])) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || ['PATH', 'HOME', 'TMPDIR'].includes(key.toUpperCase()) || protectedEnv.has(key.toUpperCase())) throw new UserError(`Disallowed agent environment variable: ${key}`);
    if (io.env[key] !== undefined) { env[key] = io.env[key]; passed.push(key); }
  }
  if (passed.length) io.err(`Warning: explicitly passing environment variables to agent: ${passed.join(', ')}`);
  return env;
}

let warnedSandbox = false;
/** Wrap agent processes in the OS sandbox where available. */
export function sandboxCommand(io: IO, config: StudioConfig, workspace: string, temp: string, command: string, args: string[]): { command: string; args: string[] } {
  if (config.agent.sandbox === 'off') return { command, args };
  const home = io.env.HOME;
  const hidden = [config.root, config.file, ...(home ? [join(home, '.ssh'), join(home, '.aws'), join(home, '.config/gh')] : []), ...(io.env.XDG_CONFIG_HOME ? [join(io.env.XDG_CONFIG_HOME, 'gh')] : [])];
  const canonical = (path: string) => { try { return realpathSync(path); } catch { return resolve(path); } };
  const writable = [workspace, temp, ...(home ? ['.omp', '.claude', '.codex', 'Library/Caches'].map(p => join(home, p)) : [])].map(canonical);
  if (process.platform === 'darwin') {
    const profile = ['(version 1)', '(allow default)', '(deny file-write*)',
      ...writable.map(p => `(allow file-write* (subpath ${JSON.stringify(p)}))`),
      ...hidden.map(p => `(deny file-read* file-write* (subpath ${JSON.stringify(canonical(p))}))`)].join('\n');
    return { command: '/usr/bin/sandbox-exec', args: ['-p', profile, command, ...args] };
  }
  if (process.platform === 'linux') {
    const bwrap = (io.env.PATH ?? '/usr/bin:/bin').split(delimiter).map(p => join(p, 'bwrap')).find(existsSync);
    if (bwrap) {
      const mounts = ['--ro-bind', '/', '/', '--dev', '/dev', '--proc', '/proc'];
      for (const path of writable) if (existsSync(path)) mounts.push('--bind', path, path);
      for (const path of hidden.map(canonical)) if (existsSync(path)) mounts.push(...(statSync(path).isDirectory() ? ['--tmpfs', path] : ['--ro-bind', '/dev/null', path]));
      return { command: bwrap, args: [...mounts, '--', command, ...args] };
    }
    if (!warnedSandbox) { io.err('Warning: bwrap is unavailable; agent is running without an OS sandbox.'); warnedSandbox = true; }
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
    const wrapped = sandboxCommand(io, config, cwd, temp, command[0], [...command.slice(1), prompt]);
    report = await io.run(wrapped.command, wrapped.args, { cwd, env, timeoutMs });
    return report;
  } finally {
    if (id) {
      let usd = maxUsd!, usage: unknown;
      try {
        const value = JSON.parse(report) as { total_cost_usd?: unknown; cost_usd?: unknown; usage?: unknown };
        const cost = value.total_cost_usd ?? value.cost_usd;
        if (typeof cost === 'number' && Number.isFinite(cost) && cost >= 0) usd = cost;
        usage = value.usage;
      } catch { /* no structured usage; retain the reservation */ }
      await settleAgentRun(config, id, { usd, usage });
    } else await recordAgentRun(config, { model, ms: Date.now() - started, usd: null, projectSlug });
  }
}
