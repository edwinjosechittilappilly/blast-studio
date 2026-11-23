import '@carbon/web-components/es/components/modal/index.js';
import '@carbon/web-components/es/components/text-input/index.js';
import '@carbon/web-components/es/components/textarea/index.js';
import '@carbon/web-components/es/components/select/index.js';
import '@carbon/web-components/es/components/checkbox/index.js';
import '@carbon/web-components/es/components/data-table/index.js';
import { api, headers } from './api.js';
import { el, button, copyButton } from './review.js';
import { renderFeedbackHistory } from './feedback.js';

const field = (label, tag = 'cds-text-input') => { const input = el(tag); input.setAttribute('label', label); if (tag === 'cds-textarea') { const span = el('span', label); span.slot = 'label-text'; input.append(span); } return input; };
const notice = (text, kind = 'error') => { const n = el('cds-inline-notification'); n.setAttribute('kind', kind); n.setAttribute('hide-close-button', ''); n.setAttribute('title', text); return n; };
const slugOf = ctx => ctx.project.slug;
const quote = value => /^[a-zA-Z0-9_./:=,-]+$/.test(String(value)) ? String(value) : `'${String(value).replaceAll("'", "'\\''")}'`;
function terminalCommand(op, schema, campaign, args) {
  const positional = [], flags = [];
  for (const [key, spec] of Object.entries(schema.fields)) {
    const value = key === 'campaign' ? campaign : args[key]; if (value == null || value === '' || value === false) continue;
    for (const item of Array.isArray(value) ? value : [value]) { if (spec.positional) positional.push(item); else if (spec.flag) flags.push(item === true ? spec.flag : `${spec.flag}=${item}`); }
  }
  const [name, ...sub] = op.split(' '), words = name === 'feedback' ? [name, ...positional.slice(0, 1), ...sub, ...positional.slice(1), ...flags] : [name, ...sub, ...positional, ...flags];
  return ['bstudio', ...words].map(quote).join(' ');
}

export function jobRegion(container, ctx, options = {}) {
  const region = el('section', null, 'surface job-status actions-job'), status = el('div'), startError = el('div'), cancelError = el('div'), details = el('details'), log = el('pre', null, 'job-log actions-log'), cancel = button('Cancel job', 'secondary');
  details.append(el('summary', 'Job log'), log); cancel.hidden = true; region.hidden = !!options.ownOnly; region.append(el('h2', 'Job status'), startError, status, cancelError, cancel, details); container.append(region);
  let current, timer, lastState, generation = 0, lockConflict = false;
  async function refresh() {
    if (!region.isConnected) { clearTimeout(timer); return; }
    clearTimeout(timer);
    const request = ++generation;
    try {
      const allJobs = await api(`/api/jobs?campaign=${encodeURIComponent(slugOf(ctx))}`);
      if (request !== generation || !region.isConnected) return;
      if (lockConflict && !allJobs.some(job => job.state === 'queued' || job.state === 'running')) { startError.replaceChildren(); lockConflict = false; }
      const jobs = allJobs.filter(job => (!options.operation || job.operation === options.operation) && (!options.matches || options.matches(job)));
      const job = current ? jobs.find(item => item.id === current) : options.ownOnly ? jobs.find(item => item.state === 'queued' || item.state === 'running') : jobs[0];
      if (!job) { status.replaceChildren(el('p', 'No jobs yet.', 'muted')); details.hidden = true; cancel.hidden = true; if (lockConflict) timer = setTimeout(refresh, 2000); return; }
      current = job.id; if (options.ownOnly) region.hidden = false;
      const result = await api(`/api/jobs/${encodeURIComponent(job.id)}/log?tail=200`), lines = (result.log || '').trim().split('\n').filter(Boolean);
      if (request !== generation || current !== job.id || !region.isConnected) return;
      log.textContent = result.log || 'No log output yet.'; details.hidden = false;
      const running = job.state === 'queued' || job.state === 'running', n = notice(`${job.operation}: ${job.state}${running && job.cancelRequested ? ' (cancellation requested)' : ''}`, job.state === 'failed' ? 'error' : job.state === 'succeeded' ? 'success' : job.state === 'cancelled' ? 'warning' : 'info');
      if (job.state === 'failed' && lines.length) n.setAttribute('subtitle', lines.at(-1));
      status.replaceChildren(n); if (job.state === 'failed' && lastState !== 'failed') details.open = true;
      cancel.hidden = !running; cancel.disabled = !!job.cancelRequested;
      const completed = !running && lastState && lastState !== job.state;
      lastState = job.state;
      if (completed) await options.onComplete?.(job);
      if (request === generation && (running || lockConflict)) timer = setTimeout(refresh, 2000);
    } catch (error) {
      if (request !== generation || !region.isConnected) return;
      const retry = button('Retry status', 'secondary'); retry.addEventListener('click', refresh);
      status.replaceChildren(notice(error.message), retry);
    }
  }
  cancel.addEventListener('click', async () => { cancel.disabled = true; try { await api(`/api/jobs/${encodeURIComponent(current)}/cancel`, { method: 'POST', headers }); cancelError.replaceChildren(); await refresh(); } catch (error) { cancelError.replaceChildren(notice(error.message)); cancel.disabled = false; } });
  async function run(op, args = {}, reportError = () => {}) {
    try { const job = await api('/api/jobs', { method: 'POST', headers, body: JSON.stringify({ op, campaign: slugOf(ctx), args }) }); generation++; current = job.id; region.hidden = false; lastState = 'queued'; lockConflict = false; startError.replaceChildren(); clearTimeout(timer); await refresh(); return true; }
    catch (error) {
      let message = error.message; lockConflict = /campaign is locked/i.test(message);
      if (lockConflict) {
        try { const jobs = await api(`/api/jobs?campaign=${encodeURIComponent(slugOf(ctx))}`); const running = jobs.find(job => job.state === 'running' || job.state === 'queued'); message = `Another job${running ? ` (${running.operation})` : ''} is running on this campaign. Wait for it or cancel it.`; } catch { message = 'Another job is running on this campaign. Wait for it or cancel it.'; }
      }
      if (error.status === 409 && await options.onConflict?.(error)) return true;
      const n = el('cds-inline-notification'); n.setAttribute('kind', 'error'); n.setAttribute('title', message); startError.replaceChildren(n); if (error.command) startError.append(el('code', error.command), copyButton('Copy command', error.command)); reportError(message); if (lockConflict) { clearTimeout(timer); timer = setTimeout(refresh, 2000); } return false;
    }
  }
  setTimeout(refresh, 0); return run;
}

export function openForm(title, description, fields, submitLabel, onSubmit, kind = 'primary') {
  const modal = el('cds-modal'); modal.setAttribute('open', ''); const header = el('cds-modal-header'), heading = el('cds-modal-heading', title), x = el('cds-modal-close-button'); header.append(heading, x);
  const body = el('cds-modal-body', null, 'actions-modal-body'); if (description) body.append(el('p', description)); const error = el('p', null, 'form-error'); error.setAttribute('role', 'alert');
  for (const item of fields) body.append(item.node); body.append(error);
  const footer = el('cds-modal-footer'), close = button('Cancel', 'secondary'), submit = button(submitLabel, kind); footer.append(close, submit); modal.append(header, body, footer); document.body.append(modal);
  const dismiss = () => modal.remove(); close.addEventListener('click', dismiss); x.addEventListener('click', dismiss); modal.addEventListener('cds-modal-closed', dismiss);
  for (const item of fields) item.node.addEventListener('change', () => item.node.removeAttribute('invalid'));
  submit.addEventListener('click', async () => { const args = {}; for (const item of fields) { const raw = item.bool ? item.node.checked : item.node.value?.trim(), value = raw === '__none' ? '' : raw; if (item.required && !value) { item.node.setAttribute('invalid', ''); item.node.setAttribute('invalid-text', item.invalidText || `Choose or enter ${item.label.toLowerCase()}.`); item.node.focus(); return; } if (value) args[item.key] = value; } if (args.platform && args.asset && title === 'Add feedback') { error.textContent = 'Choose either a platform or an asset, not both.'; return; } error.textContent = ''; submit.disabled = true; try { if (await onSubmit(args, message => { error.textContent = message; }) === false) { if (!error.textContent) error.textContent = 'Could not start the job.'; submit.disabled = false; } else dismiss(); } catch (failure) { error.textContent = failure.message; submit.disabled = false; } });
}
const input = (key, label, required = false, tag = 'cds-text-input') => ({ key, label, required, node: field(label, tag) });
const check = (key, label) => { const node = el('cds-checkbox'); node.setAttribute('label-text', label); return { key, label, node, bool: true }; };
const select = (key, label, values, required = false) => {
  const node = el('cds-select'); node.setAttribute('label-text', label); node.setAttribute('placeholder', required ? 'Choose an option' : 'All / none');
  if (!required) { const blank = el('cds-select-item', 'All / none'); blank.setAttribute('value', '__none'); node.append(blank); }
  for (const value of values) { const option = el('cds-select-item', value.label || value); option.setAttribute('value', value.value || value); node.append(option); }
  return { key, label, required, node };
};
export function renderActions(container, ctx) {
  container.replaceChildren(); const project = ctx.project, section = el('section', null, 'surface actions-panel'); section.append(el('h2', 'Campaign actions')); container.append(section);
  const feedback = el('section', null, 'surface actions-feedback'), feedbackContent = el('div'); feedback.append(el('h2', 'Feedback'), feedbackContent); const versions = el('section', null, 'surface actions-versions'), versionContent = el('div'); versions.append(el('h2', 'Versions'), versionContent);
  const base = `/api/campaigns/${project.slug.split('/').map(encodeURIComponent).join('/')}`; let snapshots = [], budget;
  async function loadData() {
    try { const [updated, history] = await Promise.all([api(`/api/project/${encodeURIComponent(project.slug)}`), api(`${base}/history`)]); Object.assign(project, updated); snapshots = history; renderFeedbackHistory(feedbackContent, { campaign: project.slug, entries: project.feedback, onRemove: entry => openForm('Remove feedback', 'Remove this feedback item?', [], 'Remove', (_, reportError) => run('feedback rm', { id: entry.id }, reportError), 'danger') }); renderVersions(); } catch (error) { versionContent.replaceChildren(notice(`Could not load campaign history: ${error.message}`)); }
  }
  const run = jobRegion(container, ctx, { onComplete: loadData }); api('/api/budget').then(data => { budget = data; }).catch(() => {});
  function renderVersions() {
    versionContent.replaceChildren(); if (!snapshots.length) { versionContent.append(el('p', 'No versions yet.', 'muted')); return; }
    const table = el('table', null, 'overview-table'), head = el('thead'), hr = el('tr'), body = el('tbody'), scroll = el('div', null, 'table-scroll'); for (const name of ['Version', 'Step', 'Time', 'Size', '']) hr.append(el('th', name)); head.append(hr);
    for (const item of snapshots) { const row = el('tr'), cell = el('td'), restore = button('Restore', 'ghost'); restore.addEventListener('click', () => openForm('Restore version', `Replace the current campaign with version ${item.n}?`, [], 'Restore', (_, reportError) => run('restore', { version: String(item.n) }, reportError), 'danger')); cell.append(restore); row.append(el('td', String(item.n)), el('td', item.step), el('td', new Date(item.time).toLocaleString()), el('td', `${(item.size / 1024).toFixed(1)} KB`), cell); body.append(row); } table.append(head, body); scroll.append(table); versionContent.append(scroll);
  }
  const platforms = () => [...new Set([...project.plan.map(item => item.platform), ...project.posts.map(item => item.platform)])], assets = () => project.assets.map(asset => asset.id);
  const pipeline = [['plan', 'Plan'], ['make', 'Make'], ['render', 'Render'], ['review', 'Review']];
  const next = !project.plan.length ? 'plan' : !project.assets.length ? 'make' : !project.posts.length ? 'render' : project.reviews.length < project.posts.length ? 'review' : null;
  function action(op, label, group) {
    const schema = ctx.operations?.[op]; if (!schema) return;
    const wrapper = el('div', null, 'actions-item'), b = button(label, op === next ? 'primary' : 'secondary'); wrapper.append(b); if (schema.paid) { const tag = el('cds-tag', 'Paid'); tag.setAttribute('type', 'purple'); wrapper.append(tag); } if (pipeline.some(([name]) => name === op)) wrapper.append(el('span', op === next ? 'Next step' : ({ plan: project.plan.length, make: project.assets.length, render: project.posts.length, review: project.reviews.length })[op] ? 'Done' : 'Not run', 'muted')); group.append(wrapper);
    if (new URLSearchParams(location.hash.split('?')[1] || '').get('start') === op) setTimeout(() => { b.focus(); b.click(); }, 0);
    b.addEventListener('click', () => {
      const fields = [];
      if (schema.fields.platforms) fields.push(select('platforms', 'Platform', platforms()));
      if (schema.fields.assets) fields.push(select('assets', 'Asset', assets()));
      if (op === 'accept') fields.push(select('platform', 'Platform', project.reviews.filter(review => review.verdict === 'revise' && Array.isArray(review.gates) && review.gates.length && review.gates.every(gate => gate?.pass === true) && project.posts.some(post => post.platform === review.platform)).map(review => review.platform), true), input('reason', 'Reason', true, 'cds-textarea'));
      if (op === 'confirm') fields.push(select('asset', 'Asset', assets(), true), check('trademarkChecked', 'Trademark checked'), input('license', 'License'));
      if (op === 'mark') fields.push(select('platform', 'Manual destination', platforms().filter(id => project.platforms[id]?.delivery === 'manual' && ['youtube-shorts', 'instagram', 'tiktok', 'dailydev'].includes(id)), true), input('url', 'Published URL', true));
      if (op === 'feedback add') fields.push(input('note', 'Feedback', true, 'cds-textarea'), select('platform', 'Platform', platforms()), select('asset', 'Asset', assets()));
      const description = schema.requiresTTY ? 'This operation requires an interactive terminal. Prepare a command to run there.' : schema.paid ? `This step can incur provider charges.${budget ? ` Monthly spend: $${Number(budget.mtd).toFixed(2)} of $${Number(budget.cap).toFixed(2)}.` : ' Check Settings for budget details.'}` : '';
      if (schema.requiresTTY) { openForm(label, description, fields, 'Prepare command', args => { const command = terminalCommand(op, schema, slugOf(ctx), args), output = el('div', null, 'command-snippet'), terminal = el('div', null, 'actions-terminal'); output.append(el('code', command), copyButton('Copy command', command)); terminal.append(notice('Run this operation in a terminal', 'info'), output); section.querySelector('.actions-terminal')?.remove(); section.append(terminal); }); return; }
      if (!fields.length && !description) { run(op); return; }
      openForm(label, description, fields, label, (args, reportError) => run(op, args, reportError));
    });
  }
  for (const [title, list] of [['Pipeline', pipeline], ['Decisions', [['accept', 'Accept'], ['confirm', 'Confirm rights'], ['mark', 'Mark published']]]]) { const group = el('div', null, 'actions-group'), controls = el('div', null, 'actions-controls'); group.append(el('h3', title), controls); section.append(group); for (const [op, label] of list) action(op, label, controls); }
  section.append(el('p', 'To revise content, use Apply feedback in the campaign header.', 'muted')); const feedbackActions = el('div', null, 'actions-controls'); feedback.insertBefore(feedbackActions, feedbackContent); action('feedback add', 'Add feedback', feedbackActions); container.append(feedback, versions); loadData();
}

export function renderAssetsTable(container, ctx) {
  const project = ctx.project; container.replaceChildren(); const section = el('section', null, 'surface'); section.append(el('h2', 'Assets')); container.append(section);
  if (!project.assets.length) { section.append(el('p', 'No assets yet. Run Make to create assets.', 'muted')); return; }
  const table = el('cds-table'), head = el('cds-table-head'), hr = el('cds-table-header-row'); for (const label of ['Asset', 'Kind', 'Outputs', 'AI generated', 'Cost', 'Self-review', 'Blockers', '']) hr.append(el('cds-table-header-cell', label)); head.append(hr); const body = el('cds-table-body');
  for (const asset of project.assets) {
    const row = el('cds-table-row'), idCell = el('cds-table-cell'), link = button(asset.id, 'ghost'); idCell.append(link); row.append(idCell);
    for (const value of [asset.kind, String((asset.outputs || []).length), asset.aiGenerated ? 'Yes' : 'No', asset.costUsd == null ? '—' : `$${Number(asset.costUsd).toFixed(2)}`, asset.selfReview?.summary || (asset.selfReview ? 'Available' : '—'), String((asset.blockers || []).length)]) row.append(el('cds-table-cell', value));
    const cell = el('cds-table-cell'), view = button('View', 'ghost'); cell.append(view); row.append(cell); body.append(row);
    const show = () => { const modal = el('cds-modal'); modal.setAttribute('open', ''); const header = el('cds-modal-header'), x = el('cds-modal-close-button'); header.append(el('cds-modal-heading', asset.id), x); const content = el('cds-modal-body', null, 'actions-modal-body'); const items = (asset.outputs || []).map(output => ({ ...output, file: `assets/${asset.id}/${output.file}`, alt: '' })); content.append(ctx.mediaGallery(project.slug, items, project.captions), ctx.selfReview(asset.selfReview)); if (asset.blockers?.length) { const block = notice('This asset has blockers. Resolve these before exporting.'); block.setAttribute('subtitle', asset.blockers.map(item => typeof item === 'string' ? item : JSON.stringify(item)).join('; ')); content.append(block); } content.append(ctx.feedbackForm(project, { asset: asset.id })); const footer = el('cds-modal-footer'), close = button('Close', 'secondary'); footer.append(close); modal.append(header, content, footer); document.body.append(modal); close.addEventListener('click', () => modal.remove()); x.addEventListener('click', () => modal.remove()); modal.addEventListener('cds-modal-closed', () => modal.remove()); };
    view.addEventListener('click', show); link.addEventListener('click', show);
  }
  table.append(head, body); const scroll = el('div', null, 'table-scroll'); scroll.append(table); section.append(scroll);
}
