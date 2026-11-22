import { api } from './api.js';
import { el, button } from './review.js';
import { jobRegion, openForm } from './actions.js';

export function renderExport(container, ctx) {
  container.replaceChildren(); const section = el('section', null, 'surface'); section.append(el('h2', 'Export campaign'), el('p', 'Export using the Market Blaster project in project.yml or studio settings, or enter a different project path.'));
  const target = el('cds-text-input'); target.setAttribute('label', 'Market Blaster project path (optional)'); target.setAttribute('helper-text', 'Leave empty to use the configured project.');
  const buttons = el('div', null, 'form-actions'), local = button('Export locally', 'secondary'), force = button('Force re-import', 'secondary'), submit = button('Export', 'primary'); buttons.style.flexWrap = 'wrap'; buttons.style.gap = '0.5rem'; buttons.append(local, force, submit); section.append(target, buttons); container.append(section);
  const run = jobRegion(container, ctx); const args = () => target.value?.trim() ? { mb: target.value.trim() } : {};
  submit.addEventListener('click', () => run('export', args()));
  local.addEventListener('click', () => run('export', { local: true }));
  force.addEventListener('click', () => openForm('Force re-import', 'This replaces approved drafts in Market Blaster. Only continue if you intend to overwrite those drafts.', [], 'Force re-import', () => run('export', { ...args(), force: true })));
  const history = el('section', null, 'surface'), content = el('div'); history.append(el('h2', 'Export history'), content); container.append(history);
  const parts = ctx.project.slug.split('/').map(encodeURIComponent), path = `/api/campaigns/${parts[0]}/${parts[1]}/exports`;
  async function load() { try { const entries = await api(path); if (!history.isConnected) return; content.replaceChildren(); if (!entries.length) { content.append(el('p', 'No exports yet.', 'muted')); return; } const list = el('ul'); for (const entry of entries) { const row = el('li'); row.append(el('span', `${new Date(entry.time).toLocaleString()} · ${entry.kind} · ${entry.size.toLocaleString()} bytes `)); if (entry.kind === 'zip') { const link = el('a', 'Download'); link.href = `${path}/${encodeURIComponent(entry.name)}`; link.setAttribute('download', ''); row.append(link); } else row.append(el('span', 'Directory export')); list.append(row); } content.append(list); } catch (error) { content.replaceChildren(el('p', `Could not load export history: ${error.message}`, 'form-error')); } }
  const refresh = button('Refresh history', 'ghost'); refresh.addEventListener('click', load); history.append(refresh); content.append(el('p', 'Loading export history…', 'muted')); load();
}
