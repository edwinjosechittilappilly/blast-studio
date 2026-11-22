const $ = selector => document.querySelector(selector);
const el = (tag, text, className) => { const node = document.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node; };
const money = n => `$${Number(n).toFixed(2)}`;
async function api(path, options) { const response = await fetch(path, options); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Request failed'); return data; }
function message(text) { $('#message').textContent = text; }
function show(view) { document.querySelectorAll('.view').forEach(node => { node.hidden = node.id !== view; }); document.querySelectorAll('.nav').forEach(node => node.classList.toggle('active', node.dataset.view === (view === 'project' ? 'projects' : view))); }
function mediaUrl(slug, path) { return `/media/${encodeURIComponent(slug)}/${path.split('/').map(encodeURIComponent).join('/')}`; }
async function library() {
  const projects = await api(`/api/library?q=${encodeURIComponent($('#search').value)}`), list = $('#project-list'); list.replaceChildren();
  if (!projects.length) { list.append(el('p', 'No projects found. Create a project or try another search.', 'empty')); return; }
  for (const project of projects) { const row = el('button', null, 'project-row'); row.type = 'button'; const title = el('span'); title.append(el('strong', project.slug), el('small', project.inputs.join(' · ') || 'No brief inputs', 'subtle')); row.append(title, el('span', project.posts.map(p => p.platform).join(', ') || 'No posts'), el('span', project.assets.length ? `${project.assets.length} assets` : 'No assets')); row.addEventListener('click', () => openProject(project.slug).catch(error => message(error.message))); list.append(row); }
}
const writeHeaders = { 'Content-Type': 'application/json', 'X-Requested-With': 'bstudio' };
let pollTimer;
function selfReview(review) {
  const section = el('section', null, 'self-review'); section.append(el('h4', 'Maker self-review'));
  if (!review || typeof review !== 'object') { section.append(el('p', 'No self-review yet.', 'subtle')); return section; }
  if (review.summary) section.append(el('p', String(review.summary)));
  if (review.iterations != null) section.append(el('p', `Iterations: ${review.iterations}`, 'subtle'));
  const list = el('ul', null, 'check-list');
  for (const check of Array.isArray(review.checks) ? review.checks : []) list.append(el('li', `${check.pass ? 'Pass' : 'Fail'}: ${check.item}${check.note ? ` — ${check.note}` : ''}`));
  section.append(list); return section;
}
function feedbackForm(project, target) {
  const section = el('section', null, 'feedback'), form = el('form'), label = el('label', 'Your feedback'), input = el('textarea');
  input.name = 'note'; input.required = true; input.maxLength = 4000; input.rows = 3; label.append(input);
  const submit = el('button', 'Submit feedback'); submit.type = 'submit'; form.append(label, submit);
  form.addEventListener('submit', async event => {
    event.preventDefault(); submit.disabled = true;
    try { await api(`/api/projects/${encodeURIComponent(project.slug)}/feedback`, { method: 'POST', headers: writeHeaders, body: JSON.stringify({ target, note: input.value }) }); await openProject(project.slug); message('Feedback saved.'); }
    catch (error) { message(error.message); submit.disabled = false; }
  });
  section.append(form);
  const history = project.feedback.filter(entry => entry.target.platform === target.platform && entry.target.asset === target.asset);
  if (history.length) { const details = el('details'); details.append(el('summary', `Feedback history (${history.length})`)); for (const entry of history) { const item = el('div', null, 'feedback-entry'); item.append(el('strong', `${entry.status === 'applied' ? 'Applied' : 'Pending'} · ${new Date(entry.at).toLocaleString()}`), el('p', entry.note)); details.append(item); } section.append(details); }
  return section;
}
function preview(slug, path, kind, alt, captions) {
  let node;
  if (kind === 'video' || /\.(mp4|webm)$/i.test(path)) {
    node = el('video'); node.controls = true; node.setAttribute('aria-label', alt || 'Video'); node.src = mediaUrl(slug, path);
    if (captions[path]) { const track = el('track'); track.kind = 'captions'; track.label = 'Captions'; track.srclang = 'en'; track.src = mediaUrl(slug, captions[path]); track.default = true; node.append(track); }
  } else if (kind === 'document' || /\.pdf$/i.test(path)) { node = el('a', alt || 'Open PDF'); node.href = mediaUrl(slug, path); }
  else if (kind === 'image' || kind === 'gif' || /\.(png|jpe?g|gif|webp|svg)$/i.test(path)) { node = el('img'); node.alt = alt || ''; node.src = mediaUrl(slug, path); }
  else { node = el('a', alt || path); node.href = mediaUrl(slug, path); }
  return node;
}
async function revisionStatus(slug, target, button) {
  const status = await api(`/api/projects/${encodeURIComponent(slug)}/status`);
  target.replaceChildren(el('p', status.running ? 'Revision running…' : status.exitCode == null ? 'No revision running.' : `Revision finished with exit code ${status.exitCode}.`));
  if (status.lines.length) target.append(el('pre', status.lines.join('\n')));
  button.disabled = status.running;
  if (status.running) pollTimer = setTimeout(() => revisionStatus(slug, target, button).catch(error => message(error.message)), 3000);
  else if (button.dataset.running === 'yes') { button.dataset.running = ''; await openProject(slug); }
  if (status.running) button.dataset.running = 'yes';
}
async function openProject(slug) {
  clearTimeout(pollTimer);
  const project = await api(`/api/project/${encodeURIComponent(slug)}`), container = $('#project-detail'); container.replaceChildren(el('h1', slug), el('p', project.inputs.join(' · ') || 'Project overview'));
  const revision = el('section', null, 'revision'), apply = el('button', 'Apply feedback'), status = el('div', null, 'revision-status');
  apply.type = 'button'; apply.addEventListener('click', async () => { apply.disabled = true; try { await api(`/api/projects/${encodeURIComponent(slug)}/revise`, { method: 'POST', headers: writeHeaders }); apply.dataset.running = 'yes'; await revisionStatus(slug, status, apply); } catch (error) { message(error.message); apply.disabled = false; } });
  revision.append(apply, status); container.append(revision);
  const platforms = el('div', null, 'platforms');
  for (const post of project.posts) {
    const review = project.reviews.find(r => r.platform === post.platform), card = el('article', null, 'platform'), header = el('header');
    header.append(el('h2', post.platform), el('span', review ? review.verdict : 'Unreviewed', 'badge')); card.append(header);
    if (post.title) card.append(el('h3', post.title)); card.append(el('div', post.body, 'post-text'));
    const media = el('div', null, 'media'); for (const item of post.media) media.append(preview(slug, item.file, item.kind, item.alt, project.captions)); card.append(media);
    const comparison = el('div', null, 'review-comparison'), independent = el('section'); independent.append(el('h4', 'Independent review'));
    if (review) {
      const total = review.total == null ? 'N/A' : `${Number(review.total).toFixed(1)} / 100`;
      independent.append(el('p', `Score: ${total} · Pass threshold: ${Number(project.threshold).toFixed(1)}`));
      if (review.total != null) { const meter = el('div', null, 'score-meter'), fill = el('span'), marker = el('i'); fill.style.width = `${Math.max(0, Math.min(100, review.total))}%`; marker.style.left = `${Math.max(0, Math.min(100, project.threshold))}%`; marker.setAttribute('aria-hidden', 'true'); meter.append(fill, marker); independent.append(meter); }
      const gates = el('div', null, 'gates'); for (const gate of review.gates || []) gates.append(el('span', `${gate.pass ? 'Pass' : 'Fail'}: ${gate.id} — ${gate.message}`, 'gate')); independent.append(gates);
      if (review.warnings?.length) { const warnings = el('details'); warnings.append(el('summary', `Warnings (${review.warnings.length})`)); const list = el('ul'); for (const warning of review.warnings) list.append(el('li', warning)); warnings.append(list); independent.append(warnings); }
      const rubric = [...(project.rubric[post.platform] || [])].sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1));
      for (const criterion of rubric) {
        const score = (review.scores || []).find(item => item.criterion === criterion.id), row = el('div', null, 'criterion');
        row.append(el('strong', criterion.question), el('p', `Weight ${criterion.weight ?? 1} · Score ${score?.score == null ? 'N/A' : `${score.score} / 2`}`, 'criterion-score'));
        if (score?.score != null) { const bar = el('div', null, 'criterion-pips'); bar.setAttribute('aria-hidden', 'true'); for (let i = 0; i < 2; i++) bar.append(el('span', null, i < score.score ? 'filled' : '')); row.append(bar); }
        if (score?.evidence) row.append(el('p', `Evidence: ${score.evidence}`)); if (score?.fix) row.append(el('p', `Fix: ${score.fix}`)); independent.append(row);
      }
      const hooks = project.plan.find(item => item.platform === post.platform)?.hooks || [];
      if (hooks.length || review.hookComparisons?.length) { independent.append(el('h4', 'Hook checks')); const list = el('ol'); for (const hook of hooks) list.append(el('li', hook)); independent.append(list); for (const item of review.hookComparisons || []) independent.append(el('p', `Preferred: ${item.preferred ?? 'N/A'} — ${item.evidence}`)); }
    } else independent.append(el('p', 'No independent review yet.', 'subtle'));
    comparison.append(independent, selfReview(post.selfReview)); card.append(comparison, feedbackForm(project, { platform: post.platform })); platforms.append(card);
  }
  if (!project.posts.length) platforms.append(el('p', 'No posts yet. Make a project to see its platform drafts.', 'empty')); container.append(platforms);
  if (project.assets.length) {
    const section = el('section', null, 'platforms'); section.append(el('h2', 'Assets'));
    for (const asset of project.assets) {
      const card = el('article', null, 'panel'); card.append(el('h3', `${asset.id} · ${asset.kind}`), el('p', `${asset.aiGenerated ? 'AI generated' : 'Not AI generated'} · ${asset.costUsd == null ? 'Cost unavailable' : money(asset.costUsd)}`));
      const previews = el('div', null, 'media'); for (const output of asset.outputs || []) { const path = `assets/${asset.id}/${output.file}`; previews.append(preview(slug, path, '', output.file, project.captions)); }
      card.append(previews, selfReview(asset.selfReview), feedbackForm(project, { asset: asset.id })); section.append(card);
    }
    container.append(section);
  }
  show('project'); await revisionStatus(slug, status, apply);
}
async function settings() {
  const data = await api('/api/budget'), spend = $('#spend'); spend.replaceChildren(el('div', `${money(data.mtd)} of ${money(data.cap)}`, 'spend-amount'), el('span', 'spent this month', 'subtle')); const meter = el('div', null, 'meter'), fill = el('span'); fill.style.width = `${data.cap ? Math.min(100, data.mtd / data.cap * 100) : 0}%`; meter.append(fill); spend.append(meter); $('#budget-form').elements.monthlyUsd.value = data.cap; $('#budget-form').elements.perProjectUsd.value = data.perProject; $('#providers-form').elements.images.value = data.providers.images; $('#providers-form').elements.voice.value = data.providers.voice;
  const totals = $('#provider-totals'); totals.replaceChildren(); for (const [name, value] of Object.entries(data.providerTotals)) totals.append(el('p', `${name}: ${money(value)}`));
  const colors = data.brand.colors || {}; for (const name of ['ink', 'paper', 'accent']) if (/^#[0-9a-f]{6}$/i.test(colors[name] || '')) document.documentElement.style.setProperty(`--${name}`, colors[name]);
}
async function sources() { const data = await api('/api/sources'), target = $('#source-detail'); target.replaceChildren(el('h2', `Last checked: ${data.lastCheck || 'Never'}`)); for (const key of ['changed', 'failed', 'unverified']) { target.append(el('h3', key[0].toUpperCase() + key.slice(1)), el('div', data[key].join('\n') || 'None reported', 'source-list')); } }
for (const nav of document.querySelectorAll('.nav')) nav.addEventListener('click', async () => { show(nav.dataset.view); try { if (nav.dataset.view === 'projects') await library(); if (nav.dataset.view === 'settings') await settings(); if (nav.dataset.view === 'sources') await sources(); } catch (error) { message(error.message); } });
$('#back').addEventListener('click', () => show('projects')); $('#search').addEventListener('input', () => library().catch(error => message(error.message)));
for (const [id, path] of [['budget-form', '/api/budget'], ['providers-form', '/api/providers']]) $( `#${id}` ).addEventListener('submit', async event => { event.preventDefault(); const form = event.currentTarget, values = Object.fromEntries(new FormData(form)); if (id === 'budget-form') { values.monthlyUsd = Number(values.monthlyUsd); values.perProjectUsd = Number(values.perProjectUsd); } try { await api(path, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'bstudio' }, body: JSON.stringify(values) }); message('Settings saved.'); await settings(); } catch (error) { message(error.message); } });
Promise.all([library(), settings()]).catch(error => message(error.message));
