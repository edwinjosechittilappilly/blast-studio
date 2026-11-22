import '@carbon/web-components/es/components/ui-shell/index.js';
import Add16 from '@carbon/icons/es/add/16.js';
import List16 from '@carbon/icons/es/list/16.js';
import { api } from './api.js';
import { el, button } from './review.js';

function icon(descriptor) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', descriptor.elem);
  for (const [name, value] of Object.entries(descriptor.attrs)) svg.setAttribute(name, String(value));
  svg.setAttribute('aria-hidden', 'true');
  for (const part of descriptor.content) { const child = document.createElementNS('http://www.w3.org/2000/svg', part.elem); for (const [name, value] of Object.entries(part.attrs)) child.setAttribute(name, String(value)); svg.append(child); }
  return svg;
}

export function setupShell() {
  const nav = document.querySelector('#workspace-nav'), toggle = document.querySelector('#nav-toggle');
  const jobsButton = document.querySelector('#jobs-toggle'), panel = document.querySelector('#jobs-panel'), count = document.querySelector('#jobs-count');
  const mobile = matchMedia('(max-width: 1055px)');
  const syncNav = () => { nav.expanded = mobile.matches && toggle.active; };
  const closeNav = () => { toggle.active = false; syncNav(); };
  toggle.addEventListener('cds-header-menu-button-toggled', syncNav);
  mobile.addEventListener('change', syncNav); syncNav();
  document.querySelector('#new-action').append(icon(Add16));
  document.querySelector('#new-action').addEventListener('click', () => { location.hash = '#/projects/new'; });
  jobsButton.append(icon(List16));
  let refreshing = false;
  async function refreshJobs() {
    if (refreshing) return;
    refreshing = true;
    try {
      const jobs = await api('/api/jobs');
      const running = jobs.filter(job => job.state === 'running' || job.state === 'queued').length;
      count.textContent = String(running); jobsButton.setAttribute('button-label-inactive', `Jobs, ${running} running`);
      if (!panel.hidden) {
        const list = document.querySelector('#jobs-list'); list.replaceChildren();
        if (!jobs.length) list.append(el('p', 'No jobs yet.'));
        for (const job of [...jobs].reverse()) {
          const item = el('div', null, 'shell-job'), heading = el('strong', `${job.operation} · ${job.state}`), details = el('details'), log = el('pre');
          details.append(el('summary', 'View log'), log);
          details.addEventListener('toggle', async () => { if (!details.open) return; try { const result = await api(`/api/jobs/${encodeURIComponent(job.id)}/log?tail=100`); log.textContent = result.log || 'No output yet.'; } catch (error) { log.textContent = `Could not load log: ${error.message}`; } });
          item.append(heading, el('p', job.campaign || 'Studio'), details); list.append(item);
        }
      }
    } catch (error) {
      if (!panel.hidden) { const list = document.querySelector('#jobs-list'), retry = button('Try again', 'secondary'); retry.addEventListener('click', refreshJobs); list.replaceChildren(el('p', `Could not load jobs: ${error.message}`), retry); }
    } finally { refreshing = false; }
  }
  jobsButton.addEventListener('click', () => { panel.hidden = !panel.hidden; jobsButton.setAttribute('aria-expanded', String(!panel.hidden)); if (!panel.hidden) refreshJobs(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { if (!panel.hidden) { panel.hidden = true; jobsButton.focus(); } closeNav(); } });
  refreshJobs(); setInterval(refreshJobs, 5000);
  return { closeNav, setActive(view) { document.querySelectorAll('cds-side-nav-link').forEach(link => { link.active = link.dataset.view === view; if (link.active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); }); } };
}
