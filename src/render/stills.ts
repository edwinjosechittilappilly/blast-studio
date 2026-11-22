import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { Resvg } from "@resvg/resvg-js";
import { chromium } from "playwright";
import type { Browser } from "playwright";
import { measureText } from "./metrics.ts";

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

export async function renderHtml({ html, width, height, out, pdf = false }: { html: string; width: number; height: number; out: string; pdf?: boolean }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error("Render size must be positive integer pixels");
  const dir = mkdtempSync(join(tmpdir(), "bstudio-render-"));
  const page = await (await getBrowser()).newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  try {
    await page.route('**/*', route => /^(file|data|blob):/.test(route.request().url()) ? route.continue() : route.abort());
    const input = join(dir, "input.html"); writeFileSync(input, html);
    await page.goto(pathToFileURL(input).href, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const metrics = await measureText(page);
    mkdirSync(dirname(resolve(out)), { recursive: true });
    if (pdf) {
      await page.addStyleTag({ content: `@page { size: ${width}px ${height}px; margin: 0 } html, body { margin: 0; padding: 0 } .slide { break-after: page; page-break-after: always } .slide:last-child { break-after: auto; page-break-after: auto }` });
      await page.pdf({ path: out, width: `${width}px`, height: `${height}px`, printBackground: true, preferCSSPageSize: true });
    } else await page.screenshot({ path: out, type: "png", animations: "disabled" });
    return { file: out, width, height, bytes: statSync(out).size, metrics };
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
export async function renderDiagram(sourcePath: string, out: string): Promise<{ svg: string; png: string }> {
  const ext = extname(sourcePath).toLowerCase();
  if (ext !== '.mmd' && ext !== '.d2') throw new Error('Diagram source must be .mmd or .d2');
  const base = /\.(svg|png)$/i.test(out) ? out.slice(0, -4) : out;
  const svg = `${base}.svg`, png = `${base}.png`;
  mkdirSync(dirname(resolve(svg)), { recursive: true });
  const temp = mkdtempSync(join(tmpdir(), 'bstudio-diagram-'));
  try {
    if (ext === '.mmd') {
      const mmdc = fileURLToPath(new URL('../../node_modules/.bin/mmdc', import.meta.url));
      const config = join(temp, 'puppeteer.json');
      writeFileSync(config, JSON.stringify({ executablePath: chromium.executablePath(), args: ['--no-sandbox'] }));
      try { await exec(mmdc, ['-i', resolve(sourcePath), '-o', resolve(svg), '-p', config], { timeout: 30000 }); }
      catch (error) { throw new Error(`Mermaid rendering failed; install dependencies with npm install and Chromium with npx playwright install chromium: ${String(error)}`); }
    } else {
      try { await exec('d2', [resolve(sourcePath), resolve(svg)], { timeout: 30000 }); }
      catch (error) { throw new Error(`D2 rendering failed; install D2 from https://d2lang.com/tour/install: ${String(error)}`); }
    }
    const rendered = new Resvg(readFileSync(svg)).render();
    writeFileSync(png, rendered.asPng());
    return { svg, png };
  } finally { rmSync(temp, { recursive: true, force: true }); }
}
