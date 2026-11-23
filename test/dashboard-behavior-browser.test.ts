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
  assert.deepEqual(await page.locator('.project-card > a:first-child').allTextContents(), ['acme / launch', 'acme / other']);
  await page.getByRole('button', { name: /Sort order:/ }).click();
  assert.deepEqual(await page.locator('.project-card > a:first-child').allTextContents(), ['acme / other', 'acme / launch']);
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
test('mobile campaign deep links reveal the selected tab', async t => {
  const { page, url } = await dashboard(t, { width: 375, height: 812 });
  await page.goto(`${url}#/p/acme/launch/actions`);
  await page.getByRole('heading', { name: 'Campaign actions' }).waitFor();
  await page.waitForFunction(() => {
    const tabs = document.querySelector('cds-tabs'), tab = document.querySelector('#tab-actions');
    const viewport = tabs?.shadowRoot?.querySelector('.cds--tabs-nav-content-container');
    if (!tab || !viewport) return false;
    const item = tab.getBoundingClientRect(), visible = viewport.getBoundingClientRect();
    return item.left >= visible.left && item.right <= visible.right;
  });
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

test('terminal-only campaign actions prepare a copyable command without starting a job', async t => {
  const { page, url } = await dashboard(t); let submitted = false;
  await page.route('**/api/operations?*', async route => { const response = await route.fetch(); const operations = await response.json(); operations.make.requiresTTY = true; await route.fulfill({ json: operations }); });
  await page.route('**/api/jobs', async route => { if (route.request().method() === 'POST') submitted = true; await route.continue(); });
  await page.goto(`${url}#/p/acme/launch/actions`);
  await page.getByRole('button', { name: 'Make', exact: true }).click();
  await page.getByRole('button', { name: 'Prepare command' }).click();
  await page.getByText('Run this operation in a terminal').waitFor();
  assert.match(await page.locator('#project .command-snippet code').textContent() ?? '', /bstudio make acme\/launch/);
  assert.equal(submitted, false);
});

test('accept offers only revised destinations with passing gates', async t => {
  const { page, url } = await dashboard(t);
  await page.route('**/api/project/acme%2Flaunch', async route => {
    const response = await route.fetch(), project = await response.json();
    project.posts = ['linkedin', 'x', 'threads', 'bluesky'].map(platform => ({ platform }));
    project.reviews = [
      { platform: 'linkedin', verdict: 'revise', gates: [{ pass: true }] },
      { platform: 'x', verdict: 'revise', gates: [{ pass: false }] },
      { platform: 'threads', verdict: 'pass', gates: [{ pass: true }] },
      { platform: 'bluesky', verdict: 'revise', gates: [] },
    ];
    await route.fulfill({ json: project });
  });
  await page.goto(`${url}#/p/acme/launch/actions`);
  await page.getByRole('button', { name: 'Accept', exact: true }).click();
  const options = page.locator('cds-modal cds-select-item');
  assert.deepEqual(await options.allTextContents(), ['linkedin']);
});

test('campaign lock error clears when the conflicting job finishes', async t => {
  const { page, url } = await dashboard(t); let running = true;
  await page.route('**/api/jobs?*', route => route.fulfill({ json: [job(running ? 'running' : 'succeeded')] }));
  await page.route('**/api/jobs/revision-1/log?*', route => route.fulfill({ json: { log: '' } }));
  await page.route('**/api/jobs', route => route.fulfill({ status: 409, json: { error: 'Campaign is locked' } }));
  await page.goto(`${url}#/p/acme/launch/actions`);
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await page.locator('cds-modal').getByRole('button', { name: 'Review', exact: true }).click();
  const conflict = page.locator('cds-inline-notification[title^="Another job"]');
  await conflict.waitFor();
  running = false;
  await conflict.waitFor({ state: 'detached' });
});

test('pipeline labels describe whether a step has output', async t => {
  const { page, url } = await dashboard(t);
  await page.goto(`${url}#/p/acme/launch/actions`);
  const actions = page.locator('.actions-panel');
  await actions.getByText('Done', { exact: true }).first().waitFor();
  await actions.getByText('Not run', { exact: true }).first().waitFor();
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

test('export readiness identifies stale reviews and formats small exports', async t => {
  const { page, url } = await dashboard(t);
  await page.route('**/api/project/acme%2Flaunch', async route => {
    const response = await route.fetch(), project = await response.json();
    project.reviews = [{ platform: 'linkedin', verdict: 'pass', stale: true, gates: ['policy', 'disclosure', 'specs', 'accessibility', 'fabricated-metrics', 'rights'].map(id => ({ id, pass: true })) }];
    await route.fulfill({ response, json: project });
  });
  await page.route('**/api/campaigns/acme/launch/exports', route => route.fulfill({ json: [{ name: 'small.zip', kind: 'zip', size: 8, time: '2026-01-01T00:00:00Z' }] }));
  await page.goto(`${url}#/p/acme/launch/export`);
  await page.getByText('8 bytes', { exact: true }).waitFor();
  await page.getByText('pass; stale', { exact: false }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Export locally' }).isDisabled(), true);
  assert.match(await page.getByText('Export is unavailable for:', { exact: false }).innerText(), /LinkedIn/);
  await page.getByRole('link', { name: 're-run review' }).click();
  await page.getByRole('button', { name: 'Review', exact: true }).waitFor();
});

test('project page has one campaign action and jobs tooltip stays within the viewport', async t => {
  const { page, url } = await dashboard(t);
  await page.goto(`${url}#/p/acme`);
  await page.getByRole('heading', { name: 'Acme' }).waitFor();
  assert.equal(await page.locator('#project-detail cds-button').filter({ hasText: 'New campaign' }).count(), 1);
  await page.getByRole('button', { name: /Jobs/ }).click();
  await page.getByRole('heading', { name: 'Jobs', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
});

for (const scenario of [
  { operation: 'doctor', route: 'health', button: 'Run health check', log: 'omp generate_image.enabled: false\nomp generate_image is disabled; enable generate_image.enabled in omp config\n', code: 1 },
  { operation: 'sources check', route: 'sources', button: 'Check sources', log: '# Platform sources\n\n## example: failed\n', code: 1 },
  { operation: 'sources check', route: 'sources', button: 'Check sources', log: '# Platform sources\n\n## example: changed\n', code: 2 },
]) test(`${scenario.operation} exit ${scenario.code} is displayed as findings`, async t => {
  const { page, url } = await dashboard(t);
  const record = { id: 'diagnostic-1', operation: scenario.operation, state: 'failed', exitCode: scenario.code, findings: true, createdAt: '2026-01-01T00:00:00Z' };
  await page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text: string) => { document.documentElement.dataset.copiedText = text; } } }); });
  await page.route('**/api/jobs', async route => { await route.fulfill({ json: route.request().method() === 'POST' ? record : [record] }); });
  await page.route('**/api/jobs/diagnostic-1/log?*', async route => { await route.fulfill({ json: { log: scenario.log } }); });
  await page.route('**/api/jobs/diagnostic-1', async route => { await route.fulfill({ json: record }); });
  await page.goto(`${url}#/${scenario.route}`);
  await page.getByRole('button', { name: scenario.button }).click();
  await page.locator('cds-inline-notification[kind="warning"][title^="Completed with findings"]').waitFor();
  if (scenario.operation === 'doctor') {
    await page.getByRole('button', { name: 'Copy fix' }).first().click();
    await page.waitForFunction(() => document.documentElement.dataset.copiedText === 'omp config set generate_image.enabled true');
  }
  await page.locator('#jobs-toggle').click();
  await page.locator('#jobs-list cds-tag[type="warm-gray"]').getByText('Completed with findings').waitFor();
});

test('a failed diagnostic job without findings remains a failure', async t => {
  const { page, url } = await dashboard(t);
  const record = { id: 'diagnostic-1', operation: 'doctor', state: 'failed', exitCode: 1, findings: false, createdAt: '2026-01-01T00:00:00Z' };
  await page.route('**/api/jobs', async route => { await route.fulfill({ json: route.request().method() === 'POST' ? record : [record] }); });
  await page.route('**/api/jobs/diagnostic-1/log?*', async route => { await route.fulfill({ json: { log: 'error: invalid configuration' } }); });
  await page.route('**/api/jobs/diagnostic-1', async route => { await route.fulfill({ json: record }); });
  await page.goto(`${url}#/health`);
  await page.getByRole('button', { name: 'Run health check' }).click();
  await page.getByText('Job failed', { exact: true }).waitFor();
  await page.locator('#jobs-toggle').click();
  await page.locator('#jobs-list cds-tag[type="red"]').getByText('failed', { exact: true }).waitFor();
});

test('a late log response from an older job cannot replace the current job or suppress its completion refresh', async t => {
  const { page, url } = await dashboard(t);
  const oldLog = gate();
  t.after(() => oldLog.release());
  let started = false, finished = false, historyCalls = 0;
  const oldJob = { ...job('succeeded'), id: 'old-job', operation: 'review' };
  const newJob = () => ({ ...job(finished ? 'succeeded' : 'running'), id: 'new-job', operation: 'review' });
  await page.route('**/api/jobs?*', route => route.fulfill({ json: [started ? newJob() : oldJob] }));
  await page.route('**/api/jobs/old-job/log?*', async route => { oldLog.arrived(); await oldLog.blocked; await route.fulfill({ json: { log: 'old log' } }); });
  await page.route('**/api/jobs/new-job/log?*', route => route.fulfill({ json: { log: 'new log' } }));
  await page.route('**/api/jobs', route => { if (route.request().method() !== 'POST') return route.fulfill({ json: [] }); started = true; return route.fulfill({ json: newJob() }); });
  await page.route('**/api/campaigns/acme/launch/history', async route => { historyCalls++; await route.fulfill({ json: [] }); });
  await page.goto(`${url}#/p/acme/launch/actions`);
  await oldLog.entered;
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await page.locator('cds-modal').getByRole('button', { name: 'Review', exact: true }).click();
  await page.locator('cds-inline-notification[title="review: running"]').waitFor();
  const oldResponse = page.waitForResponse(response => response.url().includes('/api/jobs/old-job/log'));
  oldLog.release(); await oldResponse;
  const historyBeforeCompletion = historyCalls;
  const completionRefresh = page.waitForResponse(response => response.url().endsWith('/api/campaigns/acme/launch/history'));
  finished = true;
  await page.locator('cds-inline-notification[title="review: succeeded"]').waitFor();
  await completionRefresh;
  await page.waitForFunction(() => document.querySelector('.actions-log')?.textContent === 'new log');
  assert.ok(historyCalls > historyBeforeCompletion);
});

for (const failingRequest of ['status', 'log']) test(`job monitoring can retry a failed ${failingRequest} request without starting another job`, async t => {
  const { page, url } = await dashboard(t);
  let recovered = false, posts = 0;
  await page.route('**/api/jobs', route => { if (route.request().method() !== 'POST') return route.fulfill({ json: [] }); posts++; return route.fulfill({ status: 500, json: { error: 'Unexpected start' } }); });
  await page.route('**/api/jobs?*', route => {
    if (failingRequest === 'status' && !recovered) return route.fulfill({ status: 503, json: { error: 'Status unavailable' } });
    return route.fulfill({ json: [{ ...job('running'), operation: 'review' }] });
  });
  await page.route('**/api/jobs/revision-1/log?*', route => {
    if (failingRequest === 'log' && !recovered) return route.fulfill({ status: 503, json: { error: 'Log unavailable' } });
    return route.fulfill({ json: { log: 'still running' } });
  });
  await page.goto(`${url}#/p/acme/launch/actions`);
  const retry = page.getByRole('button', { name: 'Retry status' });
  await retry.waitFor();
  recovered = true;
  await retry.click();
  await page.locator('cds-inline-notification[title="review: running"]').waitFor();
  assert.equal(posts, 0);
});

test('a rejected job submission keeps its form and values available for retry', async t => {
  const { page, url } = await dashboard(t);
  let attempts = 0;
  await page.route('**/api/jobs', route => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: [] });
    if (++attempts === 1) return route.fulfill({ status: 400, json: { error: 'Invalid feedback' } });
    return route.fulfill({ json: { ...job('queued'), operation: 'feedback add' } });
  });
  await page.route('**/api/jobs?*', route => route.fulfill({ json: [] }));
  await page.goto(`${url}#/p/acme/launch/actions`);
  await page.getByRole('button', { name: 'Add feedback', exact: true }).click();
  const modal = page.locator('cds-modal'), field = modal.locator('cds-textarea textarea');
  await field.fill('Keep this draft');
  const submit = modal.getByRole('button', { name: 'Add feedback', exact: true });
  await submit.click();
  await modal.getByRole('alert').filter({ hasText: 'Invalid feedback' }).waitFor();
  assert.equal(await field.inputValue(), 'Keep this draft');
  assert.equal(await submit.isDisabled(), false);
  await submit.click();
  await modal.waitFor({ state: 'detached' });
  assert.equal(attempts, 2);
});

test('Escape closes the jobs panel and restores focus to its toggle', async t => {
  const { page, url } = await dashboard(t);
  await page.goto(url);
  const toggle = page.locator('#jobs-toggle'), panel = page.locator('#jobs-panel');
  await toggle.click();
  await panel.waitFor({ state: 'visible' });
  assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
  await page.keyboard.press('Escape');
  await panel.waitFor({ state: 'hidden' });
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(await toggle.evaluate(element => element === document.activeElement), true);
});

test('blockers can be resolved with a reason and appear in history', async t => {
  const { page, url } = await dashboard(t, { width: 390, height: 844 });
  let submitted: unknown;
  await page.route('**/api/campaigns/acme/launch/blockers', route => route.fulfill({ json: submitted
    ? { blockers: [], resolutions: [{ target: 'post:linkedin', text: 'Missing source', reason: 'Source added', resolvedAt: '2026-01-01T00:00:00Z', by: 'owner' }] }
    : { blockers: [{ target: 'post:linkedin', index: 0, text: 'Missing source' }], resolutions: [] } }));
  await page.route('**/api/jobs?*', route => route.fulfill({ json: submitted ? [{ id: 'resolve-1', operation: 'blockers resolve', state: 'succeeded' }] : [] }));
  await page.route('**/api/jobs/resolve-1/log?*', route => route.fulfill({ json: { log: '' } }));
  await page.route('**/api/jobs', route => {
    submitted = route.request().postDataJSON();
    return route.fulfill({ json: { id: 'resolve-1' } });
  });
  await page.goto(`${url}#/p/acme/launch/linkedin`);
  await page.getByText('posts/linkedin.md', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Resolve posts/linkedin.md blocker 1' }).click();
  const modal = page.locator('cds-modal');
  await modal.getByRole('button', { name: 'Resolve', exact: true }).click();
  assert.equal(await modal.locator('cds-textarea').getAttribute('invalid'), '');
  await modal.locator('cds-textarea').locator('textarea').fill('Source added');
  await modal.getByRole('button', { name: 'Resolve', exact: true }).click();
  await page.getByText('No open blockers.').waitFor();
  assert.deepEqual(submitted, { op: 'blockers resolve', campaign: 'acme/launch', args: { target: 'post:linkedin', index: '0', reason: 'Source added' } });
  await page.getByText('Resolved history (1)').click();
  await page.getByText('Reason: Source added').waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
});

test('saved review gate paths are shown relative to the campaign', async t => {
  const { page, url } = await dashboard(t);
  await page.route('**/api/project/acme%2Flaunch', async route => {
    const response = await route.fetch(), project = await response.json();
    project.reviews = [{ platform: 'linkedin', verdict: 'blocked', gates: [{ id: 'source', pass: false, message: 'See /old/home/projects/acme/campaigns/launch/posts/linkedin.md' }], scores: [] }];
    await route.fulfill({ json: project });
  });
  await page.goto(`${url}#/p/acme/launch/linkedin`);
  await page.getByText('Fail · source — See posts/linkedin.md').waitFor();
  assert.equal(await page.getByText('/old/home', { exact: false }).count(), 0);
});
