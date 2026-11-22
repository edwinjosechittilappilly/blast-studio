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

for (const decision of ['Cancel', 'Save keys'] as const) {
  test(`settings save budget and providers when key confirmation is ${decision}`, async t => {
    const { page, url } = await dashboard(t);
    let budget: unknown, providers: unknown;
    const secrets: unknown[] = [];
    await page.route('**/api/secrets/status', route => route.fulfill({ json: { GEMINI_API_KEY: { set: false } } }));
    await page.route('**/api/secrets', route => { secrets.push(route.request().postDataJSON()); return route.fulfill({ json: {} }); });
    await page.route('**/api/budget', route => {
      if (route.request().method() !== 'PUT') return route.continue();
      budget = route.request().postDataJSON(); return route.fulfill({ json: {} });
    });
    await page.route('**/api/providers', route => { providers = route.request().postDataJSON(); return route.fulfill({ json: {} }); });
    await page.goto(url); await page.getByRole('link', { name: 'Budget & providers' }).click();
    await page.getByText('Not set', { exact: true }).waitFor();
    await page.getByLabel('Monthly cap (USD)').fill('12');
    await page.getByLabel('Gemini API key').fill('test-only-placeholder');
    await page.getByRole('button', { name: 'Save settings' }).click();
    await page.getByText('Save provider keys?', { exact: true }).waitFor();
    await page.getByRole('button', { name: decision, exact: true }).click();
    await page.getByText('Settings saved.').waitFor();
    assert.ok(budget && typeof budget === 'object' && 'monthlyUsd' in budget);
    assert.equal(budget.monthlyUsd, 12);
    assert.ok(providers);
    assert.equal(secrets.length, decision === 'Save keys' ? 1 : 0);
    if (decision === 'Cancel') await page.getByText('Keys not saved.').waitFor();
  });
}

test('settings still save when credential status is unavailable', async t => {
  const { page, url } = await dashboard(t);
  let secretWrites = 0;
  await page.route('**/api/secrets/status', route => route.fulfill({ status: 503, json: { error: 'Unavailable' } }));
  await page.route('**/api/secrets', route => { secretWrites++; return route.fulfill({ json: {} }); });
  await page.goto(url); await page.getByRole('link', { name: 'Budget & providers' }).click();
  await page.getByText(/Could not read credential presence/).waitFor();
  await page.getByLabel('Monthly cap (USD)').fill('12');
  await page.getByLabel('Gemini API key').fill('test-only-placeholder');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await page.getByText('Settings saved.').waitFor();
  await page.getByText(/Keys not saved\. Credential status is unavailable/).waitFor();
  assert.equal(secretWrites, 0);
});

test('sources without titles show their id only once', async t => {
  const { page, url } = await dashboard(t);
  await page.route('**/api/sources', route => route.fulfill({ json: { lastCheck: 'today', report: '## source-1: failed\nError: unavailable\n## source-2: changed\nTitle: Example source\n' } }));
  await page.goto(url); await page.getByRole('link', { name: 'Source updates' }).click();
  const untitled = page.getByRole('row', { name: /source-1/ });
  await untitled.waitFor();
  assert.equal(await untitled.getByText('source-1', { exact: true }).count(), 1);
  const titled = page.getByRole('row', { name: /Example source/ });
  assert.equal(await titled.getByText('source-2', { exact: true }).count(), 1);
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
