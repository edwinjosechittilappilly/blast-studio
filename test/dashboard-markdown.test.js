import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown, parseInline, renderMarkdown } from '../src/dashboard/static/markdown.js';
import { campaignPath } from '../src/dashboard/ui/components/api.js';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';

test('markdown parser produces safe structured content', () => {
  const nodes = parseMarkdown('# Heading\n\nA **bold** and *italic* [link](https://example.com).\n\n- one\n- two\n\n> Quote\n\n```js\n<script>alert(1)</script>\n```');
  assert.deepEqual(nodes.map(n => n.type), ['h1', 'p', 'ul', 'blockquote', 'pre']);
  assert.equal(nodes[4].text, '<script>alert(1)</script>');
  assert.ok(nodes[1].children.some(n => n.type === 'link' && n.href === 'https://example.com'));
  assert.deepEqual(parseInline('[bad](javascript:alert)'), [{ type: 'text', text: '[bad](javascript:alert)' }]);
});

test('code fences close only with a matching character and sufficient length', () => {
  const nodes = parseMarkdown('````js\n```\n~~~~\n```` trailing\ninside\n````   \nafter\n\n~~~\n```\n~~~\t');
  assert.deepEqual(nodes, [
    { type: 'pre', text: '```\n~~~~\n```` trailing\ninside' },
    { type: 'p', children: [{ type: 'text', text: 'after' }] },
    { type: 'pre', text: '```' },
  ]);
});

test('empty list items advance without hanging', () => {
  const script = "import { parseMarkdown } from './src/dashboard/static/markdown.js'; console.log(JSON.stringify(parseMarkdown(process.argv[1])));";
  for (const input of ['-\n- \n- item', '1.\n2. \n3. item']) {
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', script, '--', input], { encoding: 'utf8', timeout: 2000 });
    assert.deepEqual(JSON.parse(output), [{
      type: input[0] === '-' ? 'ul' : 'ol',
      children: [
        { type: 'li', children: [] },
        { type: 'li', children: [] },
        { type: 'li', children: [{ type: 'text', text: 'item' }] },
      ],
    }]);
  }
});

test('word-internal underscores stay literal', () => {
  assert.deepEqual(parseInline('build_in_public and a_b_c'), [{ type: 'text', text: 'build_in_public and a_b_c' }]);
  assert.equal(parseInline('_emphasis_')[0].type, 'em');
});

test('markdown DOM rendering creates only safe links and text', () => {
  class Node {
    constructor(tag) { this.tag = tag; this.children = []; }
    append(child) { this.children.push(child); }
  }
  const document = { createDocumentFragment: () => new Node('fragment'), createElement: tag => new Node(tag), createTextNode: text => Object.assign(new Node('#text'), { text }) };
  const fragment = renderMarkdown('[safe](https://example.com) <script>alert(1)</script> [bad](javascript:alert)', document);
  const paragraph = fragment.children[0], link = paragraph.children[0];
  assert.equal(link.tag, 'a'); assert.equal(link.href, 'https://example.com'); assert.equal(link.target, '_blank'); assert.match(link.rel, /noopener/);
  assert.ok(paragraph.children.every(node => node.tag !== 'script'));
  assert.match(paragraph.children.map(node => node.text ?? '').join(''), /<script>/);
});

test('built dashboard assets contain no external HTTPS references', () => {
  execFileSync(process.execPath, ['src/dashboard/ui/build.mjs']);
  for (const file of ['src/dashboard/build/app.css', 'src/dashboard/build/app.js']) assert.doesNotMatch(readFileSync(file, 'utf8'), /https:\/\//);
});

function dashboardHarness() {
  const source = readFileSync('src/dashboard/ui/app.js', 'utf8');
  const forms = source.slice(source.indexOf('function feedbackHistory'), source.indexOf('function platformPanel'));
  class Node {
    constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.dataset = {}; this.isConnected = true; this.value = ''; this.textContent = ''; }
    append(...nodes) { for (const node of nodes) { node.parentElement = this; this.children.push(node); } }
    replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
    replaceWith(node) { const index = this.parentElement.children.indexOf(this); this.parentElement.children[index] = node; node.parentElement = this.parentElement; this.isConnected = false; }
    setAttribute() {}
    removeAttribute() {}
    focus() { this.focused = true; }
    addEventListener(type, callback) { this.listeners[type] = callback; }
    querySelector(selector) { return this.nodes?.[selector] ?? this.children.find(node => node.tag === selector) ?? null; }
  }
  const nodes = { '#project': { hidden: false }, '#message': new Node('message') };
  const calls = [], timers = [], toasts = [];
  const context = {
    Map, JSON, encodeURIComponent, Date, Error, campaignPath, timer: undefined,
    displayName: name => ({ linkedin: 'LinkedIn' }[name] || name),
    el: (tag, text) => Object.assign(new Node(tag), { textContent: text || '' }),
    button: text => Object.assign(new Node('button'), { textContent: text }),
    $: selector => nodes[selector], headers: {}, activeProject: 'a', activeTab: 'overview', feedbackDrafts: new Map(),
    api: (...args) => context.request(...args), feedbackJobStatus: (...args) => context.statusRequest(...args),
    message: text => { nodes['#message'].textContent = text; },
    openProject: async (...args) => { calls.push(args); }, toast: (...args) => { toasts.push(args); },
    setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout: () => {},
  };
  runInNewContext(forms, context);
  return { context, nodes, calls, timers, toasts, Node };
}

test('feedback drafts survive tab changes and clear only after the saved version succeeds', async () => {
  const { context } = dashboardHarness(), project = { slug: 'a', feedback: [] }, target = { platform: 'linkedin' };
  let form = context.feedbackForm(project, target), field = form.children[1], submit = form.children[3].children[0];
  field.value = 'first draft'; field.listeners.input();
  form = context.feedbackForm(project, target); field = form.children[1]; submit = form.children[3].children[0];
  assert.equal(field.value, 'first draft');
  context.request = async () => { throw new Error('offline'); };
  await submit.listeners.click();
  assert.equal(form.children[2].textContent, 'offline');
  assert.equal(context.feedbackForm(project, target).children[1].value, 'first draft');
  let resolve;
  context.request = () => new Promise(done => { resolve = done; });
  const save = submit.listeners.click();
  field.value = 'newer draft'; field.listeners.input();
  resolve({ target, note: 'first draft', status: 'pending', at: '2026-01-01' }); await save;
  assert.equal(context.feedbackForm(project, target).children[1].value, 'newer draft');
  context.request = async () => ({ target, note: 'newer draft', status: 'pending', at: '2026-01-01' });
  await context.feedbackForm(project, target).children[3].children[0].listeners.click();
  assert.equal(context.feedbackForm(project, target).children[1].value, '');
});

test('a completed feedback save does not reopen or focus a departed project', async () => {
  const { context, calls, nodes, toasts } = dashboardHarness(), project = { slug: 'a', feedback: [] };
  const form = context.feedbackForm(project, {}), field = form.children[1];
  field.value = 'feedback'; field.listeners.input();
  let resolve; context.request = () => new Promise(done => { resolve = done; });
  const save = form.children[3].children[0].listeners.click();
  context.activeProject = 'b'; resolve({ target: {}, note: 'feedback', status: 'pending', at: '2026-01-01' }); await save;
  assert.equal(calls.length, 0);
  assert.equal(toasts.length, 0);
  assert.equal(nodes['#message'].focused, undefined);
  assert.equal(context.feedbackForm(project, {}).children[1].value, '');
});

test('failed status polling retries only while its project view remains active', async () => {
  const { context, timers, nodes, Node } = dashboardHarness(), project = { slug: 'a', feedback: [] };
  const announcement = new Node('announcement'), log = new Node('log'); log.parentElement = {};
  const region = new Node('region'); region.nodes = { '.job-announcement': announcement, '.job-log': log, '.cancel-job': new Node('button') };
  const apply = new Node('button');
  context.statusRequest = async () => ({ running: true, lines: [] });
  await context.jobStatus(project, region, apply);
  context.statusRequest = async () => { throw new Error('offline'); };
  await timers.shift()();
  assert.equal(nodes['#message'].textContent, 'offline');
  assert.equal(timers.length, 1);
  context.activeProject = 'b';
  await timers.shift()();
  assert.equal(timers.length, 0);
});

test('a completed job refresh does not update a departed project view', async () => {
  const { context, nodes, toasts, Node } = dashboardHarness();
  const pending = { id: '1', status: 'pending' }, project = { slug: 'a', feedback: [pending] };
  const announcement = new Node('announcement'), log = new Node('log'); log.parentElement = {};
  const region = new Node('region'); region.dataset.running = 'yes'; region.pendingIds = ['1'];
  region.nodes = { '.job-announcement': announcement, '.job-log': log, '.cancel-job': new Node('button') };
  const apply = new Node('button'), reason = nodes['#apply-reason'] = new Node('reason');
  context.statusRequest = async () => ({ running: false, state: 'succeeded', lines: [] });
  let resolveRefresh, refreshStarted;
  const started = new Promise(resolve => { refreshStarted = resolve; });
  context.request = () => { refreshStarted(); return new Promise(resolve => { resolveRefresh = resolve; }); };
  const status = context.jobStatus(project, region, apply);
  await started;
  context.activeProject = 'b'; apply.disabled = true; apply.textContent = 'Other project'; reason.textContent = 'Other reason';
  resolveRefresh({ feedback: [{ id: '1', status: 'applied' }] }); await status;
  assert.equal(apply.disabled, true);
  assert.equal(apply.textContent, 'Other project');
  assert.equal(reason.textContent, 'Other reason');
  assert.deepEqual(toasts, []);
  assert.equal(project.feedback[0], pending);
});
