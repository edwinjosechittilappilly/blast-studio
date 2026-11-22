import '@carbon/web-components/es/components/modal/index.js';
import '@carbon/web-components/es/components/text-input/index.js';
import '@carbon/web-components/es/components/textarea/index.js';
import '@carbon/web-components/es/components/select/index.js';
import '@carbon/web-components/es/components/checkbox/index.js';
import '@carbon/web-components/es/components/data-table/index.js';
import { api, headers } from './api.js';
import { el, button, copyButton } from './review.js';

const field = (label, tag = 'cds-text-input') => { const input = el(tag); input.setAttribute('label', label); if (tag === 'cds-textarea') { const span = el('span', label); span.slot = 'label-text'; input.append(span); } return input; };
const notice = (text, kind = 'error') => { const n = el('cds-inline-notification'); n.setAttribute('kind', kind); n.setAttribute('hide-close-button', ''); n.setAttribute('title', text); return n; };
const slugOf = ctx => ctx.project.slug;

export function jobRegion(container, ctx) {
  const region = el('section', null, 'surface job-status'), status = el('div'), details = el('details'), log = el('pre', null, 'job-log'), cancel = button('Cancel job', 'secondary');
  details.append(el('summary', 'Job log'), log); cancel.hidden = true; region.append(el('h2', 'Job status'), status, cancel, details); container.append(region);
  let current, timer;
  async function refresh() {
    if (!region.isConnected) { clearTimeout(timer); return; }
    try {
      const jobs = await api(`/api/jobs?campaign=${encodeURIComponent(slugOf(ctx))}`);
      const job = current ? jobs.find(item => item.id === current) : jobs[0];
      if (!job) { status.replaceChildren(el('p', 'No jobs yet.', 'muted')); details.hidden = true; cancel.hidden = true; return; }
      current = job.id; status.replaceChildren(el('p', `${job.operation}: ${job.state}${job.cancelRequested ? ' (cancellation requested)' : ''}`));
      const result = await api(`/api/jobs/${encodeURIComponent(job.id)}/log?tail=200`); log.textContent = result.log || 'No log output yet.'; details.hidden = false;
      const running = job.state === 'queued' || job.state === 'running'; cancel.hidden = !running; cancel.disabled = !!job.cancelRequested;
      if (running) timer = setTimeout(refresh, 2000);
    } catch (error) { status.replaceChildren(notice(error.message)); }
  }
  cancel.addEventListener('click', async () => { cancel.disabled = true; try { await api(`/api/jobs/${encodeURIComponent(current)}/cancel`, { method: 'POST', headers }); await refresh(); } catch (error) { status.replaceChildren(notice(error.message)); cancel.disabled = false; } });
  async function run(op, args = {}) {
    try { const job = await api('/api/jobs', { method: 'POST', headers, body: JSON.stringify({ op, campaign: slugOf(ctx), args }) }); current = job.id; clearTimeout(timer); await refresh(); }
    catch (error) { status.replaceChildren(notice(error.message)); if (error.command) status.append(el('code', error.command), copyButton('Copy command', error.command)); }
  }
  refresh(); return run;
}

export function openForm(title, description, fields, submitLabel, onSubmit) {
  const modal = el('cds-modal'); modal.setAttribute('open', ''); const header = el('cds-modal-header'), heading = el('cds-modal-heading', title); header.append(heading);
  const body = el('cds-modal-body'); if (description) body.append(el('p', description)); const error = el('p', null, 'form-error'); error.setAttribute('role', 'alert');
  for (const item of fields) body.append(item.node); body.append(error);
  const footer = el('cds-modal-footer'), close = button('Cancel', 'secondary'), submit = button(submitLabel, 'primary'); footer.append(close, submit); modal.append(header, body, footer); document.body.append(modal);
  const dismiss = () => modal.remove(); close.addEventListener('click', dismiss); modal.addEventListener('cds-modal-closed', dismiss);
  submit.addEventListener('click', async () => { const args = {}; for (const item of fields) { const value = item.bool ? item.node.checked : item.node.value?.trim(); if (item.required && !value) { error.textContent = `Enter ${item.label.toLowerCase()}.`; item.node.focus(); return; } if (value) args[item.key] = value; } submit.disabled = true; try { await onSubmit(args); dismiss(); } catch (failure) { error.textContent = failure.message; submit.disabled = false; } });
}
const input = (key, label, required = false, tag = 'cds-text-input') => ({ key, label, required, node: field(label, tag) });
const check = (key, label) => { const node = el('cds-checkbox'); node.setAttribute('label-text', label); return { key, label, node, bool: true }; };
export function renderActions(container, ctx) {
  container.replaceChildren(); const section = el('section', null, 'surface'); section.append(el('h2', 'Campaign actions'), el('p', 'Run campaign steps and manage review decisions.')); container.append(section); const run = jobRegion(container, ctx); let budget;
  api('/api/budget').then(data => { budget = data; }).catch(() => {});
  const actions = [['plan', 'Plan'], ['make', 'Make'], ['render', 'Render'], ['review', 'Review'], ['revise', 'Revise'], ['accept', 'Accept'], ['confirm', 'Confirm rights'], ['mark', 'Mark published'], ['history', 'History'], ['restore', 'Restore'], ['feedback list', 'List feedback'], ['feedback add', 'Add feedback'], ['feedback rm', 'Remove feedback']];
  const group = el('div', null, 'form-actions'); section.append(group);
  for (const [op, label] of actions) { const b = button(label, 'secondary'); group.append(b); b.addEventListener('click', () => {
    const schema = ctx.operations?.[op]; if (!schema) return;
    const fields = [];
    if (schema.fields.platforms) fields.push(input('platforms', 'Platforms (comma-separated)'));
    if (schema.fields.assets) fields.push(input('assets', 'Assets (comma-separated)'));
    if (op === 'revise') fields.push(input('note', 'Revision note', false, 'cds-textarea'), input('platform', 'Platform'), input('asset', 'Asset'));
    if (op === 'accept') fields.push(input('platform', 'Platform', true), input('reason', 'Reason', true, 'cds-textarea'));
    if (op === 'confirm') fields.push(input('asset', 'Asset', true), check('trademarkChecked', 'Trademark checked'), input('license', 'License'));
    if (op === 'mark') fields.push(input('platform', 'Platform', true), input('url', 'Published URL', true));
    if (op === 'restore') fields.push(input('version', 'Version number', true));
    if (op === 'feedback add') fields.push(input('note', 'Feedback', true, 'cds-textarea'), input('platform', 'Platform'), input('asset', 'Asset'));
    if (op === 'feedback rm') fields.push(input('id', 'Feedback ID', true));
    const description = schema.paid ? `This step can incur provider charges and counts toward your configured budget.${budget ? ` Monthly spend: $${Number(budget.mtd).toFixed(2)} of $${Number(budget.cap).toFixed(2)}; campaign spend: $${Number(budget.projects?.[slugOf(ctx)] || 0).toFixed(2)}${budget.perProject ? ` of $${Number(budget.perProject).toFixed(2)}` : ''}.` : ' Budget details are unavailable; check Settings before continuing.'} Confirm before continuing.` : op === 'restore' ? 'Restoring replaces the current campaign version. Continue?' : '';
    if (!fields.length && !description) { run(op); return; }
    openForm(label, description, fields, label, args => run(op, args));
  }); }
  const feedback = el('section', null, 'surface'); feedback.append(el('h2', 'Feedback')); const entries = ctx.project.feedback || []; if (!entries.length) feedback.append(el('p', 'No feedback yet.', 'muted')); for (const entry of entries) { const row = el('div', null, 'history-entry'); row.append(el('strong', `${entry.id} · ${entry.status}`), el('p', entry.note)); feedback.append(row); } container.append(feedback);
}

export function renderAssetsTable(container, ctx) {
  const project = ctx.project; container.replaceChildren(); const section = el('section', null, 'surface'); section.append(el('h2', 'Assets')); container.append(section);
  if (!project.assets.length) { section.append(el('p', 'No assets yet. Run Make to create assets.', 'muted')); return; }
  const table = el('cds-table'), head = el('cds-table-head'), hr = el('cds-table-header-row'); for (const label of ['Asset', 'Kind', 'Outputs', 'AI generated', 'Cost', 'Self-review', 'Blockers', '']) hr.append(el('cds-table-header-cell', label)); head.append(hr); const body = el('cds-table-body');
  for (const asset of project.assets) { const row = el('cds-table-row'); for (const value of [asset.id, asset.kind, String((asset.outputs || []).length), asset.aiGenerated ? 'Yes' : 'No', asset.costUsd == null ? '—' : `$${Number(asset.costUsd).toFixed(2)}`, asset.selfReview?.summary || (asset.selfReview ? 'Available' : '—'), String((asset.blockers || []).length)]) row.append(el('cds-table-cell', value)); const cell = el('cds-table-cell'), view = button('View', 'ghost'); cell.append(view); row.append(cell); body.append(row);
    view.addEventListener('click', () => { const modal = el('cds-modal'); modal.setAttribute('open', ''); const header = el('cds-modal-header'); header.append(el('cds-modal-heading', asset.id)); const content = el('cds-modal-body'); const items = (asset.outputs || []).map(output => ({ ...output, file: `assets/${asset.id}/${output.file}`, alt: '' })); content.append(ctx.mediaGallery(project.slug, items, project.captions), ctx.selfReview(asset.selfReview)); for (const blocker of asset.blockers || []) content.append(el('p', typeof blocker === 'string' ? blocker : JSON.stringify(blocker), 'form-error')); content.append(ctx.feedbackForm(project, { asset: asset.id })); const footer = el('cds-modal-footer'), close = button('Close', 'secondary'); footer.append(close); modal.append(header, content, footer); document.body.append(modal); close.addEventListener('click', () => modal.remove()); modal.addEventListener('cds-modal-closed', () => modal.remove()); });
  }
  table.append(head, body); const scroll = el('div', null, 'table-scroll'); scroll.append(table); section.append(scroll);
}
