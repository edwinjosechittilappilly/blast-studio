import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import type { IO } from "../io.ts";
import type { AssetMeta, StudioConfig } from "../types.ts";
import { UserError } from "../types.ts";
import { encodeVideo, extractFrames, probeMedia, runTool } from "./ffmpeg.ts";

const sizes: Record<string, [number, number]> = { "9:16": [1080, 1920], "1:1": [1080, 1080], "16:9": [1920, 1080] };
const hyperframes = fileURLToPath(new URL("../../node_modules/.bin/hyperframes", import.meta.url));

type VideoSettings = { kind?: string; aspects?: unknown; captions?: { burn?: boolean } };

function captionScript(vtt: string, aspect: string, config: StudioConfig): string {
  const cues: { start: number; end: number; text: string }[] = [];
  const timestamp = (value: string) => value.split(":").reduce((sum, part) => sum * 60 + Number(part), 0);
  for (const block of vtt.replace(/\r\n?/g, "\n").split(/\n{2,}/).slice(1)) {
    const lines = block.split("\n"), line = lines.findIndex(l => l.includes("-->"));
    if (line < 0) continue;
    const match = lines[line].match(/^\s*((?:\d{2,}:)?\d{2}:\d{2}\.\d{3})\s+-->\s+((?:\d{2,}:)?\d{2}:\d{2}\.\d{3})(?:\s|$)/);
    if (!match) throw new UserError("Invalid WebVTT cue timing");
    const start = timestamp(match[1]), end = timestamp(match[2]);
    if (end <= start) throw new UserError("Invalid WebVTT cue duration");
    cues.push({ start, end, text: lines.slice(line + 1).join("\n").replace(/<[^>]*>/g, "") });
  }
  if (!cues.length) throw new UserError("Caption burn-in requires at least one WebVTT cue");
  const font = config.brand?.fonts?.text || "sans-serif";
  const data = JSON.stringify({ cues, font, bottom: aspect === "9:16" ? "17%" : "8%" }).replace(/</g, "\\u003c");
  return `<script>(() => {
    const {cues, font, bottom} = ${data};
    const root = document.querySelector('[data-composition-id]');
    for (const cue of cues) {
      const el = document.createElement('div');
      el.className = 'clip';
      el.dataset.start = String(cue.start);
      el.dataset.duration = String(cue.end - cue.start);
      el.dataset.trackIndex = '999';
      const decoder = document.createElement('textarea');
      decoder.innerHTML = cue.text;
      el.textContent = decoder.value;
      Object.assign(el.style, {position:'absolute', left:'10%', width:'80%', bottom,
        textAlign:'center', whiteSpace:'pre-line', color:'#fff', backgroundColor:'rgba(0,0,0,.85)',
        borderRadius:'12px', padding:'16px', boxSizing:'border-box', fontFamily:font,
        fontSize:'48px', lineHeight:'1.2', zIndex:'2147483647'});
      root.appendChild(el);
    }
  })();</script>`;
}

async function hasSubtitleFilter(io: IO): Promise<boolean> {
  const filters = await runTool(io, "ffmpeg", "ffmpeg", ["-hide_banner", "-filters"]);
  return /^\s*[.A-Z|]+\s+subtitles\s/m.test(filters);
}

/** Render editable per-aspect HyperFrames projects or a VHS tape into asset-relative outputs. */
export async function renderVideo(assetDir: string, config: StudioConfig, io: IO): Promise<AssetMeta["outputs"]> {
  assetDir = resolve(assetDir);
  const meta = parse(readFileSync(join(assetDir, "asset.yml"), "utf8")) as VideoSettings;
  if (!meta || typeof meta !== "object") throw new UserError("Invalid video asset.yml");
  const source = join(assetDir, "source"), out = join(assetDir, "out"), frameDir = join(out, "frames");
  const caption = join(source, "captions.vtt"), voice = join(source, "voiceover.wav");
  if (meta.captions?.burn && !existsSync(caption)) throw new UserError("Caption burn-in requested but source/captions.vtt is missing");
  mkdirSync(out, { recursive: true });
  const outputs: AssetMeta["outputs"] = [];
  if (existsSync(caption)) {
    const contents = readFileSync(caption, "utf8");
    if (!/^\uFEFF?WEBVTT(?:\s|$)/.test(contents)) throw new UserError("source/captions.vtt must be a WebVTT file");
    const dest = join(out, "captions.vtt"); copyFileSync(caption, dest);
    outputs.push({ file: "out/captions.vtt", bytes: statSync(dest).size });
  }
  const tape = existsSync(join(source, "demo.tape")) ? join(source, "demo.tape") : join(assetDir, "demo.tape");
  if (meta.kind === "terminal-demo" || existsSync(tape)) {
    if (!existsSync(tape)) throw new UserError("Terminal demo requires source/demo.tape");
    const tapeText = readFileSync(tape, "utf8");
    const names = [...tapeText.matchAll(/^\s*Output\s+(?:"([^"]+)"|'([^']+)'|(\S+))\s*(?:#.*)?$/gmi)].map(m => m[1] ?? m[2] ?? m[3]);
    if (!names.length) throw new UserError("VHS tape must declare an MP4 or GIF Output");
    const tapeDir = dirname(tape);
    for (const name of names) {
      if (isAbsolute(name) || relative(tapeDir, resolve(tapeDir, name)).startsWith("..") || ![".mp4", ".gif"].includes(extname(name).toLowerCase())) throw new UserError(`Unsafe or unsupported VHS Output: ${name}`);
    }
    if (new Set(names.map(name => basename(name))).size !== names.length) throw new UserError("VHS Output filenames must be unique");
    io.err("Warning: VHS tapes execute terminal commands and may access the network; review demo.tape before rendering.");
    await runTool(io, "vhs", "vhs", [basename(tape)], tapeDir);
    for (const name of names) {
      const from = resolve(tapeDir, name), target = join(out, basename(name));
      if (!existsSync(from)) throw new UserError(`VHS did not produce ${name}`);
      if (extname(name).toLowerCase() === ".mp4") {
        await encodeVideo(from, target, io, { voiceover: existsSync(voice) ? voice : undefined });
      } else {
        if (existsSync(voice)) throw new UserError("VHS GIF output cannot carry voiceover; use MP4");
        copyFileSync(from, target);
      }
      const info = await probeMedia(target, io);
      outputs.push({ file: `out/${basename(name)}`, ...info });
      mkdirSync(frameDir, { recursive: true });
      const prefix = basename(name, extname(name));
      const frames = [1, 2, 3].map(i => join(frameDir, `${prefix}-${i}.png`));
      await extractFrames(target, frames, info.seconds, io);
      for (const frame of frames) outputs.push({ file: `out/frames/${basename(frame)}`, bytes: statSync(frame).size });
    }
    return outputs;
  }
  if (!Array.isArray(meta.aspects) || !meta.aspects.length || meta.aspects.some(a => typeof a !== "string" || !(a in sizes)) || new Set(meta.aspects).size !== meta.aspects.length) {
    throw new UserError("Video asset.yml aspects must list distinct values from 9:16, 1:1 and 16:9");
  }
  if (!existsSync(hyperframes)) throw new UserError("HyperFrames is missing; run bstudio doctor; install: npm install (HyperFrames is an optional dependency)");
  const useFilter = meta.captions?.burn ? await hasSubtitleFilter(io) : false;
  for (const aspect of meta.aspects as string[]) {
    const original = join(source, aspect), label = aspect.replace(":", "x");
    if (!existsSync(join(original, "index.html"))) throw new UserError(`Missing HyperFrames composition: source/${aspect}/index.html`);
    const raw = join(out, `.${label}-hyperframes.mp4`), target = join(out, `${label}.mp4`);
    let temp: string | undefined;
    try {
      let project = original;
      if (meta.captions?.burn && !useFilter) {
        temp = mkdtempSync(join(tmpdir(), "bstudio-caption-"));
        project = join(temp, "project");
        cpSync(original, project, { recursive: true });
        const index = join(project, "index.html"), html = readFileSync(index, "utf8");
        if (!/<\/body\s*>/i.test(html)) throw new UserError(`Composition source/${aspect}/index.html needs a closing body tag for captions`);
        writeFileSync(index, html.replace(/<\/body\s*>/i, `${captionScript(readFileSync(caption, "utf8"), aspect, config)}</body>`));
      }
      await runTool(io, "hyperframes", hyperframes, ["render", project, "--output", raw, "--format", "mp4", "--workers", "1", "--refuse-outside-files"]);
      await encodeVideo(raw, target, io, { captions: useFilter ? caption : undefined, voiceover: existsSync(voice) ? voice : undefined });
    } finally {
      rmSync(raw, { force: true });
      if (temp) rmSync(temp, { recursive: true, force: true });
    }
    const info = await probeMedia(target, io), [width, height] = sizes[aspect];
    if (info.width !== width || info.height !== height) throw new UserError(`${aspect} composition rendered ${info.width}x${info.height}, expected ${width}x${height}`);
    outputs.push({ file: `out/${label}.mp4`, aspect, ...info });
    mkdirSync(frameDir, { recursive: true });
    const frames = [1, 2, 3].map(i => join(frameDir, `${label}-${i}.png`));
    await extractFrames(target, frames, info.seconds, io);
    for (const frame of frames) outputs.push({ file: `out/frames/${basename(frame)}`, aspect, bytes: statSync(frame).size });
  }
  return outputs;
}
