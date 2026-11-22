import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright';
import { startDashboard } from '../src/dashboard/server.ts';
import { fakeIO, tempStudio } from './helpers.ts';

async function dashboard(t: TestContext, viewport = { width: 1440, height: 900 }) {
  const root = tempStudio({
    'projects/acme/project.yml': 'name: Acme\ncreatedAt: 2025-01-01\n',
    'projects/acme/campaigns/launch/brief.md': '# Launch',
    'projects/acme/campaigns/launch/plan.yml': '- platform: linkedin\n  type: text\n  angle: launch\n  hooks: [One, Two, Three]\n  assets: []\n',
    'projects/acme/campaigns/launch/posts/linkedin.md': '---\nplatform: linkedin\nevidence: []\nmedia: []\n---\nLaunch post',
    'projects/acme/campaigns/other/brief.md': '# Other',
  });
  const io = fakeIO({ cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: join(root, 'studio.yml') } });
  const started = await startDashboard(io, { port: 0 });
  t.after(() => started.server.close());
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport });
  return { page, url: started.url };
}

function gate() {
  const blocked = Promise.withResolvers<void>();
  const entered = Promise.withResolvers<void>();
  return { blocked: blocked.promise, entered: entered.promise, release: blocked.resolve, arrived: entered.resolve };
}

async function openLaunch(page: Page) {
  await page.getByRole('link', { name: 'launch', exact: true }).click();
  await page.getByRole('tab', { name: /LinkedIn/ }).waitFor();
}

const job = (state: string) => ({ id: 'revision-1', operation: 'revise', state, createdAt: '2026-01-01T00:00:00Z' });

test('mobile campaign cards can be sorted by campaign', async t => {
  const { page, url } = await dashboard(t, { width: 390, height: 844 });
  await page.goto(url);
  await page.getByRole('link', { name: 'acme / launch' }).waitFor();
  // The control must be usable at the mobile breakpoint, not just present in the hidden table.
  await page.getByLabel('Sort campaigns by').selectOption({ label: 'Campaign' });
  assert.deepEqual(await page.locator('.project-card a').allTextContents(), ['acme / launch', 'acme / other']);
  await page.getByRole('button', { name: /Sort order:/ }).click();
  assert.deepEqual(await page.locator('.project-card a').allTextContents(), ['acme / other', 'acme / launch']);
});

test('Carbon navigation opens on mobile and closes after navigation', async t => {
  const { page, url } = await dashboard(t, { width: 375, height: 812 });
  await page.goto(url);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'Budget & providers' }).click();
  await page.getByRole('heading', { name: 'Budget & providers' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Open navigation' }).isVisible(), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
});

test('sortable Carbon headers expose their direction', async t => {
  const { page, url } = await dashboard(t);
  await page.goto(url);
  await page.getByRole('link', { name: 'launch', exact: true }).waitFor();
  const header = page.getByRole('columnheader', { name: 'Campaign' });
  await header.getByRole('button').click();
  assert.equal(await header.getAttribute('aria-sort'), 'ascending');
  await header.getByRole('button').click();
  assert.equal(await header.getAttribute('aria-sort'), 'descending');
});

test('an older failed search cannot replace newer search results', async t => {
  const { page, url } = await dashboard(t);
  const old = gate();
  await page.route('**/api/library?*', async route => {
    if (new URL(route.request().url()).searchParams.get('q') === 'old') {
      old.arrived(); await old.blocked;
      await route.fulfill({ status: 500, json: { error: 'Old search failed' } });
    } else await route.continue();
  });
  t.after(() => old.release());
  await page.goto(url);
  const search = page.getByLabel('Search projects');
  await search.fill('old'); await old.entered;
  await search.fill('launch');
  await page.getByRole('link', { name: 'launch', exact: true }).waitFor();
  const response = page.waitForResponse(response => response.url().includes('q=old'));
  old.release(); await (await response).finished();
  await page.evaluate(() => { const frame = Promise.withResolvers<void>(); requestAnimationFrame(() => frame.resolve()); return frame.promise; });
  await page.waitForFunction(() => !document.body.textContent?.includes('Unable to load projects'));
  assert.equal(await page.getByRole('link', { name: 'launch', exact: true }).isVisible(), true);
});

test('a delayed campaign load cannot overwrite a newer visit to the same campaign', async t => {
  const { page, url } = await dashboard(t);
  const old = gate(); let requests = 0;
  await page.route('**/api/project/acme%2Flaunch', async route => {
    if (++requests === 1) { old.arrived(); await old.blocked; }
    await route.continue();
  });
  t.after(() => old.release());
  await page.goto(url);
  await page.getByRole('link', { name: 'launch', exact: true }).click(); await old.entered;
  await page.getByRole('link', { name: 'Blast Studio' }).click();
  await page.getByRole('link', { name: 'launch', exact: true }).click();
  await page.getByRole('tab', { name: /LinkedIn/ }).click();
  await page.getByText('Launch post').waitFor();
  const response = page.waitForResponse(response => response.url().includes('/api/project/acme%2Flaunch'));
  old.release(); await (await response).finished();
  await page.evaluate(() => { const frame = Promise.withResolvers<void>(); requestAnimationFrame(() => frame.resolve()); return frame.promise; });
  await page.waitForFunction(() => location.hash.endsWith('/linkedin'));
  assert.equal(await page.getByText('Launch post').isVisible(), true);
});

test('a stale route error does not replace the current page', async t => {
  const { page, url } = await dashboard(t);
  const old = gate();
  await page.route('**/api/project/acme%2Flaunch', async route => {
    old.arrived(); await old.blocked;
    await route.fulfill({ status: 404, json: { error: 'Campaign missing' } });
  });
  t.after(() => old.release());
  await page.goto(url);
  await page.getByRole('link', { name: 'launch', exact: true }).click(); await old.entered;
  await page.getByRole('link', { name: 'Blast Studio' }).click();
  await page.getByRole('heading', { name: 'Projects' }).waitFor();
  const response = page.waitForResponse(response => response.url().includes('/api/project/acme%2Flaunch'));
  old.release(); await (await response).finished();
  await page.evaluate(() => { const frame = Promise.withResolvers<void>(); requestAnimationFrame(() => frame.resolve()); return frame.promise; });
  await page.waitForFunction(() => document.querySelector('#projects')?.hasAttribute('hidden') === false);
  assert.equal(await page.getByRole('heading', { name: 'Projects' }).isVisible(), true);
});

test('an initial status failure is retried and enables applying feedback', async t => {
  const { page, url } = await dashboard(t);
  let attempts = 0;
  await page.route('**/api/jobs?*', async route => {
    if (++attempts === 1) await route.fulfill({ status: 503, json: { error: 'Status unavailable' } });
    else await route.fulfill({ json: [] });
  });
  const retried = page.waitForResponse(response => response.url().includes('/api/jobs?') && response.status() === 200);
  await page.goto(url); await openLaunch(page); await retried;
  await page.getByRole('tab', { name: /LinkedIn/ }).click();
  await page.locator('cds-textarea textarea').fill('Make it clearer');
  await page.getByRole('button', { name: 'Add feedback' }).click();
  await page.getByText('Feedback queued. Use Apply feedback when ready.').waitFor();
  await page.waitForFunction(() => {
    const button = document.querySelector('#apply-feedback') as HTMLButtonElement | null;
    return button && !button.disabled;
  });
  assert.ok(attempts >= 2);
});

test('saving feedback across tabs while revision runs preserves the running state and draft', async t => {
  const { page, url } = await dashboard(t);
  const save = gate();
  await page.route('**/api/jobs?*', route => route.fulfill({ json: [job('running')] }));
  await page.route('**/api/jobs/revision-1/log?*', route => route.fulfill({ json: { log: '' } }));
  await page.route('**/api/projects/acme%2Flaunch/feedback', async route => {
    save.arrived(); await save.blocked; await route.continue();
  });
  t.after(() => save.release());
  await page.goto(url); await openLaunch(page);
  await page.getByRole('button', { name: 'Cancel revision' }).waitFor();
  await page.getByRole('tab', { name: /LinkedIn/ }).click();
  const field = page.locator('cds-textarea textarea');
  await field.fill('First note'); await page.getByRole('button', { name: 'Add feedback' }).click(); await save.entered;
  await page.getByRole('tab', { name: 'Overview' }).click();
  await page.getByRole('tab', { name: /LinkedIn/ }).click();
  await page.locator('cds-textarea textarea').fill('New draft');
  const response = page.waitForResponse(response => response.url().endsWith('/feedback') && response.request().method() === 'POST');
  save.release(); await response;
  await page.waitForFunction(() => document.querySelector('#apply-feedback')?.hasAttribute('disabled'));
  assert.equal(await page.locator('cds-textarea textarea').inputValue(), 'New draft');
  assert.equal(await page.getByRole('button', { name: 'Apply 1 feedback item' }).isDisabled(), true);
});

test('completion refresh retries after a temporary failure', async t => {
  const { page, url } = await dashboard(t);
  let statusCalls = 0, projectCalls = 0;
  await page.route('**/api/jobs?*', route => route.fulfill({ json: [job(++statusCalls === 1 ? 'running' : 'succeeded')] }));
  await page.route('**/api/jobs/revision-1/log?*', route => route.fulfill({ json: { log: '' } }));
  await page.route('**/api/project/acme%2Flaunch', async route => {
    if (++projectCalls === 2) await route.fulfill({ status: 503, json: { error: 'Refresh unavailable' } });
    else await route.continue();
  });
  await page.goto(url); await openLaunch(page);
  await page.getByText('Revision completed. Review the updated campaign.').waitFor({ timeout: 15000 });
  assert.ok(projectCalls >= 3);
});
