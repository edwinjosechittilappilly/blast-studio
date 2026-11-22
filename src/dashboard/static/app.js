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
async function openProject(slug) {
  const project = await api(`/api/project/${encodeURIComponent(slug)}`), container = $('#project-detail'); container.replaceChildren(el('h1', slug), el('p', project.inputs.join(' · ') || 'Project overview'));
  const platforms = el('div', null, 'platforms');
  for (const post of project.posts) {
    const review = project.reviews.find(r => r.platform === post.platform), card = el('article', null, 'platform'), header = el('header');
    header.append(el('h2', post.platform), el('span', review ? `${review.verdict} · ${review.total == null ? 'N/A' : `${review.total.toFixed(1)}/100`}` : 'Unreviewed', 'badge')); card.append(header);
    if (post.title) card.append(el('h3', post.title)); card.append(el('div', post.body, 'post-text'));
    const media = el('div', null, 'media');
    for (const item of post.media) { let node; if (item.kind === 'video') { node = el('video'); node.controls = true; node.setAttribute('aria-label', item.alt || 'Video'); } else if (item.kind === 'document' || item.file.toLowerCase().endsWith('.pdf')) { node = el('a', item.alt || 'Open PDF'); node.href = mediaUrl(slug, item.file); } else { node = el('img'); node.alt = item.alt; } if (node.tagName !== 'A') node.src = mediaUrl(slug, item.file); media.append(node); } card.append(media);
    if (review?.scores?.length) { const wrap = el('div', null, 'table-wrap'), table = el('table', null, 'review-table'), head = el('tr'); for (const title of ['Criterion', 'Score', 'Evidence', 'Fix']) head.append(el('th', title)); const thead = el('thead'); thead.append(head); table.append(thead); const tbody = el('tbody'); for (const score of review.scores) { const row = el('tr'); for (const value of [score.criterion, score.score ?? 'N/A', score.evidence, score.fix]) row.append(el('td', String(value ?? ''))); tbody.append(row); } table.append(tbody); wrap.append(table); card.append(wrap); } platforms.append(card);
  }
  if (!project.posts.length) platforms.append(el('p', 'No posts yet. Make a project to see its platform drafts.', 'empty')); container.append(platforms);
  if (project.assets.length) {
    const section = el('section', null, 'platforms'); section.append(el('h2', 'Assets'));
    for (const asset of project.assets) {
      const card = el('article', null, 'panel'); card.append(el('h3', `${asset.id} · ${asset.kind}`), el('p', `${asset.aiGenerated ? 'AI generated' : 'Not AI generated'} · ${asset.costUsd == null ? 'Cost unavailable' : money(asset.costUsd)}`));
      const previews = el('div', null, 'media');
      for (const output of asset.outputs || []) {
        const path = `assets/${asset.id}/${output.file}`, name = output.file.toLowerCase(); let node;
        if (/\.(png|jpe?g|gif|webp|svg)$/.test(name)) { node = el('img'); node.alt = `${asset.id} preview`; node.src = mediaUrl(slug, path); }
        else if (/\.(mp4|webm)$/.test(name)) { node = el('video'); node.controls = true; node.setAttribute('aria-label', `${asset.id} video`); node.src = mediaUrl(slug, path); }
        else { node = el('a', output.file); node.href = mediaUrl(slug, path); }
        previews.append(node);
      }
      card.append(previews); section.append(card);
    }
    container.append(section);
  }
  show('project');
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
