import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { BrandKit } from '../types.ts';

const templateDir = new URL('../../templates/', import.meta.url);
const names: Record<string, true> = { card: true, quote: true, code: true, poster: true, thumbnail: true, 'carousel-title': true, 'carousel-content': true, 'carousel-closing': true };
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const color = (value: string | undefined, fallback: string) => value && /^(#[\da-f]{3,8}|[a-z]+)$/i.test(value) ? value : fallback;
const family = (value: string | undefined, fallback: string) => value && /^[\w -]+$/.test(value) ? value : fallback;

/** Slots are plain text, never HTML. Code snippets are escaped like every other field. */
export function fillTemplate(name: string, data: Record<string, unknown>, brand: BrandKit): string {
  if (!names[name]) throw new Error(`Unknown template: ${name}`);
  const source = readFileSync(fileURLToPath(new URL(`${name}.html`, templateDir)), 'utf8');
  const font = (file: string) => pathToFileURL(fileURLToPath(new URL(`fonts/${file}`, templateDir))).href;
  const styles = `<style>
@font-face{font-family:'IBM Plex Sans';src:url('${font('IBMPlexSans.woff2')}')}@font-face{font-family:'IBM Plex Mono';src:url('${font('IBMPlexMono.woff2')}')}@font-face{font-family:'Space Grotesk';src:url('${font('SpaceGrotesk.woff2')}')}
:root{--ink:${color(brand.colors?.ink, '#172a35')};--paper:${color(brand.colors?.paper, '#eef3f3')};--accent:${color(brand.colors?.accent, '#245f73')};--accent2:${color(brand.colors?.accent2, '#d1e2df')};--display:'${family(brand.fonts?.display, 'Space Grotesk')}';--text:'${family(brand.fonts?.text, 'IBM Plex Sans')}';--mono:'${family(brand.fonts?.mono, 'IBM Plex Mono')}'}
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%}body{background:var(--paper);color:var(--ink);font-family:var(--text),sans-serif}.slide{width:100vw;height:100vh;padding:8%;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden;background:var(--paper)}h1,h2,p,blockquote,pre{margin:0}h1,h2,blockquote{font-family:var(--display),sans-serif;line-height:1.08;overflow-wrap:anywhere}h1{font-size:clamp(36px,8vw,120px);letter-spacing:-.035em}h2,blockquote{font-size:clamp(30px,6vw,90px);letter-spacing:-.025em}p{font-size:clamp(18px,2.8vw,36px);line-height:1.35;max-width:40ch}.brand{font-size:clamp(15px,1.8vw,24px);font-weight:700}.accent{color:var(--accent)}.content{display:grid;gap:1.4em}pre{font-family:var(--mono),monospace;white-space:pre-wrap;overflow-wrap:anywhere;font-size:clamp(14px,2.3vw,30px);line-height:1.45;background:var(--accent2);padding:1em}.quote-mark{font-size:clamp(60px,12vw,150px);line-height:.7;color:var(--accent)}
</style>`;
  return source.replace(/{{\s*([\w-]+)\s*}}/g, (_, key: string) => key === 'styles' ? styles : escape(key === 'brand' ? (data.brand ?? brand.name) : data[key]));
}
