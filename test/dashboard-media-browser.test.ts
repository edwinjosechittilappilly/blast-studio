import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startDashboard } from '../src/dashboard/server.ts';
import { fakeIO, tempStudio } from './helpers.ts';

test('media actions remain visible in both themes and viewer controls work', async t => {
  const root = tempStudio({
    'projects/launch/brief.md': '# Launch',
    'projects/launch/plan.yml': '- platform: linkedin\n  type: image\n  angle: launch\n  hooks: [One, Two, Three]\n  assets: [{id: poster, kind: poster, brief: Launch}]\n',
    'projects/launch/posts/linkedin.md': '---\nplatform: linkedin\nevidence: []\nmedia:\n  - asset: poster\n    file: assets/poster/out/image.svg\n    kind: image\n    alt: A colourful poster with a detailed description of the launch, including its background, heading, product details, and a link to the project for people who want to learn more about the release and the features it offers.\n  - asset: poster\n    file: assets/poster/out/video.webm\n    kind: video\n    alt: A colourful video.\n---\nLaunch',
    'projects/launch/assets/poster/asset.yml': 'id: poster\nkind: poster\noutputs: [{file: out/image.svg, bytes: 100}]\n',
    'projects/launch/assets/poster/out/image.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="red"/></svg>',
  });
  // One 1200 × 1200 VP9 frame, so the browser exercises the video height limit.
  writeFileSync(join(root, 'projects/launch/assets/poster/out/video.webm'), Buffer.from('GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAKVEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHWTbuMU6uEElTDZ1OsggE0TbuMU6uEHFO7a1OsggJ/7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxMYXZmNjMuMS4xMDJXQYxMYXZmNjMuMS4xMDJEiYhARAAAAAAAABZUrmvZrgEAAAAAAABQ14EBc8WIkIvw/nOMCuOcgQAitZyDdW5kiIEAhoVWX1ZQOYOBASPjg4QCYloA4JKwggSwuoIEsJqBAlWwhFW5gQFV7oEA7AEAAAAAAAACAAASVMNn/nNzn2PAgGfImUWjh0VOQ09ERVJEh4xMYXZmNjMuMS4xMDJzc9ljwItjxYiQi/D+c4wK42fIpEWjh0VOQ09ERVJEh5dMYXZjNjMuMS4xMDIgbGlidnB4LXZwOWfIoUWjiERVUkFUSU9ORIeTMDA6MDA6MDAuMDQwMDAwMDAwAB9DtnVAwueBAKNAvIEAAICCSYNCAErwSvYAOCQcGEoYAEBh9j/jsqR4H9HX0jsL/w4AAAAAHhI9a1NMbIBMoKpUpgr1cqUyWCuVSZLBXqpUpgr1IAAAACQSPWtTTGyASIglgqlK9VKV6mUrlMlXKYKqUwVUlgqpLBVKVAAAAAAkEj1rU0xsgEiIJYKpSvVSleplK5TJVymCqlMFVJYKqSwVSlQAEj1rU0xsgEiIJYKpSvVSleplK5TJVymCqlMFVJYKqSwVSlQAHFO7a5G7j7OBALeK94EB8YIBt/CBAw==', 'base64'));
  const io = fakeIO({ cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: join(root, 'studio.yml') } });
  const started = await startDashboard(io, { port: 0 }); t.after(() => started.server.close());
  const browser = await chromium.launch({ headless: true }); t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(started.url); await page.getByRole('link', { name: 'launch', exact: true }).click();
  await page.getByRole('tab', { name: /linkedin/ }).click();
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    const icon = page.locator('cds-overflow-menu svg[slot="icon"]').first();
    await icon.waitFor({ state: 'attached' });
    const ratio = await icon.evaluate(node => {
      const color = (value: string) => value.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(x => { x /= 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
      const luminance = (value: string) => { const [r, g, b] = color(value); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const foreground = luminance(getComputedStyle(node).fill);
      const tile = node.closest('cds-tile')!;
      const background = luminance(getComputedStyle(tile).backgroundColor);
      return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    });
    assert.ok(ratio >= 3, `${theme} overflow contrast ${ratio}`);
  }
  await page.getByRole('button', { name: 'View image.svg' }).click();
  const zoom = page.getByRole('button', { name: 'View at 100%' });
  await zoom.waitFor(); assert.equal(await zoom.getAttribute('aria-pressed'), 'false');
  await zoom.hover();
  const tooltip = page.locator('.viewer-zoom').locator('cds-tooltip-content[open]').last();
  await tooltip.waitFor({ state: 'visible' });
  const bounds = await tooltip.boundingBox(), body = await page.locator('cds-modal-body').boundingBox();
  assert.ok(bounds && body && bounds.x >= body.x && bounds.y >= body.y && bounds.x + bounds.width <= body.x + body.width && bounds.y + bounds.height <= body.y + body.height, 'zoom tooltip must fit within the visible modal body');
  const imageCaption = await page.locator('.viewer-caption').boundingBox();
  assert.ok(imageCaption && body && imageCaption.y + imageCaption.height <= body.y + body.height - 32, 'image caption must clear the modal fade');
  await zoom.click(); assert.equal(await zoom.getAttribute('aria-pressed'), 'true');
  await page.keyboard.press('Escape');
  await page.locator('cds-modal').waitFor({ state: 'detached' });
  assert.equal(await page.getByRole('button', { name: 'View image.svg' }).evaluate(node => node === document.activeElement), true);
  await page.getByRole('button', { name: 'View image.svg' }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('cds-modal').waitFor({ state: 'detached' });
  assert.equal(await page.getByRole('button', { name: 'View image.svg' }).evaluate(node => node === document.activeElement), true);
  await page.getByRole('button', { name: 'View video.webm' }).click();
  await page.waitForFunction(() => document.querySelector('video')!.readyState >= 1);
  const videoCaption = await page.locator('.viewer-caption').boundingBox(), videoBody = await page.locator('cds-modal-body').boundingBox();
  assert.ok(videoCaption && videoBody && videoCaption.y + videoCaption.height <= videoBody.y + videoBody.height - 32, 'video caption must clear the modal fade');
});
