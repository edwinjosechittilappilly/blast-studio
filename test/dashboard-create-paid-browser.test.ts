import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startDashboard } from '../src/dashboard/server.ts';
import { fakeIO, tempStudio } from './helpers.ts';

test('paid pipeline requires confirmation and displays budget impact before starting', async t => {
  const root = tempStudio({ 'projects/acme/project.yml': 'name: Acme\ncreatedAt: 2025-01-01\n' });
  const server = await startDashboard(fakeIO({ cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: join(root, 'studio.yml') } }), { port: 0 });
  t.after(() => server.server.close());
  const browser = await chromium.launch({ headless: true }); t.after(() => browser.close());
  const page = await browser.newPage(); let submitted: unknown;
  await page.route('**/api/operations', async route => { const response = await route.fetch(); const operations = await response.json(); operations.new.requiresTTY = false; await route.fulfill({ json: operations }); });
  await page.route('**/api/budget', route => route.fulfill({ json: { cap: 20, perProject: 5, mtd: 2 } }));
  await page.route('**/api/jobs', async route => { if (route.request().method() !== 'POST') return route.continue(); submitted = route.request().postDataJSON(); await route.fulfill({ status: 202, json: { id: 'test-job' } }); });
  await page.route('**/api/jobs/test-job', route => route.fulfill({ json: { state: 'running' } }));
  await page.route('**/api/jobs/test-job/log?*', route => route.fulfill({ json: { log: 'Running' } }));
  await page.goto(`${server.url}#/p/acme/new`);
  await page.getByRole('textbox', { name: 'Campaign ID' }).fill('launch'); await page.getByRole('textbox', { name: 'Idea' }).fill('Launch');
  await page.getByRole('combobox', { name: 'Creation mode' }).selectOption('new'); await page.getByRole('button', { name: 'Create campaign' }).click();
  await page.getByText('Monthly spend: $2.00 of $20.00. Per-campaign limit: $5.00.').waitFor();
  assert.equal(submitted, undefined);
  await page.getByRole('button', { name: 'Run pipeline' }).click();
  await page.getByText('Running', { exact: true }).waitFor();
  assert.deepEqual(submitted, { op: 'new', campaign: 'acme/launch', args: { idea: 'Launch' } });
});
