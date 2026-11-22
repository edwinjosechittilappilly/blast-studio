import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startDashboard } from '../src/dashboard/server.ts';
import { fakeIO, tempStudio } from './helpers.ts';

async function dashboard(t: TestContext) {
  const root = tempStudio({});
  const io = fakeIO({ cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: join(root, 'studio.yml') } });
  const started = await startDashboard(io, { port: 0 }); t.after(() => started.server.close());
  const browser = await chromium.launch({ headless: true }); t.after(() => browser.close());
  return { page: await browser.newPage(), url: started.url };
}

test('settings reject a negative cap and clear the previous success', async t => {
  const { page, url } = await dashboard(t);
  await page.goto(url); await page.getByRole('link', { name: 'Budget & providers' }).click();
  const monthly = page.getByLabel('Monthly cap (USD)');
  await monthly.fill('10'); await page.getByRole('button', { name: 'Save settings' }).click();
  await page.getByText('Settings saved.').waitFor();
  await monthly.fill('-5');
  await page.waitForFunction(() => (document.querySelector('cds-number-input') as HTMLElement & { invalid: boolean })?.invalid);
  assert.equal(await page.getByText('Settings saved.').count(), 0);
  await page.getByRole('button', { name: 'Save settings' }).click();
  assert.equal(await page.getByText('Settings saved.').count(), 0);
});

test('health check renders doctor job results and a copyable fix', async t => {
  const { page, url } = await dashboard(t);
  await page.route('**/api/jobs', route => route.request().method() === 'POST' ? route.fulfill({ status: 202, json: { id: 'health-job', state: 'succeeded' } }) : route.continue());
  await page.route('**/api/jobs/health-job/log?*', route => route.fulfill({ json: { log: 'Node: v22.18.0\nPlaywright Chromium: missing (required); install: npx playwright install chromium\n' } }));
  await page.route('**/api/jobs/health-job', route => route.fulfill({ json: { id: 'health-job', state: 'failed' } }));
  await page.goto(url); await page.getByRole('link', { name: 'Health check' }).click();
  await page.getByRole('button', { name: 'Run health check' }).click();
  await page.getByRole('cell', { name: 'Playwright Chromium', exact: true }).waitFor();
  assert.equal(await page.getByText('Attention', { exact: true }).count(), 1);
  assert.equal(await page.getByRole('button', { name: 'Copy fix' }).count(), 1);
  assert.equal(await page.getByRole('button', { name: 'Run again' }).count(), 1);
});
