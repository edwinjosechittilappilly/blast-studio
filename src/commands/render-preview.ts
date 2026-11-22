import { readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import type { Command } from '../io.ts';
import { UserError } from '../types.ts';
import { closeBrowser, renderDiagram, renderHtml, renderSvg } from '../render/stills.ts';

export const run: Command = async (args, io) => {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { help: { type: 'boolean', short: 'h' }, size: { type: 'string' }, out: { type: 'string' } } });
  if (values.help) {
    io.out('Usage: bstudio render-preview <file.html|.svg|.mmd|.d2> --size WxH --out path\n\nExample:\n  bstudio render-preview design.svg --size 1200x630 --out preview.png');
    return 0;
  }
  const match = values.size?.match(/^(\d+)x(\d+)$/i);
  if (positionals.length !== 1 || !values.out || !match || !+match[1] || !+match[2]) throw new UserError('usage: bstudio render-preview <file.html|.svg|.mmd|.d2> --size WxH --out path');
  const input = resolve(io.cwd, positionals[0]), out = resolve(io.cwd, values.out);
  const ext = extname(input).toLowerCase();
  if (ext === '.html') {
    const html = readFileSync(input, 'utf8');
    const base = pathToFileURL(`${dirname(input)}/`).href;
    const withBase = /<head(?:\s[^>]*)?>/i.test(html) ? html.replace(/<head(?:\s[^>]*)?>/i, `$&<base href="${base}">`) : `<base href="${base}">${html}`;
    const realInput = realpathSync(input), parts = realInput.split(sep);
    const assets = parts.lastIndexOf('assets');
    const assetDir = assets >= 4 && parts[assets - 4] === 'projects' && parts[assets - 2] === 'campaigns' && parts.length > assets + 2
      ? parts.slice(0, assets + 2).join(sep) || sep : undefined;
    const tempRelative = relative(realpathSync(tmpdir()), realInput);
    const workspace = !isAbsolute(tempRelative) && !tempRelative.startsWith(`..${sep}`) && /^bstudio-agent-[^/\\]+$/.test(tempRelative.split(sep)[0])
      ? join(realpathSync(tmpdir()), tempRelative.split(sep)[0]) : undefined;
    try { await renderHtml({ html: withBase, width: +match[1], height: +match[2], out, pdf: extname(out).toLowerCase() === '.pdf', assetDir: assetDir ?? workspace }); }
    finally { await closeBrowser(); }
  } else if (ext === '.svg') {
    renderSvg(input, [{ file: out, size: +match[1] }]);
  } else if (ext === '.mmd' || ext === '.d2') {
    await renderDiagram(input, out, undefined, io);
  } else throw new UserError('render-preview supports .html, .svg, .mmd and .d2 files');
  io.out(out); return 0;
};
