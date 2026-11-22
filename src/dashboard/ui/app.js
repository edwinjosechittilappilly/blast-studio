import '@carbon/web-components/es/components/button/index.js';
import '@carbon/web-components/es/components/tag/index.js';
import '@carbon/web-components/es/components/tabs/index.js';
import '@carbon/web-components/es/components/tile/index.js';
import '@carbon/web-components/es/components/modal/index.js';
import '@carbon/web-components/es/components/textarea/index.js';
import '@carbon/web-components/es/components/data-table/index.js';
import '@carbon/web-components/es/components/notification/index.js';
import '@carbon/web-components/es/components/overflow-menu/index.js';
import { renderMarkdown } from '../static/markdown.js';
import { el, button, verdictTag as baseVerdictTag, copyButton, scoreMeter, selfReview, rubricTable, gateList, hookComparison } from './components/review.js';
import { mediaGallery } from './components/media.js';
import { api, headers, campaignPath, startFeedbackJob, feedbackJobStatus } from './components/api.js';
const $ = s => document.querySelector(s);
let timer, searchTimer, activeProject = null, activeTab = 'overview';
const feedbackDrafts = new Map();
window.addEventListener('session-expired', () => { clearTimeout(timer); activeProject = null; show('expired'); document.title = 'Session expired – Blast Studio'; });
function message(text) { $('#message').textContent = text; }
function toast(text, failed = false) { const notice = el('cds-toast-notification', null, 'job-toast'); notice.setAttribute('kind', failed ? 'error' : 'success'); notice.setAttribute('timeout', '5000'); const title = el('span', text); title.slot = 'title'; notice.append(title); notice.addEventListener('cds-notification-closed', () => notice.remove()); document.body.append(notice); setTimeout(() => notice.remove(), 5000); }
function show(view) { document.querySelectorAll('.view').forEach(n => { n.hidden = n.id !== view; }); document.querySelectorAll('.shell-nav a').forEach(n => n.classList.toggle('active', n.dataset.view === (['project', 'not-found'].includes(view) ? 'projects' : view))); }
const displayName = name => ({ linkedin: 'LinkedIn', devto: 'DEV', x: 'X', hashnode: 'Hashnode', 'github-discussion': 'GitHub Discussions' }[name] || name);
function verdictTag(review) { const tag = baseVerdictTag(review); if (review?.verdict === 'revise') tag.setAttribute('type', 'warm-gray'); return tag; }
const campaignRoute = slug => `#/p/${slug.split('/').map(encodeURIComponent).join('/')}`;
function formatMoney(value) { return `$${Number(value).toFixed(2)}`; }
const dark = matchMedia('(prefers-color-scheme: dark)'); function theme() { document.body.classList.toggle('cds--g100', dark.matches); document.body.classList.toggle('cds--g10', !dark.matches); } dark.addEventListener('change', theme); theme();
async function library() {
  const target = $('#project-list'), query = $('#search').value;
  target.replaceChildren(el('p', 'Loading projects…', 'empty'));
  let projects;
  try { projects = await api(`/api/library?q=${encodeURIComponent(query)}`); }
  catch (error) {
    if (error.message === 'Session expired') return;
    const box = el('div', null, 'surface'); box.append(el('h2', 'Unable to load projects'), el('p', 'Check that your studio is available and try again.'));
    const details = el('details'); details.append(el('summary', 'Error details'), el('p', error.message)); const retry = button('Try again', 'secondary'); retry.addEventListener('click', library); box.append(details, retry); target.replaceChildren(box); return;
  }
  if (query !== $('#search').value) return;
  target.replaceChildren(); $('#project-count').textContent = `${projects.length} campaigns`;
  if (!projects.length) {
    const empty = el('div', null, 'surface empty'); empty.append(el('h2', query ? `No projects match “${query}”` : 'No projects yet'));
    if (query) { const clear = button('Clear search', 'secondary'); clear.addEventListener('click', () => { $('#search').value = ''; history.replaceState(null, '', '#/projects'); library(); }); empty.append(clear); }
    else empty.append(el('p', 'Create a project and its first campaign from the command line.'), el('code', 'bstudio new <project>/<campaign>'));
    target.append(empty); return;
  }
  const table = el('cds-table'), head = el('cds-table-head'), hr = el('cds-table-header-row'), body = el('cds-table-body'); let direction = -1, current = 'Updated';
  const value = (p, key) => key === 'Project' ? p.slug.split('/')[0] : key === 'Campaign' ? p.slug.split('/')[1] : key === 'Updated' ? p.updatedAt || '' : key === 'Review status' ? p.reviews.map(r => r.verdict).join(', ') : `${p.exported ? 'Exported' : 'Not exported'} · ${Object.keys(p.published || {}).length} published`;
  function render() {
    for (const cell of hr.children) { cell.removeAttribute('aria-sort'); if (cell.dataset.sort === current) cell.setAttribute('aria-sort', direction === 1 ? 'ascending' : 'descending'); }
    body.replaceChildren(); projects.sort((a, b) => direction * String(value(a, current)).localeCompare(String(value(b, current))));
    for (const project of projects) {
      const row = el('cds-table-row'), link = el('a', project.slug.split('/')[1]); link.href = `${campaignRoute(project.slug)}/overview`;
      const projectCell = el('cds-table-cell', project.slug.split('/')[0]), campaignCell = el('cds-table-cell'); campaignCell.append(link);
      const counts = ['blocked', 'revise', 'pass'].map(status => { const n = project.reviews.filter(r => r.verdict === status).length; return n ? `${n} ${status}` : ''; }).filter(Boolean);
      if (project.pendingFeedback != null) counts.push(`${project.pendingFeedback} pending`);
      row.append(projectCell, campaignCell, el('cds-table-cell', counts.join(' · ') || 'Unreviewed'), el('cds-table-cell', project.updatedAt ? new Date(project.updatedAt).toLocaleDateString() : '—'), el('cds-table-cell', value(project, 'Export / published')));
      row.classList.add('clickable-row'); row.addEventListener('click', event => { if (!event.target.closest('a')) location.hash = link.hash; }); body.append(row);
    }
  }
  for (const text of ['Project', 'Campaign', 'Review status', 'Updated', 'Export / published']) { const cell = el('cds-table-header-cell'), control = el('button', text, 'sort-button'); cell.dataset.sort = text; control.setAttribute('aria-label', `Sort by ${text}`); control.addEventListener('click', () => { direction = current === text ? -direction : 1; current = text; render(); }); cell.append(control); hr.append(cell); }
  head.append(hr); table.append(head, body); render(); target.append(table);
}
function feedbackHistory(project, target) {
  const entries = project.feedback.filter(e => target.platform ? e.target.platform === target.platform : target.asset ? e.target.asset === target.asset : true), section = el('section', null, 'feedback-history');
  if (!entries.length) return section; const details = el('details'); details.append(el('summary', `Feedback history (${entries.length})`));
  for (const entry of entries) { const row = el('div', null, 'history-entry'); row.append(el('strong', `${entry.status[0].toUpperCase() + entry.status.slice(1)} · ${new Date(entry.at).toLocaleString()}`), el('p', entry.note)); if (entry.rejectedReason) row.append(el('p', `Reason: ${entry.rejectedReason}`)); details.append(row); } section.append(details); return section;
}
function feedbackForm(project, target) {
  const section = el('section', null, 'feedback-form'), field = el('cds-textarea'), name = target.platform ? `${displayName(target.platform)} post` : target.asset || 'campaign'; const label = el('span', `Feedback for ${name}`); label.slot = 'label-text'; field.append(label); field.setAttribute('rows', '4'); field.setAttribute('maxlength', '4000'); field.setAttribute('enable-counter', ''); field.setAttribute('max-count', '4000'); field.setAttribute('invalid-text', 'Enter feedback before submitting.');
  const key = JSON.stringify([project.slug, target.platform || null, target.asset || null]); field.value = feedbackDrafts.get(key) || '';
  const error = el('p', null, 'form-error'); error.setAttribute('role', 'alert');
  field.addEventListener('input', () => { feedbackDrafts.set(key, field.value); field.removeAttribute('invalid'); error.textContent = ''; });
  const actions = el('div', null, 'form-actions'), submit = button('Add feedback', 'secondary'); actions.append(submit); let history = feedbackHistory(project, target); section.append(el('p', 'Feedback is queued until you apply it.', 'muted'), field, error, actions, history);
  submit.addEventListener('click', async () => {
    const draft = field.value, note = draft?.trim();
    if (!note) { field.setAttribute('invalid', ''); field.focus(); return; }
    submit.disabled = true; error.textContent = '';
    try {
      const entry = await api(campaignPath(project.slug, 'feedback'), { method: 'POST', headers, body: JSON.stringify({ target, note }) });
      project.feedback.push(entry); if (feedbackDrafts.get(key) === draft) { feedbackDrafts.delete(key); field.value = ''; }
      const next = feedbackHistory(project, target); history.replaceWith(next); history = next; history.querySelector('details')?.setAttribute('open', '');
      const apply = $('#apply-feedback'); if (apply) { const count = project.feedback.filter(e => e.status === 'pending').length; apply.disabled = false; apply.textContent = `Apply ${count} feedback ${count === 1 ? 'item' : 'items'}`; $('#apply-reason').textContent = ''; }
      toast('Feedback queued. Use Apply feedback when ready.');
    } catch (failure) { error.textContent = failure.message; } finally { submit.disabled = false; }
  });
  return section;
}
async function jobStatus(project, region, apply) {
  const status = await feedbackJobStatus(project.slug); if (activeProject !== project.slug || $('#project').hidden || !region.isConnected) return;
  const state = status.staleLock ? 'stale' : status.running ? 'running' : status.exitCode == null ? 'idle' : status.exitCode === 0 ? 'success' : 'failure';
  if (region.dataset.state !== state) { const announcement = region.querySelector('.job-announcement'); announcement.replaceChildren(); if (state !== 'idle') { const notification = el('cds-inline-notification'); notification.setAttribute('kind', state === 'stale' || state === 'failure' ? 'error' : state === 'running' ? 'info' : 'success'); notification.setAttribute('hide-close-button', ''); notification.setAttribute('title', state === 'stale' ? 'Stale revision lock. Confirm no revision is running before removing the lock.' : state === 'running' ? 'Applying feedback…' : state === 'success' ? 'Revision completed' : `Revision failed (${status.exitCode}). Review the log and retry.`); announcement.append(notification); } region.dataset.state = state; }
  const log = region.querySelector('.job-log'); if (log.textContent !== status.lines.join('\n')) log.textContent = status.lines.join('\n'); log.parentElement.hidden = !status.lines.length;
  apply.disabled = status.running || status.staleLock || !project.feedback.some(entry => entry.status === 'pending');
  if (status.running) { region.dataset.running = 'yes'; scheduleStatus(project, region, apply); }
  else if (region.dataset.running === 'yes') { region.dataset.running = ''; toast(status.exitCode === 0 ? 'Revision completed. Review the updated campaign.' : 'Revision failed. Review the log and retry.', status.exitCode !== 0); }
}
function scheduleStatus(project, region, apply) {
  timer = setTimeout(() => {
    if (activeProject !== project.slug || $('#project').hidden || !region.isConnected) return;
    return jobStatus(project, region, apply).catch(error => {
      if (activeProject !== project.slug || $('#project').hidden || !region.isConnected) return;
      message(error.message); scheduleStatus(project, region, apply);
    });
  }, 3000);
}
function platformPanel(project, post) {
  const review = project.reviews.find(r => r.platform === post.platform), panel = el('div', null, 'platform-grid'), left = el('section', null, 'surface post-panel'), right = el('section', null, 'surface reviewer-panel');
  const titleRow = el('div', null, 'section-title'); titleRow.append(el('h2', post.title || `${project.platforms?.[post.platform]?.name || displayName(post.platform)} post`)); left.append(titleRow); const limit = project.platforms?.[post.platform]?.textLimit; left.append(el('p', `${[...post.body].length} characters${typeof limit?.value === 'number' ? ` / ${limit.value}` : ''}`, 'muted'));
  const markdownPlatforms = new Set(['devto', 'hashnode', 'gist', 'github-discussion', 'medium', 'substack', 'newsletter']), body = el('div', null, markdownPlatforms.has(post.platform) ? 'markdown' : 'plain-post');
  if (markdownPlatforms.has(post.platform)) body.append(renderMarkdown(post.body, document)); else body.textContent = post.body;
  const thread = Array.isArray(post.thread) ? post.thread : [];
  const toolbar = el('div', null, 'copy-toolbar'); if (post.title) toolbar.append(copyButton('Copy title', post.title)); toolbar.append(copyButton('Copy post text', post.body)); left.append(toolbar, body);
  if (thread.length) { const list = el('ol', null, 'thread'); for (const [index, text] of thread.entries()) { const item = el('li'); item.append(el('h3', `Thread post ${index + 2}`), el('div', text, 'plain-post'), copyButton(`Copy thread post ${index + 2}`, text)); list.append(item); } left.append(list); }
  toolbar.append(copyButton('Copy all', [post.title, [post.body, ...thread].join('\n\n---\n\n')].filter(Boolean).join('\n\n')));
  if (post.media.length) { left.append(el('h3', 'Media'), mediaGallery(project.slug, post.media, project.captions)); }
  left.append(feedbackForm(project, { platform: post.platform }));
  const heading = el('div', null, 'section-title'); heading.append(el('h2', 'Independent review'), verdictTag(review)); right.append(heading);
  if (review) { const failed = (review.gates || []).filter(g => !g.pass); if (failed.length) { const notice = el('cds-inline-notification'); notice.setAttribute('kind', 'error'); notice.setAttribute('hide-close-button', ''); notice.setAttribute('title', `Blocked: ${failed.length} gate${failed.length === 1 ? '' : 's'} failed — ${failed.map(g => `${g.id}${g.message ? ': ' + g.message : ''}`).join('; ')}`); right.append(notice); } right.append(scoreMeter(review, project.threshold), el('h3', 'Gates'), gateList(review.gates)); if (review.warnings?.length) { const details = el('details'); details.open = review.verdict !== 'pass'; details.append(el('summary', `Warnings (${review.warnings.length})`)); const list = el('ul'); review.warnings.forEach(w => list.append(el('li', w))); details.append(list); right.append(details); } right.append(el('h3', 'Rubric'), rubricTable(project.rubric[post.platform] || [], review.scores || [], failed.length > 0)); }
  else right.append(el('p', 'No independent review yet.', 'muted'));
  const hooks = project.plan.find(p => p.platform === post.platform)?.hooks || []; if (hooks.length || review?.hookComparisons?.length) right.append(hookComparison(hooks, review?.hookComparisons)); right.append(selfReview(post.selfReview)); panel.append(left, right); return panel;
}
function assetsPanel(project) {
  const section = el('section', null, 'surface');
  if (!project.assets.length) { section.append(el('h2', 'No assets yet'), el('p', 'Generate assets for this campaign from the command line.'), el('code', `bstudio make ${project.slug}`)); return section; }
  for (const asset of project.assets) {
    const details = el('details', null, 'asset-row'), summary = el('summary', `${asset.id} · ${asset.kind} · ${(asset.outputs || []).length} outputs · ${(asset.blockers || []).length} blockers`); details.append(summary);
    const metadata = el('dl', null, 'asset-metadata'); for (const [key, value] of [['AI generated', asset.aiGenerated ? 'Yes' : 'No'], ['Cost', asset.costUsd == null ? '—' : formatMoney(asset.costUsd)]]) metadata.append(el('dt', key), el('dd', value)); details.append(metadata);
    if (asset.blockers?.length) { const warning = el('div', null, 'form-error'); warning.append(el('strong', 'Blockers'), ...asset.blockers.map(blocker => el('p', typeof blocker === 'string' ? blocker : JSON.stringify(blocker)))); details.append(warning); }
    const items = (asset.outputs || []).map(output => ({ ...output, file: `assets/${asset.id}/${output.file}`, alt: '' }));
    details.append(mediaGallery(project.slug, items, project.captions), selfReview(asset.selfReview), feedbackForm(project, { asset: asset.id })); section.append(details);
  }
  return section;
}
function overviewPanel(project) {
  const section = el('section', null, 'surface'), tiles = el('div', null, 'summary-tiles'); section.append(el('h2', 'Campaign summary'));
  for (const [label, value] of [['Pending feedback', project.feedback.filter(e => e.status === 'pending').length], ['Ready', project.reviews.filter(r => r.verdict === 'pass').length], ['Published', Object.keys(project.published || {}).length], ['Export', project.exported ? 'Available' : 'Not exported']]) { const tile = el('div'); tile.append(el('strong', String(value)), el('span', label)); tiles.append(tile); } section.append(tiles);
  const table = el('table', null, 'overview-table'), head = el('thead'), header = el('tr'); for (const name of ['Destination', 'Status', 'Score', 'Failed gates', 'Pending feedback', 'Last reviewed']) header.append(el('th', name)); head.append(header); const body = el('tbody');
  for (const post of project.posts) { const review = project.reviews.find(r => r.platform === post.platform), row = el('tr'), cell = el('td'), link = el('a', displayName(post.platform)); link.href = `${campaignRoute(project.slug)}/${encodeURIComponent(post.platform)}`; cell.append(link); const status = el('td'); status.append(verdictTag(review)); row.append(cell, status, el('td', review?.total == null ? '—' : String(review.total)), el('td', String((review?.gates || []).filter(g => !g.pass).length)), el('td', String(project.feedback.filter(e => e.status === 'pending' && e.target.platform === post.platform).length)), el('td', review?.at ? new Date(review.at).toLocaleDateString() : '—')); body.append(row); }
  table.append(head, body); const scroll = el('div', null, 'table-scroll'); scroll.append(table); section.append(scroll, feedbackHistory(project, {})); return section;
}
async function openProject(slug, requested = 'overview') {
  clearTimeout(timer); activeProject = slug; const project = await api(`/api/project/${encodeURIComponent(slug)}`); if (activeProject !== slug) return;
  const container = $('#project-detail'); container.replaceChildren(); const crumb = el('nav', null, 'breadcrumb'); crumb.setAttribute('aria-label', 'Breadcrumb'); const back = el('a', 'Projects'), projectLink = el('a', slug.split('/')[0]); back.href = '#/projects'; projectLink.href = `#/p/${encodeURIComponent(slug.split('/')[0])}`; crumb.append(back, document.createTextNode(' / '), projectLink, document.createTextNode(` / ${slug.split('/')[1]}`)); container.append(crumb);
  const top = el('div', null, 'page-heading'), title = el('div'), actions = el('div'); title.append(el('h1', slug.split('/')[1]), el('p', project.inputs.join(' · ') || `Campaign in ${slug.split('/')[0]}`)); const count = project.feedback.filter(e => e.status === 'pending').length, apply = button(`Apply ${count} feedback ${count === 1 ? 'item' : 'items'}`, 'primary'), reason = el('p', count ? '' : 'No pending feedback', 'muted'); apply.id = 'apply-feedback'; reason.id = 'apply-reason'; apply.setAttribute('aria-describedby', 'apply-reason'); apply.disabled = true; actions.append(apply, reason); top.append(title, actions); container.append(top);
  const job = el('div', null, 'job-status'), announcement = el('div', null, 'job-announcement'), logDetails = el('details'), log = el('pre', null, 'job-log'); announcement.setAttribute('role', 'status'); announcement.setAttribute('aria-live', 'polite'); logDetails.hidden = true; logDetails.append(el('summary', 'Revision log'), log); job.append(announcement, logDetails); actions.append(job); apply.addEventListener('click', async () => { apply.disabled = true; try { await startFeedbackJob(slug); job.dataset.running = 'yes'; await jobStatus(project, job, apply); } catch (error) { announcement.textContent = error.message; apply.disabled = false; } });
  const tabs = el('cds-tabs'); tabs.setAttribute('type', 'contained'); const panel = el('div', null, 'tab-content'), options = ['overview', ...project.posts.map(p => p.platform), 'assets']; activeTab = options.includes(requested) ? requested : 'overview';
  panel.setAttribute('role', 'tabpanel');
  function select(name) { activeTab = name; panel.setAttribute('aria-labelledby', `tab-${name}`); panel.replaceChildren(name === 'overview' ? overviewPanel(project) : name === 'assets' ? assetsPanel(project) : platformPanel(project, project.posts.find(p => p.platform === name))); }
  for (const name of options) { const review = project.reviews.find(r => r.platform === name), tab = el('cds-tab', name === 'overview' ? 'Overview' : name === 'assets' ? 'Assets' : `${project.platforms?.[name]?.name || displayName(name)} · ${review?.verdict || 'unreviewed'}`); tab.id = `tab-${name}`; tab.value = name; if (name === activeTab) tab.setAttribute('selected', ''); tabs.append(tab); }
  tabs.addEventListener('cds-tabs-selected', event => { const name = event.detail.item.value; select(name); history.replaceState(null, '', `${campaignRoute(slug)}/${encodeURIComponent(name)}`); }); select(activeTab); container.append(tabs, panel); show('project'); await jobStatus(project, job, apply);
}
async function settings() {
  const data = await api('/api/budget'), form = $('#settings-form'), spend = $('#spend'); spend.replaceChildren(); spend.className = 'summary-tiles';
  for (const [label, value] of [['Spent this month', formatMoney(data.mtd)], ['Monthly cap', formatMoney(data.cap)], ...Object.entries(data.projects || {}).map(([name, value]) => [`${name} spend`, formatMoney(value)])]) { const tile = el('div'); tile.append(el('strong', value), el('span', label)); spend.append(tile); }
  form.elements.monthlyUsd.value = data.cap; form.elements.perProjectUsd.value = data.perProject; form.elements.images.value = data.providers.images; form.elements.voice.value = data.providers.voice;
  const totals = $('#provider-totals'); totals.replaceChildren(el('h3', 'Spend by provider')); for (const [name, value] of Object.entries(data.providerTotals)) totals.append(el('p', `${name}: ${formatMoney(value)}`));
}
async function sources() {
  const data = await api('/api/sources'), target = $('#source-detail'); target.replaceChildren(el('h2', `Last checked: ${data.lastCheck || 'Never'}`), el('p', 'Unverified sources need a manual review before relying on their guidance.'), el('p', 'Check sources again:'), el('code', 'bstudio sources check --write'));
  for (const key of ['changed', 'failed', 'unverified']) { const details = el('details'); details.append(el('summary', `${key[0].toUpperCase() + key.slice(1)} (${data[key].length})`)); const list = el('ul'); for (const item of data[key]) list.append(el('li', item.replace(/^##\s*/, ''))); details.append(list); target.append(details); }
}
async function route(focus = true) {
  clearTimeout(timer); message(''); const [path, search = ''] = location.hash.slice(1).split('?'), parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  $('#workspace-nav').classList.remove('open'); $('#nav-toggle').setAttribute('aria-expanded', 'false');
  try {
    if (parts[0] === 'p' && parts[1] && parts[2]) { await openProject(`${parts[1]}/${parts[2]}`, parts[3]); }
    else { activeProject = null; const view = ['settings', 'sources', 'doctor'].includes(parts[0]) ? parts[0] : 'projects'; show(view); if (view === 'projects') { $('#search').value = parts[0] === 'p' ? parts[1] : new URLSearchParams(search).get('q') || ''; await library(); } else if (view === 'settings') await settings(); else if (view === 'sources') await sources(); }
  } catch (error) { if (error.message === 'Session expired') return; if (error.status === 404) show('not-found'); else message(error.message); }
  const heading = document.querySelector('.view:not([hidden]) h1'); if (heading) { document.title = `${heading.textContent} – Blast Studio`; if (focus) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); } }
}
window.addEventListener('hashchange', route); $('#search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { const query = $('#search').value; history.replaceState(null, '', `#/projects${query ? '?q=' + encodeURIComponent(query) : ''}`); library(); }, 250); });
$('#nav-toggle').addEventListener('click', () => { const open = $('#workspace-nav').classList.toggle('open'); $('#nav-toggle').setAttribute('aria-expanded', String(open)); $('#nav-toggle').setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation'); });
$('#settings-form').addEventListener('input', () => { $('#settings-result').textContent = ''; });
$('#settings-form').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget, result = $('#settings-result'), values = Object.fromEntries(new FormData(form));
  for (const name of ['monthlyUsd', 'perProjectUsd']) { const input = form.elements[name]; if (input.value === '' || !Number.isFinite(Number(input.value)) || Number(input.value) < 0) { input.setAttribute('aria-invalid', 'true'); result.textContent = 'Enter a non-negative amount for each budget.'; input.focus(); return; } input.removeAttribute('aria-invalid'); }
  try { await api('/api/budget', { method: 'PUT', headers, body: JSON.stringify({ monthlyUsd: Number(values.monthlyUsd), perProjectUsd: Number(values.perProjectUsd) }) }); await api('/api/providers', { method: 'PUT', headers, body: JSON.stringify({ images: values.images, voice: values.voice }) }); result.textContent = 'Settings saved.'; await settings(); } catch (error) { result.textContent = `Could not save all settings: ${error.message}`; }
});
route(false).catch(error => message(error.message));
