import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig, campaignDir } from '../config.ts';
import { parseCampaignRef } from '../campaigns.ts';
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
  const ref = parseCampaignRef(parsed.positionals[0]), slug = ref.campaign, config = loadConfig(io), dir = exportProject(campaignDir(config, ref), slug, config, parsed.values.dir);
  io.out(`Wrote ${dir}`);
  const mb = parsed.values.mb as string | undefined ?? config.marketBlaster.project;
  if (mb) {
    const [cmd, ...prefix] = config.marketBlaster.command, cwd = resolve(io.cwd, mb);
    let imported: string;
    try { imported = await io.run(cmd, [...prefix, 'import', dir, '--slug', slug, ...(parsed.values.force ? ['--force'] : [])], { cwd }); }
    catch (error) { throw new UserError(`Market Blaster import failed: ${String(error instanceof Error ? error.message : error).slice(-2000)}`); }
    if (imported) io.out(imported);
    let checked: string;
    try { checked = await io.run(cmd, [...prefix, 'check', slug], { cwd }); }
    catch (error) { throw new UserError(`Market Blaster check failed: ${String(error instanceof Error ? error.message : error).slice(-2000)}`); }
    if (checked) io.out(checked);
  }
  return 0;
};
