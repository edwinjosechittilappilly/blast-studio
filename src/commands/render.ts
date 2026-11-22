import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse, stringify } from 'yaml';
import { loadConfig, projectDir } from '../config.ts';
import { loadPacks, knownValue } from '../packs.ts';
import { readPlan } from '../plan.ts';
import { loadPosts, serializePost } from '../posts.ts';
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
  const selections = new Map<string, Map<string, { image?: string; document?: string; slides?: string[] }>>();
  const rendered = new Set<string>();
  try {
    const assets = plan.flatMap(entry => entry.assets).sort((a, b) => Number(b.kind === 'voiceover') - Number(a.kind === 'voiceover'));
    const skipped: string[] = [];
    for (const asset of assets) {
      if (rendered.has(asset.id)) continue;
      rendered.add(asset.id);
      const dir = join(project, 'assets', asset.id), metaPath = join(dir, 'asset.yml');
      if (!existsSync(metaPath)) throw new UserError(`Missing ${metaPath}`);
      const raw = parse(readFileSync(metaPath, 'utf8')) as AssetMeta & { size?: { width: number; height: number }; width?: number; height?: number };
      if (!raw || raw.id !== asset.id || raw.kind !== asset.kind) throw new UserError(`Invalid metadata for ${asset.id}`);
      const out = join(dir, 'out'); mkdirSync(out, { recursive: true });
      const outputs: AssetMeta['outputs'] = [], metrics: NonNullable<AssetMeta['metrics']> = [];
      const add = (file: string, width?: number, height?: number) => outputs.push({ file: `out/${basename(file)}`, bytes: statSync(file).size, ...(width ? { width } : {}), ...(height ? { height } : {}) });
      const uses = plan.flatMap(p => p.assets.filter(a => a.id === asset.id).map(a => ({ platform: p.platform, asset: a })));
      const dimensions = uses.map(use => {
        const spec = packs.get(use.platform)?.media.find(m => m.kind === 'image');
        const ratio = use.asset.aspect ?? knownValue(spec?.aspectRatios)?.[0];
        const parts = ratio?.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
        const w = raw.size?.width ?? raw.width ?? knownValue(spec?.width) ?? 1080;
        const h = raw.size?.height ?? raw.height ?? knownValue(spec?.height) ?? (parts ? Math.round(w * Number(parts[2]) / Number(parts[1])) : 1080);
        return { platform: use.platform, width: w, height: h };
      });
      const variants = [...new Map(dimensions.map(d => [`${d.width}x${d.height}`, d])).values()];
      const { width, height } = variants[0];
      const html = (file: string) => { const text = readFileSync(file, 'utf8'), base = `<base href="${pathToFileURL(`${dirname(file)}/`).href}">`; return /<head(?:\s[^>]*)?>/i.test(text) ? text.replace(/<head(?:\s[^>]*)?>/i, `$&${base}`) : base + text; };
      const still = async (source: string, dest: string, width: number, height: number) => { const result = await renderHtml({ html: html(source), width, height, out: dest, assetDir: dir, projectDir: project }); add(dest, width, height); metrics.push({ file: `out/${basename(dest)}`, minFontPx: result.metrics.minFontPx, minContrast: result.metrics.minContrast, overflow: result.metrics.overflow, nodes: result.metrics.nodes, texts: result.metrics.nodes.map(n => n.text) }); for (const file of result.loadedFiles) { const parts = relative(realpathSync(join(project, 'assets')), file).split(sep); if (parts.length >= 3 && parts[1] === 'out' && parts[0] !== '..' && parts[0] !== asset.id) raw.embeds = [...new Set([...(raw.embeds ?? []), parts[0]])]; } };
      if (asset.kind === 'video' || asset.kind === 'terminal-demo') {
        const voiceId = (raw as AssetMeta & { voiceover?: string }).voiceover;
        let voice: string | undefined;
        if (voiceId) {
          const embedded = metadata.get(voiceId);
          if (!embedded || embedded.meta.kind !== 'voiceover') throw new UserError(`Unknown voiceover asset: ${voiceId}`);
          const wav = join(embedded.dir, 'out', 'voiceover.wav');
          // A skipped voiceover (voice.provider none) leaves the video silent rather than failing the render.
          if (existsSync(wav)) { voice = wav; raw.embeds = [...new Set([...(raw.embeds ?? []), voiceId])]; }
        } else if (config.voice.provider !== 'none' && [join(dir, 'script.txt'), join(dir, 'source', 'script.txt')].some(existsSync)) {
          const script = [join(dir, 'script.txt'), join(dir, 'source', 'script.txt')].find(existsSync)!;
          const generated = await generateVoice({ config, io, projectSlug: pos[0], text: readFileSync(script, 'utf8'), out: join(out, 'voiceover.wav'), regen });
          voice = generated.file; raw.aiGenerated = true;
        }
        outputs.push(...await renderVideo(dir, config, io, voice));
      }
      else if (asset.kind === 'illustration' && config.images.provider === 'none') {
        skipped.push(`${asset.id}: illustration needs images.provider (now none); set one and a budget, or replace it with a template card`);
        raw.skipped = 'images.provider is none';
      }
      else if (asset.kind === 'voiceover' && config.voice.provider === 'none') {
        skipped.push(`${asset.id}: voiceover needs voice.provider (now none); the video renders silent with captions`);
        raw.skipped = 'voice.provider is none';
      }
      else if (asset.kind === 'illustration') {
        const promptFile = join(dir, 'source.json'); const data = parse(readFileSync(promptFile, 'utf8')) as { prompt: string; size?: string };
        const chosen = new Map<string, { image?: string }>();
        let cost: number | null = 0;
        for (const variant of variants) {
          const suffix = variants.length > 1 ? `-${variant.width}x${variant.height}` : '', file = `illustration${suffix}.png`;
          const generated = await generateImage({ config, io, projectSlug: pos[0], prompt: data.prompt, size: data.size ?? `${variant.width}x${variant.height}`, out: join(out, file), regen });
          raw.provider = generated.provider as AssetMeta['provider']; raw.aiGenerated = generated.aiGenerated; raw.promptHash = generated.promptHash; raw.license = generated.license;
          cost = cost === null || generated.costUsd === null ? null : cost + generated.costUsd;
          const png = readFileSync(generated.file); if (png.length < 24 || png.toString('ascii', 12, 16) !== 'IHDR') throw new UserError('Generated image has invalid PNG dimensions'); add(generated.file, png.readUInt32BE(16), png.readUInt32BE(20));
          for (const use of dimensions.filter(d => d.width === variant.width && d.height === variant.height)) chosen.set(use.platform, { image: `assets/${asset.id}/out/${file}` });
        }
        raw.costUsd = cost; selections.set(asset.id, chosen);
      } else if (asset.kind === 'voiceover') {
        const generated = await generateVoice({ config, io, projectSlug: pos[0], text: readFileSync(join(dir, 'source.txt'), 'utf8'), out: join(out, 'voiceover.wav'), regen });
        raw.provider = generated.provider; raw.aiGenerated = generated.aiGenerated; raw.costUsd = generated.costUsd; raw.promptHash = generated.promptHash; raw.license = generated.license; add(generated.file);
      } else if (asset.kind === 'logo') {
        const source = join(dir, 'source.svg'), svg = join(out, 'logo.svg'); copyFileSync(source, svg); add(svg);
        const pngs = [32, 180, 512].map(size => ({ file: join(out, `logo-${size}.png`), size })); renderSvg(source, pngs); for (const p of pngs) { const png = readFileSync(p.file); add(p.file, png.readUInt32BE(16), png.readUInt32BE(20)); }
        const favicon = join(out, 'favicon.ico'); const png = readFileSync(pngs[0].file); const header = Buffer.alloc(22); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4); header[6] = 32; header[7] = 32; header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12); header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18); writeFileSync(favicon, Buffer.concat([header, png])); add(favicon);
      } else if (asset.kind === 'diagram') {
        const source = ['source.mmd', 'source.d2', 'source.json'].map(f => join(dir, f)).find(existsSync); if (!source) throw new UserError(`Missing diagram source for ${asset.id}`);
        const result = await renderDiagram(source, join(out, 'diagram')); add(result.svg); add(result.png); raw.provider = extname(source) === '.mmd' ? 'mermaid' : extname(source) === '.json' ? 'arch-diagram' : 'd2';
      } else if (asset.kind === 'carousel') {
        const slidesDir = join(dir, 'source'); const slides = readdirSync(slidesDir).filter(f => f.endsWith('.html')).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })); if (!slides.length) throw new UserError(`No carousel slides in ${slidesDir}`);
        const chosen = new Map<string, { image?: string; document?: string; slides?: string[] }>();
        for (const variant of variants) {
          const suffix = variants.length > 1 ? `-${variant.width}x${variant.height}` : '';
          const files: string[] = [];
          for (const [index, slide] of slides.entries()) { const file = `slide-${index + 1}${suffix}.png`; await still(join(slidesDir, slide), join(out, file), variant.width, variant.height); files.push(`assets/${asset.id}/out/${file}`); }
          const pdfName = `carousel${suffix}.pdf`, pdf = join(out, pdfName);
          const pages = files.map(file => `<div class="slide"><img src="${pathToFileURL(join(project, file)).href}" width="${variant.width}" height="${variant.height}"></div>`).join('');
          await renderHtml({ html: `<style>html,body{margin:0;padding:0}.slide{width:${variant.width}px;height:${variant.height}px;break-after:page}.slide:last-child{break-after:auto}img{display:block}</style>${pages}`, width: variant.width, height: variant.height, out: pdf, pdf: true, assetDir: dir, projectDir: project });
          add(pdf, variant.width, variant.height);
          for (const use of dimensions.filter(d => d.width === variant.width && d.height === variant.height)) chosen.set(use.platform, { image: files[0], slides: files, document: `assets/${asset.id}/out/${pdfName}` });
        }
        selections.set(asset.id, chosen);
      } else if (asset.kind === 'card' || asset.kind === 'poster') {
        const chosen = new Map<string, { image?: string }>();
        for (const variant of variants) {
          const suffix = variants.length > 1 ? `-${variant.width}x${variant.height}` : '', file = `image${suffix}.png`;
          await still(join(dir, 'source.html'), join(out, file), variant.width, variant.height);
          for (const use of dimensions.filter(d => d.width === variant.width && d.height === variant.height)) chosen.set(use.platform, { image: `assets/${asset.id}/out/${file}` });
        }
        selections.set(asset.id, chosen);
      }
      else throw new UserError(`Unsupported asset kind: ${asset.kind}`);
      raw.outputs = outputs; raw.metrics = metrics; metadata.set(asset.id, { dir, meta: raw });
    }
    const resolveAI = (id: string, visiting = new Set<string>()): boolean => { const item = metadata.get(id); if (!item) throw new UserError(`Unknown embedded asset: ${id}`); if (visiting.has(id)) throw new UserError(`Cyclic asset embeds: ${id}`); visiting.add(id); const inherited = (item.meta.embeds ?? []).map(child => resolveAI(child, visiting)).some(Boolean); visiting.delete(id); item.meta.aiGenerated ||= inherited; return item.meta.aiGenerated; };
    for (const [id, item] of metadata) { resolveAI(id); writeFileSync(join(item.dir, 'asset.yml'), stringify(item.meta)); }
    for (const [platform, post] of loadPosts(project)) {
      let changed = false;
      const indices = new Map<string, number>();
      for (const media of post.media) {
        const selected = selections.get(media.asset)?.get(platform);
        if (!selected) continue;
        let file: string | undefined;
        if (media.kind === 'document') file = selected.document;
        else if (media.kind === 'image') {
          const index = indices.get(media.asset) ?? 0; indices.set(media.asset, index + 1);
          const slide = basename(media.file).match(/slide-(\d+)/);
          file = selected.slides?.[slide ? Number(slide[1]) - 1 : index] ?? (selected.slides ? undefined : selected.image);
        }
        if (file && media.file !== file) { media.file = file; changed = true; }
      }
      if (changed) writeFileSync(post.path, serializePost(post));
    }
    for (const line of skipped) io.out(`skipped ${line}`);
    io.out(`Rendered ${metadata.size - skipped.length} assets${skipped.length ? `, skipped ${skipped.length}` : ''}`); return 0;
  } finally { await closeBrowser(); }
};
