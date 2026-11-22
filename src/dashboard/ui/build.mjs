import { context } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const carbonStyles = require.resolve('@carbon/styles/css/styles.css');
const build = await context({
  entryPoints: ['src/dashboard/ui/app.js', 'src/dashboard/ui/app.css'],
  outdir: process.env.BSTUDIO_UI_OUTDIR || 'src/dashboard/build', bundle: true, format: 'esm', minify: true,
  legalComments: 'external', loader: { '.woff2': 'dataurl' },
  plugins: [{ name: 'carbon-themes-only', setup(build) {
    build.onLoad({ filter: /@carbon\/styles\/css\/styles\.css$/ }, async () => {
      const css = await readFile(carbonStyles, 'utf8');
      const themes = css.match(/\.cds--g(?:10|100)\s*\{[^}]*\}/g);
      if (!themes || themes.length !== 2) throw new Error('Carbon theme definitions not found');
      return { contents: themes.join('\n'), loader: 'css' };
    });
  } }],
});
if (process.argv.includes('--watch')) await build.watch();
else { await build.rebuild(); await build.dispose(); }
