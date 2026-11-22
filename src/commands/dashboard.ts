import { startDashboard } from '../dashboard/server.ts';
import type { Command } from '../io.ts';
import { UserError } from '../types.ts';

export const run: Command = async (args, io) => {
  if (args.length && (args.length !== 2 || args[0] !== '--port' || !/^\d+$/.test(args[1]) || Number(args[1]) > 65535)) throw new UserError('usage: bstudio dashboard [--port <port>]');
  const { url } = await startDashboard(io, { port: args.length ? Number(args[1]) : 4848 });
  io.out(url);
  return 0;
};
