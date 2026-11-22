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

for (const initiallyEntered of [false, true]) {
  test(`settings save only confirmed credential snapshot (initial key: ${initiallyEntered})`, async t => {
    const { page, url } = await dashboard(t);
    const budgetGate = Promise.withResolvers<void>(), started = Promise.withResolvers<void>();
    t.after(() => budgetGate.resolve());
    const writes: unknown[] = [];
    await page.route('**/api/secrets/status', route => route.fulfill({ json: { GEMINI_API_KEY: { set: false } } }));
    await page.route('**/api/secrets', route => { writes.push(route.request().postDataJSON()); return route.fulfill({ json: {} }); });
    await page.route('**/api/providers', route => route.fulfill({ json: {} }));
    await page.route('**/api/budget', async route => {
      if (route.request().method() !== 'PUT') return route.continue();
      started.resolve(); await budgetGate.promise; await route.fulfill({ json: {} });
    });
    await page.goto(url); await page.getByRole('link', { name: 'Budget & providers' }).click();
    await page.getByText('Not set', { exact: true }).waitFor();
    const key = page.getByLabel('Gemini API key');
    if (initiallyEntered) await key.fill('placeholder-before');
    await page.getByRole('button', { name: 'Save settings' }).click();
    if (initiallyEntered) await page.getByRole('button', { name: 'Save keys', exact: true }).click();
    await started.promise;
    await key.fill('placeholder-after');
    budgetGate.resolve();
    await page.getByText('Settings saved.').waitFor();
    assert.deepEqual(writes, initiallyEntered ? [{ key: 'GEMINI_API_KEY', value: 'placeholder-before' }] : []);
    assert.equal(await key.inputValue(), 'placeholder-after');
  });
}

test('job polling retries without losing the active job or enabling another run', async t => {
  const { page, url } = await dashboard(t);
  const retryGate = Promise.withResolvers<void>(), retrying = Promise.withResolvers<void>();
  let polls = 0;
  t.after(() => retryGate.resolve());
  await page.route('**/api/jobs', route => route.request().method() === 'POST' ? route.fulfill({ status: 202, json: { id: 'health-job', state: 'running' } }) : route.continue());
  await page.route('**/api/jobs/health-job/log?*', route => route.fulfill({ json: { log: '' } }));
  await page.route('**/api/jobs/health-job', async route => {
    if (++polls === 1) return route.fulfill({ status: 503, json: { error: 'Unavailable' } });
    retrying.resolve(); await retryGate.promise;
    await route.fulfill({ json: { id: 'health-job', state: 'succeeded' } });
  });
  await page.goto(url); await page.getByRole('link', { name: 'Health check' }).click();
  await page.getByRole('button', { name: 'Run health check' }).click();
  await page.getByText('Unable to refresh job status. Retrying.').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Cancel job' }).isVisible(), true);
  assert.equal(await page.getByRole('button', { name: 'Run health check' }).evaluate(node => (node as HTMLButtonElement).disabled), true);
  await retrying.promise; retryGate.resolve();
  await page.getByRole('button', { name: 'Run again' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Cancel job' }).isVisible(), false);
});

for (const action of ['check', 'verify'] as const) {
  test(`source ${action} blocks other source actions until completion`, async t => {
    const { page, url } = await dashboard(t);
    const jobGate = Promise.withResolvers<void>(), started = Promise.withResolvers<void>();
    t.after(() => jobGate.resolve());
    const operations: string[] = [];
    await page.route('**/api/sources', route => route.fulfill({ json: { lastCheck: 'today', report: '## source-1: changed\nTitle: Example source\n' } }));
    await page.route('**/api/jobs', async route => {
      if (route.request().method() !== 'POST') return route.continue();
      operations.push(route.request().postDataJSON().op); started.resolve();
      await jobGate.promise; await route.fulfill({ status: 202, json: { id: 'source-job', state: 'succeeded' } });
    });
    await page.route('**/api/jobs/source-job/log?*', route => route.fulfill({ json: { log: '' } }));
    await page.route('**/api/jobs/source-job', route => route.fulfill({ json: { id: 'source-job', state: 'succeeded' } }));
    await page.goto(url); await page.getByRole('link', { name: 'Source updates' }).click();
    const check = page.getByRole('button', { name: 'Check sources' });
    const verify = page.getByRole('button', { name: 'Verify', exact: true });
    await verify.waitFor();
    if (action === 'check') await check.click();
    else { await verify.click(); await page.getByRole('button', { name: 'Verify source', exact: true }).click(); }
    await started.promise;
    assert.equal(await check.evaluate(node => (node as HTMLButtonElement).disabled), true);
    assert.equal(await verify.evaluate(node => (node as HTMLButtonElement).disabled), true);
    assert.deepEqual(operations, [`sources ${action}`]);
    jobGate.resolve();
    await page.waitForFunction(() => [...document.querySelectorAll('cds-button')].some(node => node.textContent?.trim() === 'Verify' && !(node as HTMLButtonElement).disabled));
    assert.equal(await check.evaluate(node => (node as HTMLButtonElement).disabled), false);
  });
}

test('source controls recover when a job fails to start', async t => {
  const { page, url } = await dashboard(t);
  await page.route('**/api/sources', route => route.fulfill({ json: { lastCheck: 'today', report: '## source-1: manual\n' } }));
  await page.route('**/api/jobs', route => route.request().method() === 'POST' ? route.fulfill({ status: 503, json: { error: 'Job unavailable' } }) : route.continue());
  await page.goto(url); await page.getByRole('link', { name: 'Source updates' }).click();
  const check = page.getByRole('button', { name: 'Check sources' });
  await page.getByRole('button', { name: 'Verify', exact: true }).waitFor();
  await check.click();
  await page.getByText('Job unavailable').waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('cds-button')].some(node => node.textContent?.trim() === 'Verify' && !(node as HTMLButtonElement).disabled));
  assert.equal(await check.evaluate(node => (node as HTMLButtonElement).disabled), false);
});
