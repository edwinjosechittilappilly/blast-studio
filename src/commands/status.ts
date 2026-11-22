import { loadConfig, projectDir } from '../config.ts';
import { loadLibrary, latestSources } from '../library.ts';
import { monthToDate } from '../budget/ledger.ts';
import type { Command } from '../io.ts';
import { UserError } from '../types.ts';

export const run: Command = async (args, io) => {
  if (args.length > 1) throw new UserError('usage: bstudio status [<slug>]');
  const config = loadConfig(io);
  if (args[0]) projectDir(config, args[0]);
  const projects = loadLibrary(config).filter(p => !args[0] || p.slug === args[0]);
  if (args[0] && !projects.length) throw new UserError(`Project not found: ${args[0]}`);
  for (const project of projects) {
    io.out(project.slug);
    for (const platform of new Set([...project.posts.map(p => p.platform), ...project.reviews.map(r => r.platform)])) {
      const review = project.reviews.find(r => r.platform === platform);
      io.out(`  ${platform}: ${review?.verdict ?? 'unreviewed'}${review?.total == null ? '' : ` (${review.total}/100)`}`);
    }
  }
  io.out(`Month to date: $${monthToDate(config.root).toFixed(2)} / $${config.budget.monthlyUsd.toFixed(2)}`);
  const sources = latestSources(config);
  io.out(`Last source check: ${sources.lastCheck ?? 'never'}`);
  for (const line of [...sources.failed, ...sources.unverified]) io.out(line);
  return 0;
};
