import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { parse } from 'yaml';
import { loadConfig, campaignDir, projectRoot } from '../config.ts';
import { compositeSlug, parseCampaignRef, readProject } from '../campaigns.ts';
import { exportProject } from '../export.ts';
import { listExports } from '../library.ts';
import type { Command } from '../io.ts';
import { UserError } from '../types.ts';

const usage = 'usage: bstudio export <project>/<campaign> [--mb <project>] [--force] [--dir] [--list]';


export const run: Command = async (args, io) => {
  const parsed = (() => {
    try { return parseArgs({ args, allowPositionals: true, options: { mb: { type: 'string' }, force: { type: 'boolean' }, dir: { type: 'boolean' }, list: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } } }); }
    catch { throw new UserError(usage); }
  })();
  if (parsed.values.help) { io.out(`${usage}\nExample: bstudio export acme/launch --mb ../market-blaster --force`); return 0; }
  if (parsed.positionals.length !== 1 || (parsed.values.mb !== undefined && !parsed.values.mb.trim())) throw new UserError(usage);
  const ref = parseCampaignRef(parsed.positionals[0]), slug = compositeSlug(ref), config = loadConfig(io);
  if (parsed.values.list) {
    if (parsed.values.mb !== undefined || parsed.values.force || parsed.values.dir) throw new UserError(usage);
    const exports = listExports(config, ref);
    if (!exports.length) io.out('No campaign zip exports.');
    else for (const entry of exports) io.out(`${entry.time}\t${entry.size} bytes\t${entry.name}`);
    return 0;
  }
  const metadataPath = resolve(projectRoot(config, ref.project), 'project.yml');
  const metadata: unknown = existsSync(metadataPath) ? parse(readFileSync(metadataPath, 'utf8')) : undefined;
  const market = metadata && typeof metadata === 'object' && 'marketBlaster' in metadata ? metadata.marketBlaster : undefined;
  const projectTarget = market && typeof market === 'object' && 'project' in market ? market.project : undefined;
  if (projectTarget !== undefined && (typeof projectTarget !== 'string' || !projectTarget.trim())) throw new UserError('Invalid marketBlaster.project in project.yml');
  const mb = parsed.values.mb ?? projectTarget ?? config.marketBlaster.project;
  const cwd = mb ? resolve(io.cwd, mb) : undefined;
  if (cwd && (!existsSync(cwd) || !statSync(cwd).isDirectory())) throw new UserError(`Market Blaster project directory not found: ${cwd}`);
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
  } else {
    io.out(`No Market Blaster project configured. Import later with: bstudio export ${parsed.positionals[0]} --mb <path>`);
  }
  return 0;
};
