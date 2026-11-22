import { readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import type { Command } from '../io.ts';
import { UserError } from '../types.ts';
import { closeBrowser, renderDiagram, renderHtml, renderSvg } from '../render/stills.ts';

export const run: Command = async (args, io) => {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { size: { type: 'string' }, out: { type: 'string' } } });
  const match = values.size?.match(/^(\d+)x(\d+)$/i);
  if (positionals.length !== 1 || !values.out || !match || !+match[1] || !+match[2]) throw new UserError('usage: bstudio render-preview <file.html|.svg|.mmd|.d2> --size WxH --out path');
  const input = resolve(io.cwd, positionals[0]), out = resolve(io.cwd, values.out);
  const ext = extname(input).toLowerCase();
  if (ext === '.html') {
    const html = readFileSync(input, 'utf8');
    const base = pathToFileURL(`${dirname(input)}/`).href;
    const withBase = /<head(?:\s[^>]*)?>/i.test(html) ? html.replace(/<head(?:\s[^>]*)?>/i, `$&<base href="${base}">`) : `<base href="${base}">${html}`;
    try { await renderHtml({ html: withBase, width: +match[1], height: +match[2], out, pdf: extname(out).toLowerCase() === '.pdf', assetDir: dirname(input) }); }
    finally { await closeBrowser(); }
  } else if (ext === '.svg') {
    renderSvg(input, [{ file: out, size: +match[1] }]);
  } else if (ext === '.mmd' || ext === '.d2') {
    await renderDiagram(input, out);
  } else throw new UserError('render-preview supports .html, .svg, .mmd and .d2 files');
  io.out(out); return 0;
};
