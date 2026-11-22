import '@carbon/web-components/es/components/button/index.js';
import '@carbon/web-components/es/components/tag/index.js';
import '@carbon/web-components/es/components/data-table/index.js';
import '@carbon/web-components/es/components/notification/index.js';
import { api, headers } from './api.js';
import { el, button, copyButton } from './review.js';

export function notice(text, kind = 'error') {
  const node = el('cds-inline-notification'); node.setAttribute('kind', kind); node.setAttribute('title', text); node.setAttribute('low-contrast', ''); node.setAttribute('hide-close-button', ''); return node;
}
export function table(columns, rows) {
  const wrap = el('div', null, 'table-scroll'), t = el('cds-table'), head = el('cds-table-head'), hr = el('cds-table-header-row'), body = el('cds-table-body');
  for (const column of columns) hr.append(el('cds-table-header-cell', column));
  head.append(hr);
  for (const row of rows) { const tr = el('cds-table-row'); for (const value of row) { const cell = el('cds-table-cell'); if (value instanceof Node) cell.append(value); else cell.textContent = value; tr.append(cell); } body.append(tr); }
  t.append(head, body); wrap.append(t); return wrap;
}
export function tag(text, type = 'gray') { const node = el('cds-tag', text); node.setAttribute('type', type); return node; }
export function command(text) { const node = el('div', null, 'command-snippet'); node.append(el('code', text), copyButton('Copy command', text)); return node; }

// Jobs own their status, log and cancellation until they reach a terminal state.
export async function runJob(target, op, args = {}, onComplete = () => {}) {
  target.replaceChildren(el('p', 'Starting…')); target.setAttribute('aria-live', 'polite');
  let job;
  try { job = await api('/api/jobs', { method: 'POST', headers, body: JSON.stringify({ op, args }) }); }
  catch (error) { target.replaceChildren(notice(error.message)); if (error.command) target.append(el('p', 'This operation requires a terminal.'), command(error.command)); await onComplete({ state: 'failed' }, ''); return; }
  const status = el('p'), cancel = button('Cancel job', 'secondary'), details = el('details'), summary = el('summary', 'Job log'), log = el('pre');
  details.append(summary, log); target.replaceChildren(status, cancel, details);
  cancel.addEventListener('click', async () => { cancel.disabled = true; try { await api(`/api/jobs/${encodeURIComponent(job.id)}/cancel`, { method: 'POST', headers }); } catch (error) { target.append(notice(error.message)); cancel.disabled = false; } });
  async function update() {
    try {
      const [current, output] = await Promise.all([api(`/api/jobs/${encodeURIComponent(job.id)}`), api(`/api/jobs/${encodeURIComponent(job.id)}/log?tail=1000`)]);
      job = current; status.textContent = `Job ${job.state}${job.cancelRequested && (job.state === 'running' || job.state === 'queued') ? ' · cancellation requested' : ''}`; log.textContent = output.log || 'No output yet.';
      if (job.state === 'running' || job.state === 'queued') { setTimeout(() => { if (target.isConnected) update(); }, 1000); return; }
      cancel.hidden = true; await onComplete(job, output.log || '');
    } catch (error) { status.textContent = 'Unable to refresh job status.'; target.append(notice(error.message)); cancel.hidden = true; await onComplete({ state: 'failed' }, ''); }
  }
  await update();
}

export function parseDoctor(log) {
  return log.split(/\r?\n/).filter(Boolean).map(line => {
    const match = /^([^:]+):\s*(.*)$/.exec(line);
    if (!match) return { tool: 'Studio', status: /disabled|missing|error/i.test(line) ? 'Attention' : 'Info', version: '', hint: line };
    const [, tool, result] = match, parts = result.split(/;\s*/, 2), problem = /^(missing|not set)/i.test(result) || /requires Node/i.test(result);
    return { tool, status: problem ? 'Attention' : 'Available', version: parts[0], hint: parts[1] || '' };
  });
}
function fixCell(hint) {
  const node = el('div'); if (!hint) { node.textContent = '—'; return node; }
  node.append(el('span', hint)); const match = /^(?:install|run):\s*(.+)$/.exec(hint);
  if (match && !match[1].includes('<') && !/^https?:/.test(match[1])) node.append(copyButton('Copy fix', match[1].replace(/ \(.*$/, '')));
  return node;
}
export async function renderHealth(container) {
  const title = el('h1', 'Health check'), intro = el('p', 'Check local tools, provider credentials and budget configuration.'), run = button('Run health check', 'primary'), job = el('div', null, 'job-status'), results = el('div');
  container.replaceChildren(title, intro, run, job, results);
  const execute = async () => { run.disabled = true; results.replaceChildren(); await runJob(job, 'doctor', {}, (record, log) => { run.disabled = false; run.textContent = 'Run again'; const rows = parseDoctor(log); if (rows.length) results.replaceChildren(el('h2', 'Results'), table(['Tool', 'Status', 'Version or detail', 'Suggested fix'], rows.map(row => [row.tool, tag(row.status, row.status === 'Attention' ? 'red' : row.status === 'Available' ? 'green' : 'gray'), row.version || '—', fixCell(row.hint)]))); else results.replaceChildren(el('p', record.state === 'succeeded' ? 'No checks were reported.' : 'No results were reported. See the job log.')); }); if (!job.querySelector('details')) run.disabled = false; };
  run.addEventListener('click', execute);
}
