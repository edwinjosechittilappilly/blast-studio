import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeBrowser, renderDiagram, renderHtml, renderSvg } from '../src/render/stills.ts';
import { fillTemplate } from '../src/render/template.ts';

const dir = mkdtempSync(join(tmpdir(), 'bstudio-test-render-'));
after(async () => { await closeBrowser(); rmSync(dir, { recursive: true, force: true }); });
const dimensions = (file: string) => { const png = readFileSync(file); return [png.readUInt32BE(16), png.readUInt32BE(20)]; };

test('card is escaped and rendered at viewport size with usable metrics', { timeout: 20000 }, async () => {
  const html = fillTemplate('card', { title: 'Hello <world>', subtitle: 'A clear message' }, { name: 'Studio' });
  assert.match(html, /Hello &lt;world&gt;/);
  const out = join(dir, 'card.png');
  const result = await renderHtml({ html, width: 800, height: 1000, out });
  assert.deepEqual(dimensions(out), [800, 1000]);
  assert.equal(result.metrics.overflow, false);
  assert.ok(result.metrics.minContrast! >= 4.5);
  assert.ok(result.metrics.nodes.length >= 3);
});

test('carousel PDF has one page per slide', { timeout: 20000 }, async () => {
  const html = '<style>html,body{margin:0}.slide{width:400px;height:500px;display:flex;align-items:center;justify-content:center}</style><div class="slide">One</div><div class="slide">Two</div><div class="slide">Three</div>';
  const out = join(dir, 'carousel.pdf');
  await renderHtml({ html, width: 400, height: 500, out, pdf: true });
  const pdf = readFileSync(out, 'latin1');
  assert.equal((pdf.match(/\/Type\s*\/Page\b/g) ?? []).length, 3);
});

test('metrics report low contrast, overflow and unknown image backgrounds', { timeout: 20000 }, async () => {
  const html = '<style>body{margin:0;background:#fff;color:#ccc;font:20px sans-serif}.edge{position:absolute;top:0;left:0}.image{margin:100px;background-image:linear-gradient(red,blue)}</style><div class="edge">low contrast</div><div class="image">unknown</div>';
  const result = await renderHtml({ html, width: 400, height: 400, out: join(dir, 'low.png') });
  assert.equal(result.metrics.overflow, true);
  assert.ok(result.metrics.nodes.find(n => n.text === 'low contrast')!.contrast! < 4.5);
  assert.equal(result.metrics.nodes.find(n => n.text === 'unknown')!.contrast, null);
  assert.equal(result.metrics.minContrast, null);
});

test('SVG logo renders required sizes', { timeout: 20000 }, () => {
  const input = join(dir, 'logo.svg');
  writeFileSync(input, '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="100" height="50" fill="navy"/></svg>');
  const sizes = [32, 180, 512];
  const outputs = sizes.map(size => ({ size, file: join(dir, `logo-${size}.png`) }));
  assert.deepEqual(renderSvg(input, outputs), outputs.map(o => o.file));
  outputs.forEach(o => assert.deepEqual(dimensions(o.file), [o.size, o.size / 2]));
});

test('Mermaid renders SVG and PNG', { timeout: 20000 }, async () => {
  const input = join(dir, 'graph.mmd'); writeFileSync(input, 'graph LR\n A[Alpha label] --> B[Beta label]\n');
  const output = await renderDiagram(input, join(dir, 'mermaid.svg'));
  const svg = readFileSync(output.svg, 'utf8');
  assert.match(svg, /<text[\s>]/);
  const text = svg.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(text, /Alpha\s+label/);
  assert.match(text, /Beta\s+label/);
  assert.ok(readFileSync(output.png).length > 100);
});

test('D2 renders SVG and PNG', { timeout: 20000 }, async () => {
  const input = join(dir, 'graph.d2'); writeFileSync(input, 'a -> b\n');
  const output = await renderDiagram(input, join(dir, 'diagram.svg'));
  assert.match(readFileSync(output.svg, 'utf8'), /<svg/);
  assert.ok(readFileSync(output.png).length > 100);
});
