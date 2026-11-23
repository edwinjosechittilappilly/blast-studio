import { api } from './api.js';
import { el, button } from './review.js';
import { jobRegion, openForm } from './actions.js';

export function renderExport(container, ctx) {
  container.replaceChildren(); const project = ctx.project, section = el('section', null, 'surface export-panel'); section.append(el('h2', 'Export campaign'));
  const readiness = el('div', null, 'export-readiness'); readiness.append(el('h3', 'Destination readiness'));
  const list = el('ul'), missing = [];
  for (const post of project.posts) {
    const review = project.reviews.find(item => item.platform === post.platform), gates = review?.gates, passing = review && ['pass', 'accepted'].includes(review.verdict), gatesPassing = Array.isArray(gates) && gates.every(gate => gate?.pass === true) && ['policy', 'disclosure', 'specs', 'accessibility', 'fabricated-metrics', 'rights'].every(id => gates.some(gate => gate.id === id)), ready = passing && gatesPassing && !review.stale;
    if (!ready) missing.push(project.platforms?.[post.platform]?.name || post.platform);
    const row = el('li'), link = el('a', project.platforms?.[post.platform]?.name || post.platform), route = project.platforms?.[post.platform]?.delivery === 'manual' ? 'Manual handoff' : 'Market Blaster'; link.href = `#/p/${project.slug.split('/').map(encodeURIComponent).join('/')}/${encodeURIComponent(post.platform)}`; row.append(link, document.createTextNode(` — ${route} — ${review?.verdict || 'not reviewed'}`));
    if (review?.stale) { const reviewLink = el('a', 're-run review'); reviewLink.href = `#/p/${project.slug.split('/').map(encodeURIComponent).join('/')}/actions`; row.append(document.createTextNode('; stale — '), reviewLink); }
    else if (passing && !gatesPassing) row.append(document.createTextNode('; passing gates required'));
    else if (!passing) row.append(document.createTextNode('; pass or acceptance needed'));
    list.append(row);
  }
  if (!project.posts.length) readiness.append(el('p', 'No destinations yet. Plan and render the campaign first.', 'muted')); else readiness.append(list);
  const blocked = !project.posts.length || missing.length > 0; if (blocked) readiness.append(el('p', missing.length ? `Export is unavailable for: ${missing.join(', ')}. Resolve the review issues above.` : 'Export is unavailable until there are destinations to review.', 'form-error'));
  section.append(readiness, el('p', `Configured Market Blaster target: ${project.mbTarget || 'None — export locally or enter a path.'}`));
  const target = el('cds-text-input'); target.setAttribute('label', 'Market Blaster project path (optional)'); target.setAttribute('helper-text', 'Leave empty to use the configured project. Otherwise use an absolute path or ~/path.');
  const buttons = el('div', null, 'form-actions export-buttons'), local = button('Export locally', 'secondary'), submit = button('Export', 'primary'); local.disabled = blocked; submit.disabled = blocked; buttons.append(local, submit); section.append(target, buttons);
  const advanced = el('details', null, 'export-advanced'), force = button('Force re-import', 'danger--tertiary'); advanced.append(el('summary', 'Advanced'), el('p', 'Replace approved drafts in the configured Market Blaster project.'), force); force.disabled = blocked; section.append(advanced); container.append(section);
  const history = el('section', null, 'surface export-history'), content = el('div'); history.append(el('h2', 'Export history'), content);
  const parts = project.slug.split('/').map(encodeURIComponent), path = `/api/campaigns/${parts[0]}/${parts[1]}/exports`;
  async function load() {
    try {
      const entries = await api(path); if (!history.isConnected) return; content.replaceChildren(); if (!entries.length) { content.append(el('p', 'No exports yet.', 'muted')); return; }
      const scroll = el('div', null, 'table-scroll'), table = el('table', null, 'overview-table'), head = el('thead'), hr = el('tr'), body = el('tbody'); for (const label of ['Time', 'Kind', 'Size', 'Target', '']) hr.append(el('th', label)); head.append(hr);
      for (const entry of entries) { const row = el('tr'), action = el('td'); row.append(el('td', new Date(entry.time).toLocaleString()), el('td', entry.kind), el('td', entry.size < 1024 ? `${entry.size} bytes` : `${(entry.size / 1024).toFixed(1)} KB`), el('td', entry.target || 'Local')); if (entry.kind === 'zip') { const link = el('a', 'Download'); link.href = `${path}/${encodeURIComponent(entry.name)}`; link.setAttribute('download', ''); action.append(link); } else action.textContent = 'Directory'; row.append(action); body.append(row); } table.append(head, body); scroll.append(table); content.append(scroll);
    } catch (error) { content.replaceChildren(el('p', `Could not load export history: ${error.message}`, 'form-error')); }
  }
  const summary = el('section', null, 'surface export-summary'); summary.hidden = true; container.append(summary);
  const run = jobRegion(container, ctx, { operation: 'export', onComplete: job => {
    summary.hidden = true;
    if (job.state === 'succeeded') {
      const manual = project.posts.filter(post => project.platforms?.[post.platform]?.delivery === 'manual');
      summary.replaceChildren(el('h2', 'Handoff folders written'));
      if (manual.length) {
        const folders = el('ul'); for (const post of manual) folders.append(el('li', `handoff/${post.platform}/`)); summary.append(el('p', 'In the campaign ZIP:'), folders);
        const mark = el('a', 'Mark published'); mark.href = `#/p/${parts.join('/')}/actions?start=mark`; summary.append(el('p', 'After publishing manually, record the published URL:'), mark);
      } else summary.append(el('p', 'No manual handoff folders were written.'));
      summary.hidden = false;
    }
    return load();
  } }); container.append(history);
  function args() { const value = target.value?.trim(); if (value && !value.startsWith('/') && !value.startsWith('~/')) { target.setAttribute('invalid', ''); target.setAttribute('invalid-text', 'Use an absolute path or a path beginning with ~/.'); target.focus(); return null; } target.removeAttribute('invalid'); return value ? { mb: value } : {}; }
  target.addEventListener('input', () => target.removeAttribute('invalid'));
  submit.addEventListener('click', () => { const options = args(); if (options) { summary.hidden = true; run('export', options); } });
  local.addEventListener('click', () => { summary.hidden = true; run('export', { local: true }); });
  force.addEventListener('click', () => { const options = args(); if (options) openForm('Force re-import', 'This replaces approved drafts in Market Blaster. Only continue if you intend to overwrite those drafts.', [], 'Force re-import', () => { summary.hidden = true; return run('export', { ...options, force: true }); }, 'danger'); });
  const refresh = button('Refresh history', 'ghost'); refresh.addEventListener('click', load); history.append(refresh); content.append(el('p', 'Loading export history…', 'muted')); load();
}
