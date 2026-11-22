import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig, campaignDir } from '../config.ts';
import { compositeSlug, parseCampaignRef } from '../campaigns.ts';
import { listExports, loadLibrary, latestSources } from '../library.ts';
import { monthToDate } from '../budget/ledger.ts';
import type { Command } from '../io.ts';
import { UserError } from '../types.ts';

export const run: Command = async (args, io) => {
  const usage = 'usage: bstudio status [<project>/<campaign>] [--verbose]';
  let parsed;
  try { parsed = parseArgs({ args, allowPositionals: true, options: { verbose: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } } }); }
  catch { throw new UserError(usage); }
  if (parsed.values.help) { io.out(`${usage}\nExample: bstudio status acme/launch --verbose`); return 0; }
  const positional = parsed.positionals, verbose = parsed.values.verbose;
  if (positional.length > 1 || positional.some(arg => arg.startsWith('-'))) throw new UserError(usage);
  const config = loadConfig(io), slug = positional[0];
  if (slug) campaignDir(config, slug);
  const projects = loadLibrary(config).filter(p => !slug || p.slug === slug);
  if (slug && !projects.length) throw new UserError(`Campaign not found: ${slug}`);
  let heading = '';
  for (const project of projects) {
    const [name, campaign] = project.slug.split('/');
    if (name !== heading) { heading = name; io.out(`Project: ${name}`); }
    io.out(`  ${campaign}`);
    const exportDir = join(campaignDir(config, project.slug), 'export');
    const exportFiles = [join(exportDir, 'manifest.json'), join(exportDir, `${compositeSlug(parseCampaignRef(project.slug))}.campaign.zip`)].filter(existsSync);
    const latestExport = listExports(config, project.slug)[0];
    const exportedAt = exportFiles.length ? new Date(Math.max(...exportFiles.map(file => statSync(file).mtimeMs))).toISOString() : latestExport?.time ?? null;
    const published = Object.keys(project.published);
    io.out(`  exported: ${exportedAt ?? 'not exported'}`);
    io.out(`  published: ${published.length ? published.join(', ') : 'none'}`);
    for (const platform of new Set([...project.posts.map(p => p.platform), ...project.reviews.map(r => r.platform)])) {
      const review = project.reviews.find(r => r.platform === platform);
      io.out(`  ${platform}: ${review?.verdict ?? 'unreviewed'}${review?.total == null ? '' : ` (${review.total}/100)`}`);
    }
    const gates = project.reviews.flatMap(review => (review.gates ?? []).filter(gate => !gate.pass));
    const blocker = gates.find(gate => gate.id === 'specs' && gate.message.includes('Blocker in '));
    const rights = gates.filter(gate => gate.id === 'rights');
    const commands = rights.flatMap(gate => [...gate.message.matchAll(/bstudio confirm \S+ (\S+) (--trademark-checked|--license <license>)/g)]);
    const unresolved = commands.find(match => {
      const asset = project.assets.find(item => item.id === match[1]);
      return !asset || (match[2] === '--trademark-checked' ? !asset.trademarkChecked : !asset.license?.trim());
    });
    const unreviewed = project.posts.some(post => !project.reviews.some(review => review.platform === post.platform));
    const dir = campaignDir(config, project.slug);
    const inputFiles = [...project.posts.map(post => join(dir, 'posts', `${post.platform}.md`)), ...project.reviews.map(review => join(dir, 'reviews', `${review.platform}.json`)), ...project.assets.map(asset => join(dir, 'assets', asset.id, 'asset.yml'))];
    const latestInput = Math.max(0, ...inputFiles.filter(existsSync).map(file => statSync(file).mtimeMs), ...project.reviews.map(review => Date.parse(review.at ?? '') || 0));
    const staleExport = !exportedAt || latestInput > Date.parse(exportedAt);
    const unmarked = project.posts.find(post => ['instagram', 'youtube-shorts', 'tiktok', 'dailydev'].includes(post.platform) && !published.includes(post.platform));
    const needsRevision = project.reviews.some(review => review.verdict !== 'pass' && review.verdict !== 'accepted');
    const hasMarketBlasterPosts = project.posts.some(post => !['instagram', 'youtube-shorts', 'tiktok', 'dailydev'].includes(post.platform));
    const imported = latestExport && existsSync(join(exportDir, latestExport.name.split('/')[0], 'imported.json'));
    const next = blocker ? 'resolve blockers: edit the brief or artifact metadata, then remove resolved blockers' : unresolved ? `confirm rights: ${unresolved[0]}` : rights.length ? `run bstudio review ${project.slug}` : !existsSync(join(dir, 'plan.yml')) ? `run bstudio plan ${project.slug}` : !project.posts.length ? `run bstudio make ${project.slug}` : unreviewed ? `run bstudio review ${project.slug}` : needsRevision ? `run bstudio revise ${project.slug}` : staleExport ? `export: bstudio export ${project.slug}` : unmarked ? `record publication: bstudio mark ${project.slug} ${unmarked.platform} --url <url>` : hasMarketBlasterPosts && !imported ? `import: bstudio export ${project.slug} --mb <path>` : 'done';
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
