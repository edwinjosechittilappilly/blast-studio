import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { after } from "node:test";
import { realIO } from "../src/cli.ts";
import { chromium } from "playwright";
import { renderVideo } from "../src/render/video.ts";
import { encodeVideo, extractFrames, probeMedia } from "../src/render/ffmpeg.ts";
import { loadConfig } from "../src/config.ts";
import { fakeIO, tempStudio } from "./helpers.ts";

const fixtures = fileURLToPath(new URL("./fixtures/video/", import.meta.url));
const hf = fileURLToPath(new URL("../node_modules/.bin/hyperframes", import.meta.url));
// Render tools run sandboxed with the studio root hidden, so tests need a real config.
const studio = tempStudio();
const config = loadConfig(fakeIO({ cwd: studio, env: { BSTUDIO_HOME: studio, BSTUDIO_CONFIG: "studio.yml" } }));
after(() => rmSync(studio, { recursive: true, force: true }));
const available = (cmd: string) => spawnSync("which", [cmd]).status === 0;
const mediaMissing = ["ffmpeg", "ffprobe"].filter(c => !available(c));
const missingVideo = [...mediaMissing, ...(!existsSync(hf) ? ["hyperframes"] : [])];
const missingVhs = [...mediaMissing, ...["vhs", "ttyd"].filter(c => !available(c))];

test("video rejects invalid aspects and missing requested captions", async () => {
  const dir = tempStudio();
  try {
    mkdirSync(join(dir, "source"));
    writeFileSync(join(dir, "asset.yml"), "kind: video\naspects: ['4:3']\n");
    await assert.rejects(renderVideo(dir, config, fakeIO({ cwd: dir })), /aspects/);
    writeFileSync(join(dir, "asset.yml"), "kind: video\naspects: ['9:16']\ncaptions:\n  burn: true\n");
    await assert.rejects(renderVideo(dir, config, fakeIO({ cwd: dir })), /captions.vtt is missing/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("VHS warns that tapes execute commands and rejects unsafe output paths", async () => {
  const dir = tempStudio();
  try {
    mkdirSync(join(dir, "source"));
    writeFileSync(join(dir, "asset.yml"), "kind: terminal-demo\n");
    writeFileSync(join(dir, "source/demo.tape"), 'Output "../outside.gif"\n');
    await assert.rejects(renderVideo(dir, config, fakeIO({ cwd: dir })), /Unsafe/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("voiceover is muxed into a video", { skip: mediaMissing.length ? `missing binaries: ${mediaMissing.join(", ")}` : false }, async () => {
  const dir = tempStudio(), io = realIO();
  try {
    const video = join(dir, "input.mp4"), voice = join(dir, "voice.wav"), output = join(dir, "output.mp4");
    await io.run("ffmpeg", ["-y", "-f", "lavfi", "-i", "color=c=black:s=64x64:d=1", "-c:v", "libx264", video]);
    await io.run("ffmpeg", ["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", voice]);
    await encodeVideo(video, output, io, { voiceover: voice });
    const probe = JSON.parse(await io.run("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_name", "-of", "json", output]));
    assert.equal(probe.streams[0].codec_name, "aac");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("extracts review frames from a GIF whose last frame has a long delay", { skip: mediaMissing.length ? `missing binaries: ${mediaMissing.join(", ")}` : false }, async () => {
  const dir = tempStudio(), io = realIO(), input = join(dir, "single.gif");
  try {
    await io.run("ffmpeg", ["-y", "-f", "lavfi", "-i", "color=black:s=16x16:r=1", "-frames:v", "1", "-final_delay", "400", input]);
    const info = await probeMedia(input, io), frames = [1, 2, 3].map(i => join(dir, `${i}.png`));
    await extractFrames(input, frames, info.seconds, io);
    for (const frame of frames) assert.ok(existsSync(frame), `${frame} was not extracted`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Slow: real Chromium, HyperFrames and FFmpeg; no paid APIs.
for (const mode of ["off", "on"] as const) test(`renders a two-second portrait composition and extracts review frames (sandbox ${mode})`, { timeout: 60_000, skip: missingVideo.length ? `missing binaries: ${missingVideo.join(", ")}` : false }, async t => {
  const dir = tempStudio();
  try {
    mkdirSync(join(dir, "source"));
    cpSync(join(fixtures, "9:16"), join(dir, "source/9:16"), { recursive: true });
    copyFileSync(join(fixtures, "captions.vtt"), join(dir, "source/captions.vtt"));
    writeFileSync(join(dir, "asset.yml"), "kind: video\naspects: ['9:16']\ncaptions:\n  burn: true\n");
    const io = realIO();
    const settings = mode === "off" ? config : { ...config, agent: { ...config.agent, sandbox: "on" as const } };
    let outputs;
    try { outputs = await renderVideo(dir, settings, io); }
    catch (error) {
      if (/hyperframes failed[\s\S]*low disk space/i.test(String(error))) { t.skip("HyperFrames reports low disk space"); return; }
      throw error;
    }
    const video = outputs.find(o => o.file === "out/9x16.mp4");
    assert.ok(video);
    assert.equal(video.width, 1080); assert.equal(video.height, 1920);
    assert.ok(video.seconds && Math.abs(video.seconds - 2) < 0.15);
    const probe = JSON.parse(await io.run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,pix_fmt", "-of", "json", join(dir, video.file)]));
    assert.equal(probe.streams[0].codec_name, "h264"); assert.equal(probe.streams[0].pix_fmt, "yuv420p");
    for (const i of [1, 2, 3]) assert.ok(existsSync(join(dir, `out/frames/9x16-${i}.png`)));
    assert.equal(readFileSync(join(dir, "out/captions.vtt"), "utf8"), readFileSync(join(fixtures, "captions.vtt"), "utf8"));
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const captionFrame = join(dir, "caption-frame.png");
      await io.run("ffmpeg", ["-y", "-ss", "0.75", "-i", join(dir, video.file), "-frames:v", "1", "-update", "1", captionFrame]);
      const frames = [captionFrame, join(dir, "out/frames/9x16-3.png")].map(file => readFileSync(file).toString("base64"));
      const difference = await page.evaluate(async images => {
        const pixels = await Promise.all(images.map(async image => {
          const img = new Image(); img.src = `data:image/png;base64,${image}`; await img.decode();
          const canvas = document.createElement("canvas"); canvas.width = img.width; canvas.height = img.height;
          const ctx = canvas.getContext("2d")!; ctx.drawImage(img, 0, 0);
          return ctx.getImageData(0, Math.floor(img.height * .6), img.width, Math.ceil(img.height * .4)).data;
        }));
        let changed = 0;
        for (let i = 0; i < pixels[0].length; i += 4) {
          if (Math.abs(pixels[0][i] - pixels[1][i]) + Math.abs(pixels[0][i + 1] - pixels[1][i + 1]) + Math.abs(pixels[0][i + 2] - pixels[1][i + 2]) > 80) changed++;
        }
        return changed;
      }, frames);
      assert.ok(difference > 500, `expected visible captions inside cue; ${difference} pixels changed`);
    } finally { await browser.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Slow: VHS drives a real terminal and browser.
for (const mode of ["off", "on"] as const) test(`renders a VHS GIF and review frames (sandbox ${mode})`, { timeout: 60_000, skip: missingVhs.length ? `missing binaries: ${missingVhs.join(", ")}` : false }, async () => {
  const dir = tempStudio();
  try {
    mkdirSync(join(dir, "source"));
    copyFileSync(join(fixtures, "demo.tape"), join(dir, "source/demo.tape"));
    writeFileSync(join(dir, "asset.yml"), "kind: terminal-demo\n");
    const settings = mode === "off" ? config : { ...config, agent: { ...config.agent, sandbox: "on" as const } };
    const outputs = await renderVideo(dir, settings, realIO());
    assert.ok(outputs.some(o => o.file === "out/demo.gif" && o.bytes > 0));
    for (const i of [1, 2, 3]) assert.ok(existsSync(join(dir, `out/frames/demo-${i}.png`)));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

