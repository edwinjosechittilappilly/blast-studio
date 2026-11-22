import { parseArgs } from 'node:util';
import { loadConfig } from '../config.ts';
import type { IO } from '../io.ts';
import { cancelJob, jobLog, listJobs } from '../jobs/runner.ts';
import { UserError } from '../types.ts';

export async function run(args: string[], io: IO): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { help: { type: 'boolean', short: 'h' } } });
  const [action = 'list', ...rest] = positionals;
  const usage = 'usage: bstudio jobs [list|log <id>|cancel <id>]';
  if (values.help) {
    const help: Record<string, string> = {
      list: 'usage: bstudio jobs list\nExample: bstudio jobs list',
      log: 'usage: bstudio jobs log <id>\nExample: bstudio jobs log 12345678-1234-4123-8123-123456789abc',
      cancel: 'usage: bstudio jobs cancel <id>\nExample: bstudio jobs cancel 12345678-1234-4123-8123-123456789abc',
    };
    if (!Object.hasOwn(help, action) || rest.length) throw new UserError(usage);
    io.out(positionals.length ? help[action] : `${usage}\nExample: bstudio jobs list`);
    return 0;
  }
  const root = loadConfig(io).root;
  if (action === 'list' && rest.length === 0) {
    for (const job of listJobs(root)) io.out(`${job.id}  ${job.state}  ${job.campaign ?? '-'}  ${job.operation}`);
    return 0;
  }
  if (action === 'log' && rest.length === 1) { io.out(jobLog(root, rest[0])); return 0; }
  if (action === 'cancel' && rest.length === 1) { const job = cancelJob(root, rest[0]); io.out(`${job.id} ${job.state}`); return 0; }
  throw new UserError(usage);
}
