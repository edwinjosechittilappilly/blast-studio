import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse, stringify } from 'yaml';
import { loadConfig, projectDir } from '../config.ts';
import { loadPacks, knownValue } from '../packs.ts';
import { readPlan } from '../plan.ts';
import { closeBrowser, renderDiagram, renderHtml, renderSvg } from '../render/stills.ts';
import { renderVideo } from '../render/video.ts';
import { generateImage } from '../providers/images.ts';
import { generateVoice } from '../providers/voice.ts';
import { UserError } from '../types.ts';
import type { AssetMeta } from '../types.ts';
import type { Command } from '../io.ts';

export const run: Command = async (args, io) => {
  const regen = args.includes('--regen'), pos = args.filter(a => a !== '--regen');
  if (pos.length !== 1 || pos[0].startsWith('-')) throw new UserError('usage: bstudio render <slug> [--regen]');
  const config = loadConfig(io), project = projectDir(config, pos[0]), plan = readPlan(project), packs = loadPacks();
  const metadata = new Map<string, { dir: string; meta: AssetMeta }>();
  try {
    for (const entry of plan) for (const asset of entry.assets) {
      const dir = join(project, 'assets', asset.id), metaPath = join(dir, 'asset.yml');
      if (!existsSync(metaPath)) throw new UserError(`Missing ${metaPath}`);
      const raw = parse(readFileSync(metaPath, 'utf8')) as AssetMeta & { size?: { width: number; height: number }; width?: number; height?: number };
      if (!raw || raw.id !== asset.id || raw.kind !== asset.kind) throw new UserError(`Invalid metadata for ${asset.id}`);
      const out = join(dir, 'out'); mkdirSync(out, { recursive: true });
      const outputs: AssetMeta['outputs'] = [], metrics: NonNullable<AssetMeta['metrics']> = [];
      const add = (file: string, width?: number, height?: number) => outputs.push({ file: `out/${basename(file)}`, bytes: statSync(file).size, ...(width ? { width } : {}), ...(height ? { height } : {}) });
      const pack = packs.get(entry.platform), spec = pack?.media.find(m => m.kind === 'image');
      const width = raw.size?.width ?? raw.width ?? knownValue(spec?.width) ?? 1080, height = raw.size?.height ?? raw.height ?? knownValue(spec?.height) ?? 1080;
      const html = (file: string) => { const text = readFileSync(file, 'utf8'), base = `<base href="${pathToFileURL(`${dirname(file)}/`).href}">`; return /<head(?:\s[^>]*)?>/i.test(text) ? text.replace(/<head(?:\s[^>]*)?>/i, `$&${base}`) : base + text; };
      const still = async (source: string, dest: string) => { const result = await renderHtml({ html: html(source), width, height, out: dest }); add(dest, width, height); metrics.push({ file: `out/${basename(dest)}`, minFontPx: result.metrics.minFontPx ?? 0, minContrast: result.metrics.minContrast, overflow: result.metrics.overflow }); };
      if (asset.kind === 'video' || asset.kind === 'terminal-demo') outputs.push(...await renderVideo(dir, config, io));
      else if (asset.kind === 'illustration') {
        const promptFile = join(dir, 'source.json'); const data = parse(readFileSync(promptFile, 'utf8')) as { prompt: string; size?: string };
        const generated = await generateImage({ config, io, projectSlug: pos[0], prompt: data.prompt, size: data.size ?? `${width}x${height}`, out: join(out, 'illustration.png'), regen });
        raw.provider = generated.provider as AssetMeta['provider']; raw.aiGenerated = generated.aiGenerated; raw.costUsd = generated.costUsd; raw.promptHash = generated.promptHash; raw.license = generated.license;
        const png = readFileSync(generated.file); if (png.length < 24 || png.toString('ascii', 12, 16) !== 'IHDR') throw new UserError('Generated image has invalid PNG dimensions'); add(generated.file, png.readUInt32BE(16), png.readUInt32BE(20));
      } else if (asset.kind === 'voiceover') {
        const generated = await generateVoice({ config, io, projectSlug: pos[0], text: readFileSync(join(dir, 'source.txt'), 'utf8'), out: join(out, 'voiceover.wav'), regen });
        raw.provider = generated.provider; raw.aiGenerated = generated.aiGenerated; raw.costUsd = generated.costUsd; raw.promptHash = generated.promptHash; raw.license = generated.license; add(generated.file);
      } else if (asset.kind === 'logo') {
        const source = join(dir, 'source.svg'), svg = join(out, 'logo.svg'); copyFileSync(source, svg); add(svg);
        const pngs = [32, 180, 512].map(size => ({ file: join(out, `logo-${size}.png`), size })); renderSvg(source, pngs); for (const p of pngs) add(p.file, p.size, p.size);
        const favicon = join(out, 'favicon.ico'); const png = readFileSync(pngs[0].file); const header = Buffer.alloc(22); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4); header[6] = 32; header[7] = 32; header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12); header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18); writeFileSync(favicon, Buffer.concat([header, png])); add(favicon);
      } else if (asset.kind === 'diagram') {
        const source = ['source.mmd', 'source.d2'].map(f => join(dir, f)).find(existsSync); if (!source) throw new UserError(`Missing diagram source for ${asset.id}`);
        const result = await renderDiagram(source, join(out, 'diagram')); add(result.svg); add(result.png); raw.provider = extname(source) === '.mmd' ? 'mermaid' : 'd2';
      } else if (asset.kind === 'carousel') {
        const slidesDir = join(dir, 'source'); const slides = readdirSync(slidesDir).filter(f => f.endsWith('.html')).sort(); if (!slides.length) throw new UserError(`No carousel slides in ${slidesDir}`);
        for (const [index, slide] of slides.entries()) await still(join(slidesDir, slide), join(out, `slide-${index + 1}.png`));
        const bodies = slides.map(slide => { const content = html(join(slidesDir, slide)); const styles = [...content.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi)].map(m => m[0]).join(''); const body = content.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? content; return `${styles}<div class="slide">${body}</div>`; }).join('\n');
        const pdf = join(out, 'carousel.pdf'); await renderHtml({ html: `<base href="${pathToFileURL(`${dir}/`).href}">${bodies}`, width, height, out: pdf, pdf: true }); add(pdf);
      } else if (asset.kind === 'card' || asset.kind === 'poster') await still(join(dir, 'source.html'), join(out, 'image.png'));
      else throw new UserError(`Unsupported asset kind: ${asset.kind}`);
      raw.outputs = outputs; raw.metrics = metrics; metadata.set(asset.id, { dir, meta: raw });
    }
    const resolveAI = (id: string, visiting = new Set<string>()): boolean => { const item = metadata.get(id); if (!item) throw new UserError(`Unknown embedded asset: ${id}`); if (visiting.has(id)) throw new UserError(`Cyclic asset embeds: ${id}`); visiting.add(id); const inherited = (item.meta.embeds ?? []).map(child => resolveAI(child, visiting)).some(Boolean); visiting.delete(id); item.meta.aiGenerated ||= inherited; return item.meta.aiGenerated; };
    for (const [id, item] of metadata) { resolveAI(id); writeFileSync(join(item.dir, 'asset.yml'), stringify(item.meta)); }
    io.out(`Rendered ${metadata.size} assets`); return 0;
  } finally { await closeBrowser(); }
};
