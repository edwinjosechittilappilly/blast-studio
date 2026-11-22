import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { Resvg } from "@resvg/resvg-js";
import { chromium } from "playwright";
import type { Browser } from "playwright";
import { agentEnv, sandboxCommand } from "../agent-env.ts";
import { packageBin } from "./bins.ts";
import { configFile, loadConfig } from "../config.ts";
import type { IO } from "../io.ts";
import type { StudioConfig } from "../types.ts";
import { measureText } from "./metrics.ts";
import type { SafeZone } from "./metrics.ts";

const exec = promisify(execFile);
let browser: Promise<Browser> | undefined;
function getBrowser(): Promise<Browser> {
  if (!browser) browser = chromium.launch({ headless: true }).catch(error => { browser = undefined; throw error; });
  return browser;
}
export async function closeBrowser(): Promise<void> {
  const current = browser; browser = undefined;
  if (current) await (await current).close();
}

export async function renderHtml({ html, width, height, out, pdf = false, assetDir, projectDir, safeZone, sampleTimeline = false }: { html: string; width: number; height: number; out: string; pdf?: boolean; assetDir?: string; projectDir?: string; safeZone?: SafeZone; sampleTimeline?: boolean }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error("Render size must be positive integer pixels");
  const dir = mkdtempSync(join(tmpdir(), "bstudio-render-"));
  const page = await (await getBrowser()).newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  try {
    const input = join(dir, "input.html"); writeFileSync(input, html);
    const roots = [assetDir, fileURLToPath(new URL('../../templates/', import.meta.url))].filter((path): path is string => !!path).map(path => realpathSync(path));
    const assets = projectDir ? join(projectDir, 'assets') : assetDir ? resolve(assetDir, '../..', 'assets') : undefined;
    const loadedFiles = new Set<string>();
    await page.routeWebSocket('**/*', socket => socket.close());
    await page.route('**/*', route => {
      const url = route.request().url();
      if (url.startsWith('data:')) return route.continue();
      if (url.startsWith('file:')) {
        try {
          const path = realpathSync(fileURLToPath(url));
          if (path === realpathSync(input) || roots.some(root => {
            const rel = relative(root, path);
            return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
          }) || (assets && (() => {
            try {
              const rel = relative(realpathSync(assets), path);
              const parts = rel.split(sep);
              return !isAbsolute(rel) && parts[0] !== '..' && parts.length >= 3 && parts[1] === 'out';
            } catch { return false; }
          })())) {
            if (path !== realpathSync(input)) loadedFiles.add(path);
            return route.continue();
          }
        } catch { /* missing, malformed, or inaccessible file */ }
      }
      return route.abort();
    });
    await page.goto(pathToFileURL(input).href, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    let metrics = await measureText(page, safeZone);
    if (sampleTimeline) {
      const duration = await page.evaluate(() => {
        const timelines = Object.values((window as unknown as { __timelines?: Record<string, { duration?: () => number; seek?: (time: number) => unknown; pause?: () => unknown }> }).__timelines ?? {});
        const seekable = timelines.filter(timeline => typeof timeline.seek === "function" && typeof timeline.duration === "function");
        for (const timeline of seekable) timeline.pause?.();
        return Math.max(0, ...seekable.map(timeline => timeline.duration!()).filter(Number.isFinite));
      });
      if (duration > 0) {
        for (const fraction of [.25, .5, .75]) {
          await page.evaluate(time => {
            const timelines = Object.values((window as unknown as { __timelines?: Record<string, { seek?: (time: number) => unknown }> }).__timelines ?? {});
            for (const timeline of timelines) timeline.seek?.(time);
          }, duration * fraction);
          const next = await measureText(page, safeZone);
          const nodes = [...metrics.nodes, ...next.nodes];
          metrics = { minFontPx: nodes.length ? Math.min(...nodes.map(n => n.fontPx)) : null, minContrast: nodes.some(n => n.contrast === null) ? null : nodes.length ? Math.min(...nodes.map(n => n.contrast!)) : null, overflow: metrics.overflow || next.overflow, edge: metrics.edge || next.edge, nodes, unmeasurable: [...new Set([...metrics.unmeasurable, ...next.unmeasurable])] };
        }
      } else metrics.unmeasurable.push("video timeline (only static composition state measured)");
    }
    mkdirSync(dirname(resolve(out)), { recursive: true });
    if (pdf) {
      await page.addStyleTag({ content: `@page { size: ${width}px ${height}px; margin: 0 } html, body { margin: 0; padding: 0 } .slide { break-after: page; page-break-after: always } .slide:last-child { break-after: auto; page-break-after: auto }` });
      await page.pdf({ path: out, width: `${width}px`, height: `${height}px`, printBackground: true, preferCSSPageSize: true });
    } else await page.screenshot({ path: out, type: "png", animations: "disabled" });
    return { file: out, width, height, bytes: statSync(out).size, metrics, loadedFiles: [...loadedFiles] };
  } finally { await page.close(); rmSync(dir, { recursive: true, force: true }); }
}

export function renderSvg(svgPath: string, outPngs: { file: string; size: number }[]): string[] {
  const svg = readFileSync(svgPath);
  return outPngs.map(({ file, size }) => {
    if (!Number.isInteger(size) || size <= 0) throw new Error("SVG size must be a positive integer");
    mkdirSync(dirname(resolve(file)), { recursive: true });
    const png = new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
    writeFileSync(file, png); return file;
  });
}

/** Render both SVG and PNG; `out` selects either artifact's basename. */
export async function renderDiagram(sourcePath: string, out: string, config?: StudioConfig, io?: IO): Promise<{ svg: string; png: string }> {
  const ext = extname(sourcePath).toLowerCase();
  if (!['.mmd', '.d2', '.json'].includes(ext)) throw new Error('Diagram source must be .mmd, .d2 or .json');
  const base = /\.(svg|png)$/i.test(out) ? out.slice(0, -4) : out;
  const svg = `${base}.svg`, png = `${base}.png`;
  mkdirSync(dirname(resolve(svg)), { recursive: true });
  const toolIO = io ?? { cwd: process.cwd(), env: process.env, err: (message: string) => console.error(message) } as IO;
  if (!config) {
    config = existsSync(configFile(toolIO)) ? loadConfig(toolIO) : { root: resolve(toolIO.env.HOME ?? tmpdir(), 'BlastStudio'), file: resolve(toolIO.env.HOME ?? tmpdir(), '.config/blast-studio/studio.yml'), agent: { sandbox: 'off' } } as StudioConfig;
  }
  const temp = mkdtempSync(join(tmpdir(), 'bstudio-diagram-'));
  const run = async (command: string, args: string[], extraReads: string[] = []) => {
    const wrapped = sandboxCommand(toolIO, config!, dirname(resolve(svg)), temp, command, args, { render: true, readPaths: [resolve(sourcePath), ...extraReads] });
    return exec(wrapped.command, wrapped.args, { timeout: 30000, env: agentEnv(toolIO, { temp, home: temp, minimal: true }) });
  };
  try {
    if (ext === '.mmd') {
      const mmdc = packageBin('@mermaid-js/mermaid-cli', 'mmdc');
      if (!mmdc) throw new Error('Mermaid CLI is not installed');
      const configPath = join(temp, 'puppeteer.json');
      writeFileSync(configPath, JSON.stringify({ executablePath: chromium.executablePath(), pipe: true, args: ['--no-sandbox'] }));
      const mermaidConfig = join(temp, 'mermaid.json');
      writeFileSync(mermaidConfig, JSON.stringify({ htmlLabels: false, flowchart: { htmlLabels: false } }));
      try { await run(mmdc, ['-i', resolve(sourcePath), '-o', resolve(svg), '-p', configPath, '-c', mermaidConfig, '-b', 'white']); }
      catch (error) { throw new Error(`Mermaid rendering failed; install dependencies with npm install and Chromium with npx playwright install chromium: ${String(error)}`); }
    } else if (ext === '.json') {
      const script = fileURLToPath(new URL('../../../slipway/skills/arch-diagram/scripts/diagram.py', import.meta.url));
      try { await run('python3', [script, resolve(sourcePath), '-o', resolve(base), '--format', 'svg'], [script]); }
      catch (error) { throw new Error(`Architecture diagram rendering requires ../slipway/skills/arch-diagram/scripts/diagram.py: ${String(error)}`); }
    } else {
      try { await run('d2', [resolve(sourcePath), resolve(svg)]); }
      catch (error) { throw new Error(`D2 rendering failed; install D2 from https://d2lang.com/tour/install: ${String(error)}`); }
    }
    const rendered = new Resvg(readFileSync(svg)).render();
    writeFileSync(png, rendered.asPng());
    return { svg, png };
  } finally { rmSync(temp, { recursive: true, force: true }); }
}
