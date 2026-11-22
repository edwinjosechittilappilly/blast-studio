import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';
import { realIO } from '../src/cli.ts';
import { closeBrowser, renderHtml } from '../src/render/stills.ts';
import { fillTemplate } from '../src/render/template.ts';
import { renderVideo } from '../src/render/video.ts';
import { loadConfig } from '../src/config.ts';
import { fakeIO, tempStudio } from './helpers.ts';

const goldenDir = fileURLToPath(new URL(`./goldens/${process.platform}/`, import.meta.url));
const fixtures = fileURLToPath(new URL('./fixtures/video/', import.meta.url));
const update = process.env.UPDATE_GOLDENS === '1';
const dir = mkdtempSync(join(tmpdir(), 'bstudio-goldens-'));
after(async () => { await closeBrowser(); rmSync(dir, { recursive: true, force: true }); });

function compare(name: string, actual: string): void {
  const golden = join(goldenDir, `${name}.png`);
  if (update) {
    mkdirSync(goldenDir, { recursive: true });
    copyFileSync(actual, golden);
    return;
  }
  assert.ok(existsSync(golden), `Missing golden ${golden}; run make goldens`);
  const result = spawnSync('ffmpeg', ['-i', golden, '-i', actual, '-lavfi', 'ssim', '-f', 'null', '-'], { encoding: 'utf8' });
  assert.equal(result.status, 0, `ffmpeg SSIM failed: ${result.stderr}`);
  const match = result.stderr.match(/All:([\d.]+)/);
  assert.ok(match, `ffmpeg did not report SSIM: ${result.stderr}`);
  const score = Number(match[1]);
  console.log(`${name} SSIM: ${score}`);
  assert.ok(score >= 0.98, `${name} SSIM ${score} is below 0.98`);
}

const skip = !update && !existsSync(goldenDir) ? `No perceptual goldens for ${process.platform}; run make goldens on this OS` : false;

test('bundled still templates match perceptual goldens', { skip, timeout: 60_000 }, async () => {
  for (const [name, data] of [
    ['card', { title: 'A clearer message', subtitle: 'Thoughtful content for everyone' }],
    ['carousel-content', { title: 'Make ideas visible', body: 'Build, review and share with confidence.' }],
  ] as const) {
    const html = fillTemplate(name, data, { name: 'Studio' });
    const actual = join(dir, `${name}.png`);
    await renderHtml({ html, width: 800, height: 1000, out: actual });
    compare(name, actual);
  }
});

test('HyperFrames video start, middle and end match perceptual goldens', { skip, timeout: 180_000 }, async () => {
  const asset = join(dir, 'video');
  mkdirSync(join(asset, 'source'), { recursive: true });
  cpSync(join(fixtures, '9:16'), join(asset, 'source/9:16'), { recursive: true });
  copyFileSync(join(fixtures, 'captions.vtt'), join(asset, 'source/captions.vtt'));
  writeFileSync(join(asset, 'asset.yml'), "kind: video\naspects: ['9:16']\ncaptions:\n  burn: true\n");
  const io = realIO(), studio = tempStudio();
  let outputs;
  try {
    const config = loadConfig(fakeIO({ cwd: studio, env: { BSTUDIO_HOME: studio, BSTUDIO_CONFIG: 'studio.yml' } }));
    outputs = await renderVideo(asset, config, io);
  } finally { rmSync(studio, { recursive: true, force: true }); }
  const video = outputs.find(output => output.file === 'out/9x16.mp4');
  assert.ok(video?.seconds);
  for (const [name, at] of [['start', 0], ['middle', video.seconds / 2], ['end', Math.max(0, video.seconds - 0.1)]] as const) {
    const actual = join(dir, `video-${name}.png`);
    await io.run('ffmpeg', ['-y', '-ss', String(at), '-i', join(asset, video.file), '-frames:v', '1', '-update', '1', actual]);
    compare(`video-${name}`, actual);
  }
});
