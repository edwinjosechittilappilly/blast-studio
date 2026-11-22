import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startDashboard } from '../src/dashboard/server.ts';
import { fakeIO, tempStudio } from './helpers.ts';

async function dashboard(t: TestContext) {
  const root = tempStudio({ 'projects/acme/project.yml': 'name: Acme\ncreatedAt: 2025-01-01\n' });
  const io = fakeIO({ cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: join(root, 'studio.yml') } });
  const server = await startDashboard(io, { port: 0 });
  t.after(() => server.server.close());
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  return { page: await browser.newPage(), url: server.url };
}

test('project creation validates its ID and submits all shared evidence as a job', async t => {
  const { page, url } = await dashboard(t);
  let submitted: unknown;
  await page.route('**/api/jobs', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    submitted = route.request().postDataJSON();
    await route.fulfill({ status: 202, json: { id: 'test-job', state: 'running' } });
  });
  await page.route('**/api/jobs/test-job', route => route.fulfill({ json: { id: 'test-job', state: 'running' } }));
  await page.route('**/api/jobs/test-job/log?*', route => route.fulfill({ json: { log: 'Collecting evidence' } }));
  await page.goto(`${url}#/projects/new`);
  await page.getByRole('textbox', { name: 'Project name / ID' }).fill('Invalid ID');
  await page.getByRole('button', { name: 'Create project' }).click();
  assert.equal(await page.locator('cds-text-input[invalid]').count(), 1);
  assert.equal(submitted, undefined);
  await page.getByRole('textbox', { name: 'Project name / ID' }).fill('acme-new');
  await page.getByRole('textbox', { name: 'Repository' }).fill('org/repo');
  await page.getByRole('textbox', { name: 'URLs' }).fill('https://example.com/a\nhttps://example.com/b');
  await page.getByRole('textbox', { name: 'Notes' }).fill('First note\nSecond note');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.getByText('Collecting evidence').waitFor();
  assert.deepEqual(submitted, { op: 'project new', args: { project: 'acme-new', repo: 'org/repo', url: ['https://example.com/a', 'https://example.com/b'], note: ['First note', 'Second note'] } });
  assert.equal(await page.getByRole('button', { name: 'Cancel job' }).isVisible(), true);
});

test('campaign brief submits its inputs and navigates on success', async t => {
  const { page, url } = await dashboard(t);
  let submitted: unknown;
  await page.route('**/api/jobs', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    submitted = route.request().postDataJSON();
    await route.fulfill({ status: 202, json: { id: 'test-job', state: 'running' } });
  });
  await page.route('**/api/jobs/test-job', route => route.fulfill({ json: { id: 'test-job', state: 'succeeded' } }));
  await page.route('**/api/jobs/test-job/log?*', route => route.fulfill({ json: { log: 'Done' } }));
  await page.goto(`${url}#/p/acme/new`);
  await page.getByRole('textbox', { name: 'Campaign ID' }).fill('launch');
  await page.getByRole('textbox', { name: 'Idea' }).fill('Launch idea');
  await page.getByText('Evidence sources (optional)').click();
  await page.getByRole('textbox', { name: 'Notes' }).fill('Background');
  await page.getByRole('textbox', { name: 'URL', exact: true }).fill('https://example.com');
  await page.getByRole('textbox', { name: 'Pull request number' }).fill('123');
  await page.getByText('Replace an existing brief (--force)', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Commit SHA' }).fill('abcd1234');
  await page.getByRole('textbox', { name: 'Repository' }).fill('org/repo');
  await page.getByRole('textbox', { name: 'Market Blaster brief path' }).fill('/tmp/brief.md');
  await page.getByRole('button', { name: 'Create campaign' }).click();
  await page.waitForURL('**/#/p/acme/launch/overview');
  assert.deepEqual(submitted, { op: 'brief', campaign: 'acme/launch', args: { idea: 'Launch idea', note: 'Background', url: 'https://example.com', pr: '123', commit: 'abcd1234', repo: 'org/repo', mbBrief: '/tmp/brief.md', force: true } });
});

test('interactive pipeline shows a copyable command rather than submitting a job', async t => {
  const { page, url } = await dashboard(t);
  await page.route('**/api/operations', async route => {
    const response = await route.fetch();
    const operations = await response.json(); operations.new.requiresTTY = true;
    await route.fulfill({ json: operations });
  });
  let submitted = false;
  await page.route('**/api/jobs', async route => { if (route.request().method() === 'POST') submitted = true; await route.continue(); });
  await page.goto(`${url}#/p/acme/new`);
  await page.getByRole('combobox', { name: 'Creation mode' }).selectOption('new');
  assert.equal(await page.getByRole('button', { name: 'Copy command' }).isDisabled(), true);
  assert.equal(await page.locator('#project code').count(), 0);
  await page.getByRole('textbox', { name: 'Campaign ID' }).fill('launch');
  await page.getByRole('textbox', { name: 'Idea' }).fill('Hello world');
  await page.getByText('Run this operation in a terminal').waitFor();
  assert.match(await page.locator('#project code').textContent() ?? '', /bstudio new acme\/launch '--idea=Hello world'/);
  assert.equal(await page.getByRole('button', { name: 'Copy command' }).isEnabled(), true);
  await page.getByRole('button', { name: 'Copy command' }).click();
  assert.equal(submitted, false);
});

test('creation marks known evidence failures on their fields', async t => {
  const { page, url } = await dashboard(t);
  let failure = 'fetch failed';
  await page.route('**/api/jobs', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    await route.fulfill({ status: 202, json: { id: 'test-job' } });
  });
  await page.route('**/api/jobs/test-job', route => route.fulfill({ json: { state: 'failed' } }));
  await page.route('**/api/jobs/test-job/log?*', route => route.fulfill({ json: { log: failure } }));
  await page.goto(`${url}#/p/acme/new`);
  await page.getByRole('textbox', { name: 'Campaign ID' }).fill('launch');
  await page.getByText('Evidence sources (optional)').click();
  await page.getByRole('textbox', { name: 'URL', exact: true }).fill('https://example.com');
  await page.getByRole('button', { name: 'Create campaign' }).click();
  await page.locator('cds-text-input[invalid-text^="URL unreachable"]').waitFor();
  await page.getByRole('textbox', { name: 'URL', exact: true }).fill('');
  await page.getByRole('textbox', { name: 'Repository' }).fill('org/missing');
  failure = 'gh exited with 1: GraphQL: Could not resolve to a Repository with the name org/missing.';
  await page.getByRole('button', { name: 'Create campaign' }).click();
  await page.locator('cds-text-input[invalid-text^="Repository not found"]').waitFor();
  await page.getByRole('textbox', { name: 'Pull request number' }).fill('123');
  failure = 'no pull requests found for branch';
  await page.getByRole('button', { name: 'Create campaign' }).click();
  await page.locator('cds-text-input[invalid-text^="Pull request not found"]').waitFor();
  await page.getByRole('textbox', { name: 'Pull request number' }).fill('');
  await page.getByRole('textbox', { name: 'Commit SHA' }).fill('abcd1234');
  failure = 'gh: No commit found for SHA: abcd1234 (HTTP 422)';
  await page.getByRole('button', { name: 'Create campaign' }).click();
  await page.locator('cds-text-input[invalid-text^="Commit not found"]').waitFor();
});

test('Market Blaster brief rejects relative paths before starting a job', async t => {
  const { page, url } = await dashboard(t);
  let submitted = false;
  await page.route('**/api/jobs', async route => { if (route.request().method() === 'POST') submitted = true; await route.continue(); });
  await page.goto(`${url}#/p/acme/new`);
  await page.getByRole('textbox', { name: 'Campaign ID' }).fill('launch');
  await page.getByText('Evidence sources (optional)').click();
  await page.getByRole('textbox', { name: 'Market Blaster brief path' }).fill('brief.md');
  await page.getByRole('button', { name: 'Create campaign' }).click();
  assert.equal(await page.locator('cds-text-input[invalid-text^="Enter an absolute path"]').count(), 1);
  assert.equal(submitted, false);
});
