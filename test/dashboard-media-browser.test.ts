import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startDashboard } from '../src/dashboard/server.ts';
import { fakeIO, tempStudio } from './helpers.ts';

test('media actions remain visible in both themes and viewer controls work', async t => {
  const root = tempStudio({
    'projects/launch/brief.md': '# Launch',
    'projects/launch/plan.yml': '- platform: linkedin\n  type: image\n  angle: launch\n  hooks: [One, Two, Three]\n  assets: [{id: poster, kind: poster, brief: Launch}]\n',
    'projects/launch/posts/linkedin.md': '---\nplatform: linkedin\nevidence: []\nmedia:\n  - asset: poster\n    file: assets/poster/out/image.svg\n    kind: image\n    alt: A colourful poster.\n---\nLaunch',
    'projects/launch/assets/poster/asset.yml': 'id: poster\nkind: poster\noutputs: [{file: out/image.svg, bytes: 100}]\n',
    'projects/launch/assets/poster/out/image.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="red"/></svg>',
  });
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
  await zoom.click(); assert.equal(await zoom.getAttribute('aria-pressed'), 'true');
  await page.keyboard.press('Escape');
  await page.locator('cds-modal').waitFor({ state: 'detached' });
  assert.equal(await page.getByRole('button', { name: 'View image.svg' }).evaluate(node => node === document.activeElement), true);
  await page.getByRole('button', { name: 'View image.svg' }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('cds-modal').waitFor({ state: 'detached' });
  assert.equal(await page.getByRole('button', { name: 'View image.svg' }).evaluate(node => node === document.activeElement), true);
});
