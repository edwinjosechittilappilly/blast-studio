import type { Page } from "playwright";
import type { PlatformPack } from "../types.ts";

export type SafeZone = { top: number; bottom: number; left: number; right: number };
export const defaultZone: SafeZone = { top: .05, bottom: .05, left: .05, right: .05 };

/** Combine the independently required insets of all destinations sharing an output. */
export function combinedZone(packs: (PlatformPack | undefined)[], kind: "image" | "video", vertical = true): { zone: SafeZone; description: string } {
  const zone: SafeZone = { top: 0, bottom: 0, left: 0, right: 0 };
  const descriptions = new Set<string>();
  for (const pack of packs) {
    const sourced = vertical || kind === "image" ? pack?.safeZones?.[kind] : undefined;
    const value = sourced && sourced !== "unknown" ? sourced.value : defaultZone;
    descriptions.add(sourced && sourced !== "unknown" ? `${pack!.name} zone (${sourced.source})` : `${pack?.name ?? "Unknown platform"} default 5% margin`);
    for (const side of ["top", "bottom", "left", "right"] as const) zone[side] = Math.max(zone[side], value[side]);
  }
  if (!packs.length) return { zone: { ...defaultZone }, description: "default 5% margin" };
  return { zone, description: [...descriptions].join(", ") };
}

/** `overflow`: text is cut off (outside the canvas or slide, or clipped by an ancestor). `edge`: text sits inside the safe margin. */
export interface TextMetric { text: string; fontPx: number; bold: boolean; contrast: number | null; overflow: boolean; edge: boolean }
export interface RenderMetrics { minFontPx: number | null; minContrast: number | null; overflow: boolean; edge: boolean; nodes: TextMetric[]; unmeasurable: string[] }

/** Measure actual rendered text, not bounding boxes of its containers. */
export async function measureText(page: Page, inset: SafeZone = defaultZone): Promise<RenderMetrics> {
  const results = await Promise.all(page.frames().map(frame => frame.evaluate((safeInset) => {
    type Color = [number, number, number, number];
    const parse = (value: string): Color | null => {
      const m = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
      if (!m) return null;
      return [+m[1], +m[2], +m[3], m[4] ? (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]) : 1];
    };
    const over = (a: Color, b: Color): Color => {
      const alpha = a[3] + b[3] * (1 - a[3]);
      return alpha ? [0, 1, 2].map(i => (a[i] * a[3] + b[i] * b[3] * (1 - a[3])) / alpha).concat(alpha) as Color : [0, 0, 0, 0];
    };
    const luminance = (c: Color) => [0, 1, 2].map(i => { const v = c[i] / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    const nodes: TextMetric[] = [];
    const unmeasurable: string[] = [];
    for (const el of document.querySelectorAll('canvas, img')) {
      const style = getComputedStyle(el), rect = el.getBoundingClientRect();
      if (style.display === 'none' || style.visibility !== 'visible' || +style.opacity === 0 || !rect.width || !rect.height) continue;
      if (el.tagName === 'CANVAS') unmeasurable.push('canvas');
      else if (el instanceof HTMLImageElement && (/\.svg(?:[?#]|$)/i.test(el.currentSrc) || /^data:image\/svg\+xml[;,]/i.test(el.currentSrc))) unmeasurable.push('SVG image');
    }
    const entries: { text: string; el: Element; style: CSSStyleDeclaration; rects: DOMRect[] }[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode, text = node.textContent?.trim(), el = node.parentElement;
      if (!text || !el) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      entries.push({ text, el, style: getComputedStyle(el), rects: [...range.getClientRects()] });
    }
    for (const el of document.querySelectorAll('*')) for (const pseudo of ['::before', '::after']) {
      const style = getComputedStyle(el, pseudo), content = style.content;
      if (!content || content === 'none' || content === 'normal') continue;
      const text = [...content.matchAll(/"((?:\\.|[^"\\])*)"/g)].map(m => m[1].replace(/\\(["\\])/g, '$1')).join('');
      if (text.trim()) entries.push({ text: text.trim(), el, style, rects: [el.getBoundingClientRect()] });
    }
    for (const { text, el, style, rects: allRects } of entries) {
      if (style.display === 'none' || style.visibility !== 'visible' || +style.opacity === 0) continue;
      const rects = allRects.filter(r => r.width > 0 && r.height > 0);
      if (!rects.length) continue;
      let bg: Color = [0, 0, 0, 0]; let unknown = false;
      for (let p: Element | null = el; p; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (s.backgroundImage !== 'none') { unknown = true; break; }
        const c = parse(s.backgroundColor); if (!c) { unknown = true; break; }
        bg = over(bg, c);
        if (bg[3] >= .999) break;
      }
      bg = over(bg, [255, 255, 255, 1]);
      const fg = parse(style.color); let contrast: number | null = null;
      if (!unknown && fg) { const a = luminance(over(fg, bg)); const b = luminance(bg); contrast = (Math.max(a, b) + .05) / (Math.min(a, b) + .05); }
      const slide = el.closest('.slide'); const bounds = slide?.getBoundingClientRect() ?? { left: 0, top: 0, width: innerWidth, height: innerHeight };
      const outside = (r: DOMRect, box: { left: number; top: number; width: number; height: number }, inset: SafeZone) => r.left < box.left + box.width * inset.left - .5 || r.right > box.left + box.width * (1 - inset.right) + .5 || r.top < box.top + box.height * inset.top - .5 || r.bottom > box.top + box.height * (1 - inset.bottom) + .5;
      let clipped = false;
      for (let p: Element | null = el; p && p !== document.body && !clipped; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (s.overflowX !== 'visible' || s.overflowY !== 'visible') clipped = rects.some(r => outside(r, p!.getBoundingClientRect(), { top: 0, bottom: 0, left: 0, right: 0 }));
      }
      const overflow = clipped || rects.some(r => outside(r, bounds, { top: 0, bottom: 0, left: 0, right: 0 }));
      const edge = !overflow && rects.some(r => outside(r, bounds, safeInset));
      nodes.push({ text, fontPx: parseFloat(style.fontSize), bold: Number(style.fontWeight) >= 700 || style.fontWeight === 'bold', contrast, overflow, edge });
    }
    return { nodes, unmeasurable };
  }, inset)));
  const nodes = results.flatMap(result => result.nodes);
  return { minFontPx: nodes.length ? Math.min(...nodes.map(n => n.fontPx)) : null, minContrast: nodes.some(n => n.contrast === null) ? null : nodes.length ? Math.min(...nodes.map(n => n.contrast!)) : null, overflow: nodes.some(n => n.overflow), edge: nodes.some(n => n.edge), nodes, unmeasurable: [...new Set(results.flatMap(result => result.unmeasurable))] };
}
