import { parseArgs } from 'node:util';
import { startDashboard } from '../dashboard/server.ts';
import type { Command } from '../io.ts';
import { UserError } from '../types.ts';

export const run: Command = async (args, io) => {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { help: { type: 'boolean', short: 'h' }, port: { type: 'string' } } });
  if (values.help) {
    io.out('Usage: bstudio dashboard [--port <port>]\n\nExample:\n  bstudio dashboard --port 4848');
    return 0;
  }
  if (positionals.length || (values.port !== undefined && (!/^\d+$/.test(values.port) || Number(values.port) > 65535))) throw new UserError('usage: bstudio dashboard [--port <port>]');
  const { url } = await startDashboard(io, { port: values.port === undefined ? 4848 : Number(values.port) });
  io.out(url);
  return 0;
};
