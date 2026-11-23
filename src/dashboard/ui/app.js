import '@carbon/web-components/es/components/button/index.js';
import '@carbon/web-components/es/components/tag/index.js';
import '@carbon/web-components/es/components/tabs/index.js';
import '@carbon/web-components/es/components/tile/index.js';
import '@carbon/web-components/es/components/modal/index.js';
import '@carbon/web-components/es/components/textarea/index.js';
import '@carbon/web-components/es/components/data-table/index.js';
import '@carbon/web-components/es/components/notification/index.js';
import '@carbon/web-components/es/components/overflow-menu/index.js';
import CheckmarkFilled16 from '@carbon/icons/es/checkmark--filled/16.js';
import WarningFilled16 from '@carbon/icons/es/warning--filled/16.js';
import ErrorFilled16 from '@carbon/icons/es/error--filled/16.js';
import { renderMarkdown } from '../static/markdown.js';
import { el, button, verdictTag as baseVerdictTag, copyButton, scoreMeter, selfReview, rubricTable, gateList, hookComparison } from './components/review.js';
import { mediaGallery } from './components/media.js';
import { api, headers, campaignPath, startFeedbackJob, cancelFeedbackJob, feedbackJobStatus } from './components/api.js';
import { setupShell } from './components/shell.js';
import { renderNewProject, renderNewCampaign } from './components/create.js';
import { renderActions, renderAssetsTable } from './components/actions.js';
import { renderExport } from './components/export.js';
import { renderBlockers } from './components/blockers.js';
import { renderFeedbackHistory } from './components/feedback.js';
import { renderSettings, renderSources } from './components/settings.js';
import { renderHealth } from './components/health.js';
const $ = s => document.querySelector(s);
let timer, searchTimer, tabObserver, activeProject = null, activeTab = 'overview', navigation = 0, projectLoad = 0, libraryLoad = 0;
const feedbackDrafts = new Map(), dismissedJobFailures = new Set(JSON.parse(sessionStorage.getItem('dismissedJobFailures') || '[]'));
const shell = setupShell();
window.addEventListener('session-expired', () => { clearTimeout(timer); navigation++; projectLoad++; libraryLoad++; activeProject = null; show('expired'); document.title = 'Session expired – Blast Studio'; });
function message(text) { $('#message').textContent = text; }
function toast(text, kind = 'success') { if (kind === true) kind = 'error'; if (kind === false) kind = 'success'; const notice = el('cds-toast-notification', null, 'job-toast'); notice.setAttribute('kind', kind); if (kind !== 'error') notice.setAttribute('timeout', '5000'); const title = el('span', text); title.slot = 'title'; notice.append(title); notice.addEventListener('cds-notification-closed', () => notice.remove()); document.body.append(notice); if (kind !== 'error') setTimeout(() => notice.remove(), 5000); }
function show(view) { document.querySelectorAll('.view').forEach(n => { n.hidden = n.id !== view; }); shell.setActive(['project', 'not-found'].includes(view) ? 'projects' : view); }
const displayName = name => ({ linkedin: 'LinkedIn', devto: 'DEV', x: 'X', hashnode: 'Hashnode', instagram: 'Instagram', 'github-discussion': 'GitHub Discussions' }[name] || name);
function verdictTag(review) { const tag = baseVerdictTag(review); if (review?.verdict === 'revise') tag.setAttribute('type', 'magenta'); return tag; }
const campaignRoute = slug => `#/p/${slug.split('/').map(encodeURIComponent).join('/')}`;
function commandSnippet(command) { const wrap = el('div', null, 'command-snippet'); wrap.append(el('code', command), copyButton('Copy command', command)); return wrap; }
function tabStatusIcon(verdict) {
  const descriptor = verdict === 'pass' || verdict === 'accepted' ? CheckmarkFilled16 : verdict === 'revise' ? WarningFilled16 : verdict === 'blocked' ? ErrorFilled16 : null;
  if (!descriptor) return null; const svg = document.createElementNS('http://www.w3.org/2000/svg', descriptor.elem);
  for (const [key, value] of Object.entries(descriptor.attrs)) svg.setAttribute(key, String(value)); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('class', `tab-status tab-status-${verdict}`);
  for (const part of descriptor.content) { const node = document.createElementNS('http://www.w3.org/2000/svg', part.elem); for (const [key, value] of Object.entries(part.attrs)) node.setAttribute(key, String(value)); svg.append(node); } return svg;
}
function formatMoney(value) { return `$${Number(value).toFixed(2)}`; }
const dark = matchMedia('(prefers-color-scheme: dark)'); function theme() { document.body.classList.toggle('cds--g100', dark.matches); document.body.classList.toggle('cds--g10', !dark.matches); } dark.addEventListener('change', theme); theme();
async function library() {
  const target = $('#project-list'), query = $('#search').value, load = ++libraryLoad;
  const skeleton = el('cds-table-skeleton'); skeleton.setAttribute('aria-label', 'Loading projects'); target.replaceChildren(skeleton);
  let projects, studioProjects;
  try { [projects, studioProjects] = await Promise.all([api(`/api/library?q=${encodeURIComponent(query)}`), api('/api/projects')]); }
  catch (error) {
    if (error.message === 'Session expired' || load !== libraryLoad || query !== $('#search').value) return;
    const notice = el('cds-inline-notification'); notice.setAttribute('kind', 'error'); notice.setAttribute('title', 'Unable to load projects'); notice.setAttribute('subtitle', 'Check that your studio is available and try again.'); notice.setAttribute('hide-close-button', '');
    const details = el('details'); details.append(el('summary', 'Error details'), el('p', error.message)); const retry = button('Try again', 'secondary'); retry.addEventListener('click', library); notice.append(details, retry); target.replaceChildren(notice); return;
  }
  if (load !== libraryLoad || query !== $('#search').value) return;
  target.replaceChildren(); $('#project-count').textContent = `${projects.length} campaigns`;
  const emptyProjects = studioProjects.filter(project => !project.campaigns.length && (!query || project.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()) || project.id.includes(query.toLocaleLowerCase())));
  if (emptyProjects.length) {
    const section = el('section', null, 'surface empty-projects'); section.append(el('h2', 'Projects without campaigns'));
    const list = el('ul'); for (const project of emptyProjects) { const item = el('li'), link = el('a', project.name); link.href = `#/p/${encodeURIComponent(project.id)}`; item.append(link); list.append(item); } section.append(list); target.append(section);
  }
  if (!projects.length && !emptyProjects.length) {
    const empty = el('div', null, 'surface empty'); empty.append(el('h2', query ? `No projects match “${query}”` : 'No projects yet'));
    if (query) { const clear = button('Clear search', 'secondary'); clear.addEventListener('click', () => { $('#search').value = ''; history.replaceState(null, '', '#/projects'); library(); }); empty.append(clear); }
    else { const link = el('a', 'Create a project'); link.href = '#/projects/new'; empty.append(el('p', 'Create a project and its first campaign to get started.'), link); }
    target.append(empty); return;
  }
  if (!projects.length) return;
  const table = el('cds-table'), head = el('cds-table-head'), hr = el('cds-table-header-row'), body = el('cds-table-body'), cards = el('div', null, 'project-cards'), mobileSort = el('div', null, 'project-sort'), label = el('label', 'Sort campaigns by '), select = el('select'), order = el('button'); let direction = -1, current = 'Updated';
  const value = (p, key) => key === 'Project' ? p.slug.split('/')[0] : key === 'Campaign' ? p.slug.split('/')[1] : key === 'Updated' ? p.updatedAt || '' : key === 'Review status' ? p.reviews.map(r => r.verdict).join(', ') : `${p.exported ? 'Exported' : 'Not exported'} · ${Object.keys(p.published || {}).length} published`;
  function render() {
    for (const cell of hr.children) { const active = cell.dataset.sort === current; cell.sortActive = active; cell.sortDirection = active ? (direction === 1 ? 'ascending' : 'descending') : 'none'; cell.setAttribute('aria-sort', active ? cell.sortDirection : 'none'); }
    select.value = current; order.textContent = direction === 1 ? 'Ascending' : 'Descending'; order.setAttribute('aria-label', `Sort order: ${order.textContent}`);
    body.replaceChildren(); cards.replaceChildren(); projects.sort((a, b) => direction * String(value(a, current)).localeCompare(String(value(b, current))));
    for (const project of projects) {
      const row = el('cds-table-row'), link = el('a', project.slug.split('/')[1]); link.href = `${campaignRoute(project.slug)}/overview`;
      const projectCell = el('cds-table-cell'), projectLink = el('a', project.slug.split('/')[0]), campaignCell = el('cds-table-cell'); projectLink.href = `#/p/${encodeURIComponent(project.slug.split('/')[0])}`; projectCell.append(projectLink); campaignCell.append(link);
      const counts = ['blocked', 'revise', 'pass'].map(status => { const n = project.reviews.filter(r => r.verdict === status).length; return n ? `${n} ${status}` : ''; }).filter(Boolean);
      if (project.pendingFeedback != null) counts.push(`${project.pendingFeedback} pending`);
      row.append(projectCell, campaignCell, el('cds-table-cell', counts.join(' · ') || 'Unreviewed'), el('cds-table-cell', project.updatedAt ? new Date(project.updatedAt).toLocaleDateString() : '—'), el('cds-table-cell', value(project, 'Export / published')));
      [...row.children].forEach((cell, index) => { cell.dataset.label = ['Project', 'Campaign', 'Review status', 'Updated', 'Export / published'][index]; });
      const card = el('article', null, 'project-card'), cardLink = el('a', `${project.slug.split('/')[0]} / ${project.slug.split('/')[1]}`), cardProject = el('a', `View ${project.slug.split('/')[0]} project`); cardLink.href = link.href; cardProject.href = projectLink.href; card.append(cardLink, el('br'), cardProject); const fields = [['Review status', counts.join(' · ') || 'Unreviewed'], ['Updated', project.updatedAt ? new Date(project.updatedAt).toLocaleDateString() : '—'], ['Export / published', value(project, 'Export / published')]]; const list = el('dl'); for (const [label, text] of fields) list.append(el('dt', label), el('dd', text)); card.append(list); cards.append(card);
      row.classList.add('clickable-row'); row.addEventListener('click', event => { if (!event.target.closest('a')) location.hash = link.hash; }); body.append(row);
    }
  }
  for (const text of ['Project', 'Campaign', 'Review status', 'Updated', 'Export / published']) { const cell = el('cds-table-header-cell', text), option = el('option', text); option.value = text; select.append(option); cell.dataset.sort = text; cell.isSortable = true; cell.sortCycle = 'bi-states-from-ascending'; cell.addEventListener('cds-table-header-cell-sort', event => { event.preventDefault(); direction = current === text ? -direction : 1; current = text; render(); }); hr.append(cell); }
  select.addEventListener('change', () => { current = select.value; direction = 1; render(); }); order.type = 'button'; order.addEventListener('click', () => { direction = -direction; render(); }); label.append(select); mobileSort.append(label, order);
  head.append(hr); table.append(head, body); render(); target.append(table, mobileSort, cards);
}
function feedbackHistory(project, target) {
  const entries = project.feedback.filter(e => target.platform ? e.target.platform === target.platform : target.asset ? e.target.asset === target.asset : true), section = el('section', null, 'feedback-history');
  if (!entries.length) return section; const details = el('details'), content = el('div'); details.append(el('summary', `Feedback history (${entries.length})`), content);
  renderFeedbackHistory(content, { campaign: 'Campaign', entries }); section.append(details); return section;
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
      if (activeProject !== project.slug || $('#project').hidden) return;
      if (section.isConnected) { const next = feedbackHistory(project, target); history.replaceWith(next); history = next; history.querySelector('details')?.setAttribute('open', ''); }
      const job = $('#project-detail .job-status'), apply = $('#apply-feedback'); if (apply && job?.project === project) { const count = project.feedback.filter(e => e.status === 'pending').length; apply.disabled = job.dataset.statusKnown !== 'yes' || job.dataset.running === 'yes'; apply.textContent = `Apply ${count} feedback ${count === 1 ? 'item' : 'items'}`; $('#apply-reason').textContent = ''; }
      toast('Feedback queued. Use Apply feedback when ready.');
    } catch (failure) { error.textContent = failure.message; } finally { submit.disabled = false; }
  });
  return section;
}
async function jobStatus(project, region, apply) {
  clearTimeout(timer); const status = await feedbackJobStatus(project.slug); if (activeProject !== project.slug || $('#project').hidden || !region.isConnected) return;
  const announcement = region.querySelector('.job-announcement'), cancel = region.querySelector('.cancel-job'), log = region.querySelector('.job-log');
  if (log.textContent !== status.lines.join('\n')) log.textContent = status.lines.join('\n'); log.parentElement.hidden = !status.lines.length || (!status.running && status.state !== 'failed' && region.dataset.running !== 'yes');
  cancel.hidden = !status.running; cancel.disabled = !!status.cancelling; cancel.dataset.jobId = status.id || '';
  region.dataset.statusKnown = 'yes'; apply.disabled = status.running || !project.feedback.some(entry => entry.status === 'pending');
  if (status.running) {
    region.dataset.running = 'yes'; if (!region.pendingIds) region.pendingIds = project.feedback.filter(e => e.status === 'pending').map(e => e.id);
    const label = status.cancelling ? 'Cancelling revision…' : 'Applying feedback…';
    if (region.dataset.state !== label) { const notice = el('cds-inline-notification'); notice.setAttribute('kind', 'info'); notice.setAttribute('hide-close-button', ''); notice.setAttribute('title', label); announcement.replaceChildren(notice); region.dataset.state = label; }
    scheduleStatus(project, region, apply);
  } else if (region.dataset.running === 'yes') {
    apply.disabled = true;
    const updated = await api(`/api/project/${encodeURIComponent(project.slug)}`); if (activeProject !== project.slug || $('#project').hidden || !region.isConnected) return;
    region.dataset.running = ''; region.dataset.state = ''; announcement.replaceChildren();
    const count = updated.feedback.filter(entry => entry.status === 'pending').length, applied = updated.feedback.filter(entry => region.pendingIds?.includes(entry.id) && entry.status === 'applied').length;
    const focus = document.activeElement, inProject = $('#project').contains(focus), selector = inProject && focus.id ? `#${CSS.escape(focus.id)}` : null, tag = inProject && !selector ? focus.tagName : null, index = tag ? [...$('#project').querySelectorAll(tag)].indexOf(focus) : -1, y = window.scrollY, tab = activeTab;
    await openProject(project.slug, tab); if (activeProject !== project.slug || $('#project').hidden) return;
    window.scrollTo(0, y); const restored = selector ? document.querySelector(selector) : tag ? $('#project').querySelectorAll(tag)[index] : focus; restored?.focus?.({ preventScroll: true });
    if (status.state !== 'failed') toast(status.state === 'succeeded' ? 'Revision completed. Review the updated campaign.' : `Revision cancelled. ${applied} applied before cancellation; ${count} pending.`, status.state === 'cancelled' ? 'info' : 'success');
  } else if (status.state === 'failed' && !dismissedJobFailures.has(status.id)) {
    const notice = el('cds-inline-notification'); notice.setAttribute('kind', 'error'); notice.setAttribute('title', `Revision failed (${status.exitCode}). Review the log and retry.`); notice.addEventListener('cds-notification-closed', () => { dismissedJobFailures.add(status.id); sessionStorage.setItem('dismissedJobFailures', JSON.stringify([...dismissedJobFailures])); announcement.replaceChildren(); });
    const view = button('View log', 'ghost'); view.addEventListener('click', () => { log.parentElement.hidden = false; log.parentElement.open = true; log.parentElement.scrollIntoView({ block: 'nearest' }); });
    const retry = button('Retry', 'secondary'); retry.disabled = apply.disabled; retry.addEventListener('click', () => apply.click()); notice.append(view, retry); announcement.replaceChildren(notice);
  }
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
function campaignRelativeMessage(message, slug) {
  const [project, campaign] = slug.split('/'), marker = `/projects/${project}/campaigns/${campaign}/`;
  return message.replace(/(?:[A-Za-z]:)?\/[^\s"'<>]*/g, path => {
    const index = path.indexOf(marker);
    return index < 0 ? path : path.slice(index + marker.length);
  });
}
function platformPanel(project, post) {
  const savedReview = project.reviews.find(r => r.platform === post.platform), review = savedReview && { ...savedReview, gates: (savedReview.gates || []).map(gate => ({ ...gate, message: gate.message && campaignRelativeMessage(gate.message, project.slug) })) }, panel = el('div', null, 'platform-grid'), left = el('section', null, 'surface post-panel'), right = el('section', null, 'surface reviewer-panel');
  const titleRow = el('div', null, 'section-title'); titleRow.append(el('h2', post.title || `${project.platforms?.[post.platform]?.name || displayName(post.platform)} post`)); left.append(titleRow); const limit = project.platforms?.[post.platform]?.textLimit; left.append(el('p', `${[...post.body].length} characters${typeof limit?.value === 'number' ? ` / ${limit.value}` : ''}`, 'muted'));
  const markdownPlatforms = new Set(['devto', 'hashnode', 'gist', 'github-discussion', 'medium', 'substack', 'newsletter']), body = el('div', null, markdownPlatforms.has(post.platform) ? 'markdown' : 'plain-post');
  if (markdownPlatforms.has(post.platform)) body.append(renderMarkdown(post.body, document)); else body.textContent = post.body;
  const thread = Array.isArray(post.thread) ? post.thread : [];
  const toolbar = el('div', null, 'copy-toolbar'); if (post.title) toolbar.append(copyButton('Copy title', post.title)); toolbar.append(copyButton('Copy post text', post.body)); left.append(toolbar, body);
  if (thread.length) { const list = el('ol', null, 'thread'); for (const [index, text] of thread.entries()) { const item = el('li'); item.append(el('h3', `Thread post ${index + 2}`), el('div', text, 'plain-post'), copyButton(`Copy thread post ${index + 2}`, text)); list.append(item); } left.append(list); }
  toolbar.append(copyButton('Copy all', [post.title, [post.body, ...thread].join('\n\n---\n\n')].filter(Boolean).join('\n\n')));
  if (post.media.length) { left.append(el('h3', 'Media'), mediaGallery(project.slug, post.media, project.captions)); }
  left.append(feedbackForm(project, { platform: post.platform }));
  const heading = el('div', null, 'section-title'); heading.append(el('h2', 'Independent review'), verdictTag(review)); right.append(heading, renderBlockers(project, `post:${post.platform}`));
  if (review) { const failed = (review.gates || []).filter(g => !g.pass); if (failed.length) { const notice = el('cds-inline-notification'); notice.setAttribute('kind', review.verdict === 'blocked' ? 'error' : 'warning'); notice.setAttribute('hide-close-button', ''); notice.setAttribute('title', `${review.verdict === 'blocked' ? 'Blocked' : 'Needs revision'}: ${failed.length} gate${failed.length === 1 ? '' : 's'} failed — ${failed.map(g => `${g.id}${g.message ? ': ' + g.message : ''}`).join('; ')}`); right.append(notice); } right.append(scoreMeter(review, project.threshold), el('h3', 'Gates'), gateList(review.gates)); if (review.warnings?.length) { const details = el('details'); details.open = review.verdict !== 'pass'; details.append(el('summary', `Warnings (${review.warnings.length})`)); const list = el('ul'); review.warnings.forEach(w => list.append(el('li', w))); details.append(list); right.append(details); } right.append(el('h3', 'Rubric'), rubricTable(project.rubric[post.platform] || [], review.scores || [], failed.length > 0)); }
  else right.append(el('p', 'No independent review yet.', 'muted'));
  const hooks = project.plan.find(p => p.platform === post.platform)?.hooks || []; if (hooks.length || review?.hookComparisons?.length) right.append(hookComparison(hooks, review?.hookComparisons)); right.append(selfReview(post.selfReview)); panel.append(left, right); return panel;
}
async function openStudioProject(id) {
  const load = ++projectLoad, container = $('#project-detail'); activeProject = null;
  container.replaceChildren(el('h1', id), el('p', 'Loading project…', 'muted')); show('project');
  const project = await api(`/api/projects/${encodeURIComponent(id)}`);
  if (load !== projectLoad) return;
  container.replaceChildren();
  const breadcrumb = el('nav', null, 'breadcrumb'), back = el('a', 'Projects'); breadcrumb.setAttribute('aria-label', 'Breadcrumb'); back.href = '#/projects'; breadcrumb.append(back, document.createTextNode(` / ${project.name}`));
  const heading = el('div', null, 'page-heading'), title = el('div'), create = el('cds-button', 'New campaign'); create.href = `#/p/${encodeURIComponent(id)}/new`; title.append(el('h1', project.name)); heading.append(title, create); container.append(breadcrumb, heading);
  const info = el('section', null, 'surface project-info'); info.append(el('h2', 'Project details'));
  if (project.repo) { const p = el('p'); let url; try { url = new URL(project.repo); } catch {} if (url && ['http:', 'https:'].includes(url.protocol)) { const link = el('a', project.repo); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; p.append(document.createTextNode('Repository: '), link); } else p.textContent = `Repository: ${project.repo}`; info.append(p); } else info.append(el('p', 'No repository linked.', 'muted'));
  info.append(el('h3', 'Evidence'));
  if (!project.evidence.length) info.append(el('p', 'No shared evidence yet.', 'muted'));
  else { const list = el('ul'); for (const evidence of project.evidence) { const item = el('li', evidence.title); if (evidence.source) { let url; try { url = new URL(evidence.source); } catch {} if (url && ['http:', 'https:'].includes(url.protocol)) { const link = el('a', evidence.source); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; item.append(document.createTextNode(' — '), link); } else item.append(document.createTextNode(` — ${evidence.source}`)); } list.append(item); } info.append(list); }
  const section = el('section', null, 'surface project-campaigns'); section.append(el('h2', 'Campaigns'));
  if (!project.campaigns.length) section.append(el('p', 'No campaigns yet. Create a campaign to get started.', 'muted'));
  else {
    const table = el('table', null, 'overview-table'), head = el('thead'), header = el('tr'), body = el('tbody'); for (const label of ['Campaign', 'Review status', 'Updated']) header.append(el('th', label)); head.append(header);
    for (const campaign of project.campaigns) { const row = el('tr'), cell = el('td'), link = el('a', campaign.id); link.href = `${campaignRoute(`${id}/${campaign.id}`)}/overview`; cell.append(link); row.append(cell, el('td', campaign.verdicts.join(' · ') || 'Unreviewed'), el('td', campaign.updatedAt ? new Date(campaign.updatedAt).toLocaleDateString() : '—')); body.append(row); }
    table.append(head, body); const scroll = el('div', null, 'table-scroll'); scroll.append(table); section.append(scroll);
  }
  container.append(info, section);
}
function orderedPosts(project) { const byId = new Map(project.posts.map(post => [post.platform, post])); const order = [...project.plan.map(item => item.platform), ...project.posts.map(post => post.platform)]; return [...new Set(order)].flatMap(id => byId.has(id) ? [byId.get(id)] : []); }
function overviewPanel(project) {
  const section = el('section', null, 'surface'), tiles = el('div', null, 'summary-tiles'); section.append(el('h2', 'Campaign summary'));
  for (const [label, value] of [['Pending feedback', project.feedback.filter(e => e.status === 'pending').length], ['Ready', project.reviews.filter(r => r.verdict === 'pass').length], ['Published', Object.keys(project.published || {}).length], ['Export', project.exported ? 'Available' : 'Not exported']]) { const tile = el('div'); tile.append(el('strong', String(value)), el('span', label)); tiles.append(tile); } section.append(tiles);
  section.append(renderBlockers(project));
  if (!orderedPosts(project).length) { const empty = el('div', null, 'empty'); empty.append(el('h3', 'No posts yet'), el('p', 'Plan creates destinations and posts.')); const plan = el('cds-button', 'Plan'); plan.href = `${campaignRoute(project.slug)}/actions?start=plan`; empty.append(plan); section.append(empty, feedbackHistory(project, {})); return section; }
  const table = el('table', null, 'overview-table'), head = el('thead'), header = el('tr'); for (const name of ['Destination', 'Status', 'Score', 'Failed gates', 'Pending feedback', 'Last reviewed']) header.append(el('th', name)); head.append(header); const body = el('tbody');
  for (const post of orderedPosts(project)) { const review = project.reviews.find(r => r.platform === post.platform), row = el('tr'), cell = el('td'), link = el('a', displayName(post.platform)); link.href = `${campaignRoute(project.slug)}/${encodeURIComponent(post.platform)}`; cell.append(link); const status = el('td'); status.append(verdictTag(review)); row.append(cell, status, el('td', review?.total == null ? '—' : Number(review.total).toFixed(1)), el('td', String((review?.gates || []).filter(g => !g.pass).length)), el('td', String(project.feedback.filter(e => e.status === 'pending' && e.target.platform === post.platform).length)), el('td', review?.at ? new Date(review.at).toLocaleDateString() : '—')); body.append(row); }
  table.append(head, body); const scroll = el('div', null, 'table-scroll'); scroll.append(table); section.append(scroll, feedbackHistory(project, {})); return section;
}
async function openProject(slug, requested = 'overview') {
  const load = ++projectLoad; clearTimeout(timer); activeProject = slug; const container = $('#project-detail'); container.replaceChildren(el('h1', slug.split('/')[1]), el('p', 'Loading campaign…', 'empty')); show('project'); const [project, operations] = await Promise.all([api(`/api/project/${encodeURIComponent(slug)}`), api(`/api/operations?campaign=${encodeURIComponent(slug)}`)]); if (load !== projectLoad || activeProject !== slug) return;
  container.replaceChildren(); const crumb = el('nav', null, 'breadcrumb'); crumb.setAttribute('aria-label', 'Breadcrumb'); const back = el('a', 'Projects'), projectLink = el('a', slug.split('/')[0]); back.href = '#/projects'; projectLink.href = `#/p/${encodeURIComponent(slug.split('/')[0])}`; crumb.append(back, document.createTextNode(' / '), projectLink, document.createTextNode(` / ${slug.split('/')[1]}`)); container.append(crumb);
  const top = el('div', null, 'page-heading'), title = el('div'), actions = el('div'); title.append(el('h1', slug.split('/')[1]), el('p', project.inputs.join(' · ') || `Campaign in ${slug.split('/')[0]}`)); const count = project.feedback.filter(e => e.status === 'pending').length, apply = button(count ? `Apply ${count} feedback ${count === 1 ? 'item' : 'items'}` : 'Apply feedback', 'primary'), reason = el('p', count ? '' : 'No pending feedback', 'muted'); apply.id = 'apply-feedback'; reason.id = 'apply-reason'; apply.setAttribute('aria-describedby', 'apply-reason'); apply.disabled = true; if (operations.revise.requiresTTY) { const notice = el('cds-inline-notification'); notice.setAttribute('kind', 'info'); notice.setAttribute('hide-close-button', ''); notice.setAttribute('title', 'Apply feedback from the terminal'); actions.append(notice, commandSnippet(`bstudio revise ${slug} --feedback-only`)); } else actions.append(apply, reason); top.append(title, actions); container.append(top);
  const job = el('div', null, 'job-status'), announcement = el('div', null, 'job-announcement'), cancelError = el('div'), logDetails = el('details'), log = el('pre', null, 'job-log'), cancel = button('Cancel revision', 'secondary'); cancel.className = 'cancel-job'; cancel.hidden = true; cancel.addEventListener('click', async () => { cancel.disabled = true; try { await cancelFeedbackJob(cancel.dataset.jobId); cancelError.replaceChildren(); await jobStatus(project, job, apply); } catch (error) { const notice = el('cds-inline-notification'); notice.setAttribute('kind', 'error'); notice.setAttribute('title', error.message); cancelError.replaceChildren(notice); cancel.disabled = false; } }); announcement.setAttribute('role', 'status'); announcement.setAttribute('aria-live', 'polite'); logDetails.hidden = true; logDetails.append(el('summary', 'Revision log'), log); job.append(announcement, cancelError, cancel, logDetails); apply.addEventListener('click', async () => { apply.disabled = true; job.dataset.statusKnown = ''; try { job.pendingIds = project.feedback.filter(e => e.status === 'pending').map(e => e.id); await startFeedbackJob(slug); job.dataset.running = 'yes'; await jobStatus(project, job, apply); } catch (error) { announcement.replaceChildren(el('p', error.message)); if (error.command) announcement.append(commandSnippet(error.command)); if (job.dataset.running === 'yes') scheduleStatus(project, job, apply); else { job.dataset.statusKnown = 'yes'; apply.disabled = false; } } });
  const tabs = el('cds-tabs'); tabs.setAttribute('type', 'contained'); const panel = el('div', null, 'tab-content'), options = ['overview', ...orderedPosts(project).map(p => p.platform), 'assets', 'actions', 'export']; activeTab = options.includes(requested) ? requested : 'overview';
  panel.setAttribute('role', 'tabpanel');
  function select(name) { activeTab = name; panel.setAttribute('aria-labelledby', `tab-${name}`); if (name === 'actions') renderActions(panel, { project, operations }); else if (name === 'export') renderExport(panel, { project, operations }); else if (name === 'assets') { renderAssetsTable(panel, { project, feedbackForm, mediaGallery, selfReview }); panel.prepend(renderBlockers(project)); } else panel.replaceChildren(name === 'overview' ? overviewPanel(project) : platformPanel(project, project.posts.find(p => p.platform === name))); }
  for (const name of options) { const review = project.reviews.find(r => r.platform === name), label = ({ overview: 'Overview', assets: 'Assets', actions: 'Actions', export: 'Export' })[name] || displayName(name), tab = el('cds-tab', label); if (project.posts.some(post => post.platform === name)) tab.setAttribute('aria-label', `${label} · ${review?.verdict || 'unreviewed'}`); const icon = tabStatusIcon(review?.verdict); if (icon) tab.prepend(icon); tab.id = `tab-${name}`; tab.value = name; if (name === activeTab) tab.setAttribute('selected', ''); tabs.append(tab); }
  job.project = project; tabs.addEventListener('cds-tabs-selected', event => { tabObserver?.disconnect(); const name = event.detail.item.value; select(name); event.detail.item.scrollIntoView({ block: 'nearest', inline: 'nearest' }); history.replaceState(null, '', `${campaignRoute(slug)}/${encodeURIComponent(name)}`); }); select(activeTab); container.append(job, tabs, panel); show('project'); await customElements.whenDefined('cds-tabs'); await customElements.whenDefined('cds-tab'); await tabs.updateComplete; const selectedTab = [...tabs.querySelectorAll('cds-tab')].find(tab => tab.value === requested); if (selectedTab && load === projectLoad) { selectedTab.selected = true; await selectedTab.updateComplete; await tabs.updateComplete; await document.fonts.ready; const viewport = tabs.shadowRoot?.querySelector('.cds--tabs-nav-content-container'); if (viewport && load === projectLoad) { const reveal = () => { const tabRect = selectedTab.getBoundingClientRect(), viewRect = viewport.getBoundingClientRect(); if (tabRect.right > viewRect.right) viewport.scrollLeft += tabRect.right - viewRect.right + 8; else if (tabRect.left < viewRect.left) viewport.scrollLeft -= viewRect.left - tabRect.left + 8; }; tabObserver = new ResizeObserver(reveal); tabObserver.observe(viewport); tabObserver.observe(selectedTab); reveal(); } } try { await jobStatus(project, job, apply); } catch (error) { if (activeProject === slug && !$('#project').hidden && job.isConnected) { message(error.message); scheduleStatus(project, job, apply); } }
}
async function route(focus = true) {
  const routeId = ++navigation; projectLoad++; libraryLoad++; tabObserver?.disconnect(); clearTimeout(timer); message(''); const [path, search = ''] = location.hash.slice(1).split('?'), parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  shell.closeNav();
  try {
    if (parts[0] === 'projects' && parts[1] === 'new') { activeProject = null; show('project'); await renderNewProject($('#project-detail'), {}); }
    else if (parts[0] === 'p' && parts[1] && parts[2] === 'new' && !parts[3]) { activeProject = null; show('project'); await renderNewCampaign($('#project-detail'), { project: parts[1] }); }
    else if (parts[0] === 'p' && parts[1] && parts[2]) { await openProject(`${parts[1]}/${parts[2]}`, parts[3]); }
    else if (parts[0] === 'p' && parts[1]) { await openStudioProject(parts[1]); }
    else { activeProject = null; const view = ['settings', 'sources', 'health'].includes(parts[0]) ? parts[0] : 'projects'; show(view); if (view === 'projects') { const project = parts[0] === 'p' ? parts[1] : ''; $('#search').value = project || new URLSearchParams(search).get('q') || ''; const create = $('#new-campaign'); create.hidden = !project; create.href = `#/p/${encodeURIComponent(project)}/new`; await library(); } else if (view === 'settings') await renderSettings($('#settings')); else if (view === 'sources') await renderSources($('#sources')); else await renderHealth($('#health')); }
  } catch (error) { if (routeId !== navigation || error.message === 'Session expired') return; if (error.status === 404) show('not-found'); else message(error.message); }
  if (routeId !== navigation) return; const heading = document.querySelector('.view:not([hidden]) h1'); if (heading) { document.title = `${heading.textContent} – Blast Studio`; if (focus) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); } }
}
window.addEventListener('hashchange', route); $('#search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { const query = $('#search').value; history.replaceState(null, '', `#/projects${query ? '?q=' + encodeURIComponent(query) : ''}`); library(); }, 250); });
$('.skip-link').addEventListener('click', event => { event.preventDefault(); $('#main').focus(); });
$('#expired code').replaceWith(commandSnippet('bstudio dashboard'));
route(false).catch(error => message(error.message));
