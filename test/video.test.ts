import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { realIO } from "../src/cli.ts";
import { chromium } from "playwright";
import { renderVideo } from "../src/render/video.ts";
import type { StudioConfig } from "../src/types.ts";
import { fakeIO, tempStudio } from "./helpers.ts";

const fixtures = fileURLToPath(new URL("./fixtures/video/", import.meta.url));
const hf = fileURLToPath(new URL("../node_modules/.bin/hyperframes", import.meta.url));
const config = {} as StudioConfig;
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

// Slow: real Chromium, HyperFrames and FFmpeg; no paid APIs.
test("renders a two-second portrait composition and extracts review frames", { timeout: 60_000, skip: missingVideo.length ? `missing binaries: ${missingVideo.join(", ")}` : false }, async () => {
  const dir = tempStudio();
  try {
    mkdirSync(join(dir, "source"));
    cpSync(join(fixtures, "9:16"), join(dir, "source/9:16"), { recursive: true });
    copyFileSync(join(fixtures, "captions.vtt"), join(dir, "source/captions.vtt"));
    writeFileSync(join(dir, "asset.yml"), "kind: video\naspects: ['9:16']\ncaptions:\n  burn: true\n");
    const io = realIO();
    const outputs = await renderVideo(dir, config, io);
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
      const frames = [1, 3].map(i => readFileSync(join(dir, `out/frames/9x16-${i}.png`)).toString("base64"));
      const difference = await page.evaluate(async images => {
        const pixels = await Promise.all(images.map(async image => {
          const img = new Image(); img.src = `data:image/png;base64,${image}`; await img.decode();
          const canvas = document.createElement("canvas"); canvas.width = img.width; canvas.height = img.height;
          const ctx = canvas.getContext("2d")!; ctx.drawImage(img, 0, 0);
          return ctx.getImageData(0, Math.floor(img.height * .6), img.width, Math.floor(img.height * .3)).data;
        }));
        let changed = 0;
        for (let i = 0; i < pixels[0].length; i += 4) {
          if (Math.abs(pixels[0][i] - pixels[1][i]) + Math.abs(pixels[0][i + 1] - pixels[1][i + 1]) + Math.abs(pixels[0][i + 2] - pixels[1][i + 2]) > 80) changed++;
        }
        return changed;
      }, frames);
      assert.ok(difference > 500, `expected visible captions in first frame; ${difference} pixels changed`);
    } finally { await browser.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Slow: VHS drives a real terminal and browser.
test("renders a VHS GIF and review frames", { timeout: 60_000, skip: missingVhs.length ? `missing binaries: ${missingVhs.join(", ")}` : false }, async () => {
  const dir = tempStudio();
  try {
    mkdirSync(join(dir, "source"));
    copyFileSync(join(fixtures, "demo.tape"), join(dir, "source/demo.tape"));
    writeFileSync(join(dir, "asset.yml"), "kind: terminal-demo\n");
    const outputs = await renderVideo(dir, config, realIO());
    assert.ok(outputs.some(o => o.file === "out/demo.gif" && o.bytes > 0));
    for (const i of [1, 2, 3]) assert.ok(existsSync(join(dir, `out/frames/demo-${i}.png`)));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

