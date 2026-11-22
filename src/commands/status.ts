import { loadConfig, projectDir } from '../config.ts';
import { loadLibrary, latestSources } from '../library.ts';
import { monthToDate } from '../budget/ledger.ts';
import type { Command } from '../io.ts';
import { UserError } from '../types.ts';

export const run: Command = async (args, io) => {
  const verbose = args.includes('--verbose');
  const positional = args.filter(arg => arg !== '--verbose');
  if (positional.length > 1 || args.filter(arg => arg === '--verbose').length > 1 || positional.some(arg => arg.startsWith('--'))) throw new UserError('usage: bstudio status [<slug>] [--verbose]');
  const config = loadConfig(io), slug = positional[0];
  if (slug) projectDir(config, slug);
  const projects = loadLibrary(config).filter(p => !slug || p.slug === slug);
  if (slug && !projects.length) throw new UserError(`Project not found: ${slug}`);
  for (const project of projects) {
    io.out(project.slug);
    for (const platform of new Set([...project.posts.map(p => p.platform), ...project.reviews.map(r => r.platform)])) {
      const review = project.reviews.find(r => r.platform === platform);
      io.out(`  ${platform}: ${review?.verdict ?? 'unreviewed'}${review?.total == null ? '' : ` (${review.total}/100)`}`);
    }
    const rights = project.reviews.flatMap(review => (review.gates ?? []).filter(gate => gate.id === 'rights' && !gate.pass)).map(gate => gate.message.match(/bstudio confirm [^;]+/)?.[0]).find(Boolean);
    const unreviewed = project.posts.some(post => !project.reviews.some(review => review.platform === post.platform));
    const needsRevision = project.reviews.some(review => review.verdict !== 'pass' && review.verdict !== 'accepted');
    const next = rights ? `confirm rights: ${rights}` : !project.posts.length ? `run bstudio make ${project.slug}` : unreviewed ? `run bstudio review ${project.slug}` : needsRevision ? `run bstudio revise ${project.slug}` : `export: bstudio export ${project.slug}`;
    io.out(`  next: ${next}`);
  }
  io.out(`Month to date: $${monthToDate(config.root).toFixed(2)} / $${config.budget.monthlyUsd.toFixed(2)}`);
  const sources = latestSources(config);
  io.out(`Last source check: ${sources.lastCheck ?? 'never'}`);
  for (const line of [...sources.failed, ...sources.changed]) io.out(line);
  const platforms = new Set(sources.unverified.map(field => field.split('.')[0]));
  io.out(`Unverified pack fields: ${sources.unverified.length} across ${platforms.size} platforms (bstudio sources verify <id>)`);
  if (verbose) for (const field of sources.unverified) io.out(`  ${field}`);
  return 0;
};
