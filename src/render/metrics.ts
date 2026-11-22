import type { Page } from "playwright";

/** `overflow`: text is cut off (outside the canvas or slide, or clipped by an ancestor). `edge`: text sits inside the safe margin. */
export interface TextMetric { text: string; fontPx: number; bold: boolean; contrast: number | null; overflow: boolean; edge: boolean }
export interface RenderMetrics { minFontPx: number | null; minContrast: number | null; overflow: boolean; edge: boolean; nodes: TextMetric[] }

/** Measure actual rendered text, not bounding boxes of its containers. */
export async function measureText(page: Page, inset = 0.05): Promise<RenderMetrics> {
  return page.evaluate((safeInset) => {
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
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes: TextMetric[] = [];
    while (walker.nextNode()) {
      const node = walker.currentNode; const text = node.textContent?.trim(); const el = node.parentElement;
      if (!text || !el) continue;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility !== 'visible' || +style.opacity === 0) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      const rects = [...range.getClientRects()].filter(r => r.width > 0 && r.height > 0);
      if (!rects.length) continue;
      let bg: Color = [0, 0, 0, 0]; let unknown = false;
      for (let p: HTMLElement | null = el; p; p = p.parentElement) {
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
      const outside = (r: DOMRect, box: { left: number; top: number; width: number; height: number }, inset: number) => r.left < box.left + box.width * inset - .5 || r.right > box.left + box.width * (1 - inset) + .5 || r.top < box.top + box.height * inset - .5 || r.bottom > box.top + box.height * (1 - inset) + .5;
      let clipped = false;
      for (let p: HTMLElement | null = el; p && p !== document.body && !clipped; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (s.overflowX !== 'visible' || s.overflowY !== 'visible') clipped = rects.some(r => outside(r, p!.getBoundingClientRect(), 0));
      }
      const overflow = clipped || rects.some(r => outside(r, bounds, 0));
      const edge = !overflow && rects.some(r => outside(r, bounds, safeInset));
      nodes.push({ text, fontPx: parseFloat(style.fontSize), bold: Number(style.fontWeight) >= 700 || style.fontWeight === 'bold', contrast, overflow, edge });
    }
    return { minFontPx: nodes.length ? Math.min(...nodes.map(n => n.fontPx)) : null, minContrast: nodes.some(n => n.contrast === null) ? null : nodes.length ? Math.min(...nodes.map(n => n.contrast!)) : null, overflow: nodes.some(n => n.overflow), edge: nodes.some(n => n.edge), nodes };
  }, inset);
}
