import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig, campaignDir, projectRoot } from '../config.ts';
import { compositeSlug, parseCampaignRef, readProject } from '../campaigns.ts';
import { exportProject } from '../export.ts';
import type { Command } from '../io.ts';
import { UserError } from '../types.ts';

const usage = 'usage: bstudio export <project>/<campaign> [--mb <project>] [--force] [--dir]';


export const run: Command = async (args, io) => {
  const parsed = (() => {
    try { return parseArgs({ args, allowPositionals: true, options: { mb: { type: 'string' }, force: { type: 'boolean' }, dir: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } } }); }
    catch { throw new UserError(usage); }
  })();
  if (parsed.values.help) { io.out(`${usage}\nExample: bstudio export acme/launch --mb ../market-blaster --force`); return 0; }
  if (parsed.positionals.length !== 1 || (parsed.values.mb !== undefined && !parsed.values.mb.trim())) throw new UserError(usage);
  const ref = parseCampaignRef(parsed.positionals[0]), slug = compositeSlug(ref), config = loadConfig(io);
  const mb = parsed.values.mb ?? config.marketBlaster.project;
  const cwd = mb ? resolve(io.cwd, mb) : undefined;
  if (ref.project === ref.campaign && existsSync(resolve(projectRoot(config, ref.project), 'project.yml')) && readProject(config, ref.project).migratedFrom === ref.campaign) {
    io.err(`Warning: Market Blaster slug changed from ${ref.campaign} to ${slug}; importing creates a separate campaign and may duplicate previously published posts.`);
  }
  const dir = exportProject(campaignDir(config, ref), ref, config, parsed.values.dir);
  io.out(`Wrote ${dir}`);
  if (cwd) {
    const [cmd, ...prefix] = config.marketBlaster.command;
    let imported: string;
    try { imported = await io.run(cmd, [...prefix, 'import', dir, '--slug', slug, ...(parsed.values.force ? ['--force'] : [])], { cwd, onStderr: text => io.err(text.replace(/\n$/, '')) }); }
    catch (error) {
      const message = String(error instanceof Error ? error.message : error).slice(-2000);
      throw new UserError(`Market Blaster import failed: ${message}${/approved drafts|--force/i.test(message) && !parsed.values.force ? `\nTo replace approved drafts: bstudio export ${parsed.positionals[0]} --mb ${JSON.stringify(cwd)} --force` : ''}`);
    }
    if (imported) io.out(imported);
    let checked: string;
    try { checked = await io.run(cmd, [...prefix, 'check', slug], { cwd }); }
    catch (error) { throw new UserError(`Market Blaster check failed: ${String(error instanceof Error ? error.message : error).slice(-2000)}`); }
    if (checked) io.out(checked);
  }
  return 0;
};
