import { loadConfig } from '../config.ts';
import type { IO } from '../io.ts';
import { cancelJob, jobLog, listJobs } from '../jobs/runner.ts';
import { UserError } from '../types.ts';

export async function run(args: string[], io: IO): Promise<number> {
  const root = loadConfig(io).root;
  if (args.length === 0 || (args.length === 1 && args[0] === 'list')) {
    for (const job of listJobs(root)) io.out(`${job.id}  ${job.state}  ${job.campaign ?? '-'}  ${job.operation}`);
    return 0;
  }
  if (args.length === 2 && args[0] === 'log') { io.out(jobLog(root, args[1])); return 0; }
  if (args.length === 2 && args[0] === 'cancel') { const job = cancelJob(root, args[1]); io.out(`${job.id} ${job.state}`); return 0; }
  throw new UserError('usage: bstudio jobs [list|log <id>|cancel <id>]');
}
