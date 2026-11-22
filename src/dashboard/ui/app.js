import '@carbon/web-components/es/components/button/index.js';
import '@carbon/web-components/es/components/tag/index.js';
import '@carbon/web-components/es/components/tabs/index.js';
import '@carbon/web-components/es/components/tile/index.js';
import '@carbon/web-components/es/components/progress-bar/index.js';
import '@carbon/web-components/es/components/modal/index.js';
import '@carbon/web-components/es/components/textarea/index.js';
import '@carbon/web-components/es/components/data-table/index.js';
import '@carbon/web-components/es/components/notification/index.js';
import '@carbon/web-components/es/components/copy-button/index.js';
import { renderMarkdown } from '../static/markdown.js';
import { el, button, verdictTag, copyButton, scoreMeter, selfReview, rubricTable, gateList, hookComparison } from './components/review.js';
import { mediaGallery } from './components/media.js';
const $ = s => document.querySelector(s), headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'bstudio' };
let timer, activeProject = null, activeTab = 'overview';
async function api(path, options) { const response = await fetch(path, options), data = await response.json(); if (!response.ok) throw new Error(data.error || 'Request failed'); return data; }
function message(text) { $('#message').textContent = text; }
function show(view) { document.querySelectorAll('.view').forEach(n => { n.hidden = n.id !== view; }); document.querySelectorAll('.shell-nav a').forEach(n => n.classList.toggle('active', n.dataset.view === (view === 'project' ? 'projects' : view))); }
function formatMoney(value) { return `$${Number(value).toFixed(2)}`; }
const dark = matchMedia('(prefers-color-scheme: dark)'); function theme() { document.body.classList.toggle('cds--g100', dark.matches); document.body.classList.toggle('cds--g10', !dark.matches); } dark.addEventListener('change', theme); theme();
async function library() {
  const projects = await api(`/api/library?q=${encodeURIComponent($('#search').value)}`), target = $('#project-list'); target.replaceChildren();
  if (!projects.length) { target.append(el('p', 'No projects found. Create one with bstudio new, or try another search.', 'empty')); return; }
  const table = el('cds-table'), head = el('cds-table-head'), hr = el('cds-table-header-row'), body = el('cds-table-body'); let direction = 1, current = 'Project';
  function render() {
    body.replaceChildren(); const value = (p, key) => key === 'Project' ? p.slug : key === 'Assets' ? p.assets.length : p.posts.map(post => post.platform).join(', ');
    projects.sort((a, b) => { const x = value(a, current), y = value(b, current); return direction * (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))); });
    for (const project of projects) { const row = el('cds-table-row'), cell = el('cds-table-cell'), link = el('a', project.slug); link.href = `#/p/${encodeURIComponent(project.slug)}/overview`; cell.append(link, el('div', project.inputs.join(' · ') || 'No brief inputs', 'muted')); row.append(cell, el('cds-table-cell', project.posts.map(p => p.platform).join(', ') || 'No posts'), el('cds-table-cell', String(project.assets.length))); body.append(row); }
  }
  for (const text of ['Project', 'Destinations', 'Assets']) { const cell = el('cds-table-header-cell'), control = el('button', text, 'sort-button'); control.setAttribute('aria-label', `Sort by ${text}`); control.addEventListener('click', () => { direction = current === text ? -direction : 1; current = text; render(); }); cell.append(control); hr.append(cell); } head.append(hr); table.append(head, body); render(); target.append(table);
}
function feedbackHistory(project, target) {
  const entries = project.feedback.filter(e => e.target.platform === target.platform && e.target.asset === target.asset), section = el('section', null, 'feedback-history');
  if (!entries.length) return section; const details = el('details'); details.append(el('summary', `Feedback history (${entries.length})`));
  for (const entry of entries) { const row = el('div', null, 'history-entry'); row.append(el('strong', `${entry.status[0].toUpperCase() + entry.status.slice(1)} · ${new Date(entry.at).toLocaleString()}`), el('p', entry.note)); if (entry.rejectedReason) row.append(el('p', `Reason: ${entry.rejectedReason}`)); details.append(row); } section.append(details); return section;
}
function feedbackForm(project, target) {
  const section = el('section', null, 'feedback-form'), field = el('cds-textarea'), name = target.platform || target.asset || 'project'; const label = el('span', `Your feedback for ${name}`); label.slot = 'label-text'; field.append(label); field.setAttribute('rows', '4'); field.setAttribute('maxlength', '4000'); field.setAttribute('enable-counter', ''); field.setAttribute('max-count', '4000');
  const actions = el('div', null, 'form-actions'), submit = button('Submit feedback', 'primary'); actions.append(submit); section.append(field, actions, feedbackHistory(project, target));
  submit.addEventListener('click', async () => { const note = field.value?.trim(); if (!note) { message('Enter feedback before submitting.'); field.focus(); return; } submit.disabled = true; try { await api(`/api/projects/${encodeURIComponent(project.slug)}/feedback`, { method: 'POST', headers, body: JSON.stringify({ target, note }) }); await openProject(project.slug, activeTab); message('Feedback saved.'); $('#message').setAttribute('tabindex', '-1'); $('#message').focus(); } catch (error) { message(error.message); submit.disabled = false; } }); return section;
}
async function jobStatus(project, region, apply) {
  const status = await api(`/api/projects/${encodeURIComponent(project.slug)}/status`); if (activeProject !== project.slug || $('#project').hidden) return;
  region.replaceChildren(); const notification = el('cds-inline-notification'); notification.setAttribute('kind', status.running ? 'info' : status.exitCode ? 'error' : 'success'); notification.setAttribute('hide-close-button', ''); notification.setAttribute('title', status.running ? 'Revision running' : status.exitCode == null ? 'No revision running' : status.exitCode === 0 ? 'Revision completed' : `Revision failed (${status.exitCode})`); region.append(notification);
  if (status.lines.length) { const details = el('details'); details.append(el('summary', 'Revision log'), el('pre', status.lines.join('\n'))); region.append(details); }
  apply.disabled = status.running || !project.feedback.some(entry => entry.status === 'pending');
  if (status.running) { region.dataset.running = 'yes'; timer = setTimeout(() => jobStatus(project, region, apply).catch(error => message(error.message)), 3000); }
  else if (region.dataset.running === 'yes') { region.dataset.running = ''; message(status.exitCode === 0 ? 'Revision completed.' : 'Revision failed. Review the log.'); await openProject(project.slug, activeTab); }
}
function platformPanel(project, post) {
  const review = project.reviews.find(r => r.platform === post.platform), panel = el('div', null, 'platform-grid'), left = el('section', null, 'surface post-panel'), right = el('section', null, 'surface reviewer-panel');
  const titleRow = el('div', null, 'section-title'); titleRow.append(el('h2', post.title || post.platform)); if (post.title) titleRow.append(copyButton('Copy title', post.title)); left.append(titleRow);
  const body = el('div', null, 'markdown'); body.append(renderMarkdown(post.body, document)); left.append(body, copyButton('Copy post text', post.body), copyButton('Copy all', [post.title, post.body, ...(post.media || []).map(m => m.alt).filter(Boolean)].filter(Boolean).join('\n\n')));
  if (post.media.length) { left.append(el('h3', 'Media'), mediaGallery(project.slug, post.media, project.captions)); }
  left.append(feedbackForm(project, { platform: post.platform }));
  const heading = el('div', null, 'section-title'); heading.append(el('h2', 'Independent review'), verdictTag(review)); right.append(heading);
  if (review) { right.append(scoreMeter(review, project.threshold), el('h3', 'Gates'), gateList(review.gates)); if (review.warnings?.length) { const details = el('details'); details.append(el('summary', `Warnings (${review.warnings.length})`)); const list = el('ul'); review.warnings.forEach(w => list.append(el('li', w))); details.append(list); right.append(details); } right.append(el('h3', 'Rubric'), rubricTable(project.rubric[post.platform] || [], review.scores || [])); }
  else right.append(el('p', 'No independent review yet.', 'muted'));
  const hooks = project.plan.find(p => p.platform === post.platform)?.hooks || []; if (hooks.length || review?.hookComparisons?.length) right.append(hookComparison(hooks, review?.hookComparisons)); right.append(selfReview(post.selfReview)); panel.append(left, right); return panel;
}
function assetsPanel(project) { const section = el('section'); if (!project.assets.length) section.append(el('p', 'No assets yet.', 'empty')); for (const asset of project.assets) { const card = el('section', null, 'surface asset-panel'); card.append(el('h2', `${asset.id} · ${asset.kind}`), el('p', `${asset.aiGenerated ? 'AI generated' : 'Not AI generated'} · ${asset.costUsd == null ? 'Cost unavailable' : formatMoney(asset.costUsd)}`)); const items = (asset.outputs || []).map(output => ({ file: `assets/${asset.id}/${output.file}`, alt: `${asset.id} preview` })); card.append(mediaGallery(project.slug, items, project.captions), selfReview(asset.selfReview), feedbackForm(project, { asset: asset.id })); section.append(card); } return section; }
function overviewPanel(project) { const section = el('section', null, 'overview-grid'); const summary = el('div', null, 'surface'); const published = Object.keys(project.published || {}).length; summary.append(el('h2', 'Campaign summary'), el('p', `${project.feedback.filter(e => e.status === 'pending').length} pending feedback · ${project.exported ? 'Export available' : 'Not exported'} · ${published} published`)); for (const post of project.posts) { const review = project.reviews.find(r => r.platform === post.platform), row = el('div', null, 'overview-row'), link = el('a', post.platform); link.href = `#/p/${encodeURIComponent(project.slug)}/${encodeURIComponent(post.platform)}`; row.append(link, verdictTag(review), el('span', review?.total == null ? 'N/A' : `${Number(review.total).toFixed(1)} / 100`)); summary.append(row); } summary.append(feedbackHistory(project, {})); section.append(summary); return section; }
async function openProject(slug, requested = 'overview') {
  clearTimeout(timer); activeProject = slug; const project = await api(`/api/project/${encodeURIComponent(slug)}`); if (activeProject !== slug) return;
  const container = $('#project-detail'); container.replaceChildren(); const crumb = el('nav', null, 'breadcrumb'); crumb.setAttribute('aria-label', 'Breadcrumb'); const back = el('a', 'Projects'); back.href = '#/'; crumb.append(back, document.createTextNode(` / ${slug}`)); container.append(crumb);
  const top = el('div', null, 'page-heading'), title = el('div'); title.append(el('h1', slug), el('p', project.inputs.join(' · ') || 'Project overview')); const apply = button('Apply feedback', 'primary'); apply.disabled = true; top.append(title, apply); container.append(top);
  const job = el('div', null, 'job-status'); job.setAttribute('role', 'status'); job.setAttribute('aria-live', 'polite'); apply.addEventListener('click', async () => { apply.disabled = true; try { await api(`/api/projects/${encodeURIComponent(slug)}/revise`, { method: 'POST', headers }); job.dataset.running = 'yes'; await jobStatus(project, job, apply); } catch (error) { message(error.message); apply.disabled = false; } });
  const tabs = el('cds-tabs'); tabs.setAttribute('type', 'contained'); const panel = el('div', null, 'tab-content'), options = ['overview', ...project.posts.map(p => p.platform), 'assets']; activeTab = options.includes(requested) ? requested : 'overview';
  function select(name) { activeTab = name; panel.replaceChildren(name === 'overview' ? overviewPanel(project) : name === 'assets' ? assetsPanel(project) : platformPanel(project, project.posts.find(p => p.platform === name))); }
  for (const name of options) { const review = project.reviews.find(r => r.platform === name), tab = el('cds-tab', name === 'overview' ? 'Overview' : name === 'assets' ? 'Assets' : `${name} · ${review?.verdict || 'unreviewed'}${review?.total == null ? '' : ' ' + Number(review.total).toFixed(1)}`); tab.value = name; if (name === activeTab) tab.setAttribute('selected', ''); tabs.append(tab); }
  tabs.addEventListener('cds-tabs-selected', event => { const name = event.detail.item.value; select(name); history.replaceState(null, '', `#/p/${encodeURIComponent(slug)}/${encodeURIComponent(name)}`); }); select(activeTab); container.append(tabs, panel, job); show('project'); await jobStatus(project, job, apply);
}
async function settings() { const data = await api('/api/budget'); $('#spend').replaceChildren(el('p', `${formatMoney(data.mtd)} of ${formatMoney(data.cap)} spent this month`)); $('#budget-form').elements.monthlyUsd.value = data.cap; $('#budget-form').elements.perProjectUsd.value = data.perProject; $('#providers-form').elements.images.value = data.providers.images; $('#providers-form').elements.voice.value = data.providers.voice; const totals = $('#provider-totals'); totals.replaceChildren(); for (const [name, value] of Object.entries(data.providerTotals)) totals.append(el('p', `${name}: ${formatMoney(value)}`)); }
async function sources() { const data = await api('/api/sources'), target = $('#source-detail'); target.replaceChildren(el('h2', `Last checked: ${data.lastCheck || 'Never'}`)); for (const key of ['changed', 'failed', 'unverified']) target.append(el('h3', key), el('p', data[key].join('\n') || 'None reported')); }
async function route() { clearTimeout(timer); const parts = location.hash.slice(1).split('/').filter(Boolean).map(decodeURIComponent); if (parts[0] === 'p' && parts[1]) { await openProject(parts[1], parts[2]); return; } activeProject = null; const view = ['settings', 'sources', 'doctor'].includes(parts[0]) ? parts[0] : 'projects'; show(view); if (view === 'projects') await library(); else if (view === 'settings') await settings(); else if (view === 'sources') await sources(); }
window.addEventListener('hashchange', () => route().catch(error => message(error.message))); $('#search').addEventListener('input', () => { if (location.hash !== '#/' && location.hash !== '') location.hash = '#/'; else library().catch(error => message(error.message)); });
for (const [id, path] of [['budget-form', '/api/budget'], ['providers-form', '/api/providers']]) $(`#${id}`).addEventListener('submit', async event => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); if (id === 'budget-form') { values.monthlyUsd = Number(values.monthlyUsd); values.perProjectUsd = Number(values.perProjectUsd); } try { await api(path, { method: 'PUT', headers, body: JSON.stringify(values) }); message('Settings saved.'); await settings(); } catch (error) { message(error.message); } });
route().catch(error => message(error.message));
