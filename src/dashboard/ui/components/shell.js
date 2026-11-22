import '@carbon/web-components/es/components/ui-shell/index.js';
import Add20 from '@carbon/icons/es/add/20.js';
import List20 from '@carbon/icons/es/list/20.js';
import { api, headers } from './api.js';
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
  document.querySelector('#new-action').append(icon(Add20));
  document.querySelector('#new-action').addEventListener('click', () => { location.hash = '#/projects/new'; });
  jobsButton.append(icon(List20));
  document.querySelector('#new-action').setAttribute('tooltip-text', 'New project');
  jobsButton.setAttribute('tooltip-text', 'Jobs');
  let refreshing = false;
  const rows = new Map(), list = document.querySelector('#jobs-list');
  function relativeTime(value) {
    const seconds = Math.round((Date.parse(value) - Date.now()) / 1000);
    if (!Number.isFinite(seconds)) return 'Unknown time';
    const unit = Math.abs(seconds) < 60 ? 'second' : Math.abs(seconds) < 3600 ? 'minute' : Math.abs(seconds) < 86400 ? 'hour' : 'day';
    const divisor = { second: 1, minute: 60, hour: 3600, day: 86400 }[unit];
    return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(Math.round(seconds / divisor), unit);
  }
  function createRow(job) {
    const item = el('div', null, 'shell-job'), heading = el('strong'), tag = el('cds-tag'), time = el('time'), campaign = el('p'), details = el('details'), log = el('pre'), cancel = button('Cancel job', 'secondary'), error = el('p', null, 'form-error');
    error.setAttribute('role', 'alert');
    details.append(el('summary', 'View log'), log);
    details.addEventListener('toggle', async () => { if (!details.open) return; try { const result = await api(`/api/jobs/${encodeURIComponent(job.id)}/log?tail=100`); log.textContent = result.log || 'No output yet.'; } catch (failure) { log.textContent = `Could not load log: ${failure.message}`; } });
    cancel.addEventListener('click', async () => { cancel.disabled = true; try { await api(`/api/jobs/${encodeURIComponent(job.id)}/cancel`, { method: 'POST', headers }); error.textContent = ''; await refreshJobs(); } catch (failure) { error.textContent = `Could not cancel job: ${failure.message}`; cancel.disabled = false; } });
    item.append(heading, tag, time, campaign, cancel, error, details);
    return { item, heading, tag, time, campaign, cancel };
  }
  async function refreshJobs() {
    if (refreshing) return;
    refreshing = true;
    try {
      const jobs = (await api('/api/jobs')).filter(job => job.operation !== 'auth list');
      const running = jobs.filter(job => job.state === 'running' || job.state === 'queued').length;
      count.textContent = String(running); count.hidden = running === 0; jobsButton.setAttribute('button-label-inactive', `Jobs, ${running} running`); jobsButton.setAttribute('tooltip-text', `Jobs, ${running} running`);
      if (!panel.hidden) {
        list.querySelector('.jobs-error')?.remove();
        const ids = new Set(jobs.map(job => job.id));
        for (const [id, row] of rows) if (!ids.has(id)) { row.item.remove(); rows.delete(id); }
        const empty = list.querySelector('.jobs-empty');
        if (jobs.length) empty?.remove(); else if (!empty) list.append(el('p', 'No jobs yet.', 'jobs-empty'));
        let previous = null;
        for (const job of jobs) {
          let row = rows.get(job.id);
          if (!row) { row = createRow(job); rows.set(job.id, row); }
          row.heading.textContent = job.operation; row.tag.textContent = job.state;
          row.tag.setAttribute('type', job.state === 'succeeded' ? 'green' : job.state === 'failed' ? 'red' : job.state === 'running' ? 'blue' : 'gray');
          row.time.dateTime = job.createdAt; row.time.textContent = relativeTime(job.createdAt);
          const href = job.campaign ? `#/p/${job.campaign.split('/').map(encodeURIComponent).join('/')}/overview` : '';
          if (row.campaign.dataset.href !== href) { row.campaign.dataset.href = href; if (href) { const link = el('a', job.campaign); link.href = href; row.campaign.replaceChildren(link); } else row.campaign.textContent = 'Studio'; }
          row.cancel.hidden = job.state !== 'running' && job.state !== 'queued'; row.cancel.disabled = !!job.cancelRequested;
          if (row.item !== (previous ? previous.nextElementSibling : list.firstElementChild)) list.insertBefore(row.item, previous ? previous.nextElementSibling : list.firstElementChild);
          previous = row.item;
        }
      }
    } catch (error) {
      if (!panel.hidden) { let notice = list.querySelector('.jobs-error'); if (!notice) { notice = el('p', null, 'jobs-error'); notice.setAttribute('role', 'alert'); list.prepend(notice); } notice.textContent = `Could not load jobs: ${error.message}`; }
    } finally { refreshing = false; }
  }
  jobsButton.addEventListener('click', () => { panel.hidden = !panel.hidden; jobsButton.setAttribute('aria-expanded', String(!panel.hidden)); if (!panel.hidden) refreshJobs(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { if (!panel.hidden) { panel.hidden = true; jobsButton.focus(); } closeNav(); } });
  refreshJobs(); setInterval(refreshJobs, 5000);
  return { closeNav, setActive(view) { document.querySelectorAll('cds-side-nav-link').forEach(link => { link.active = link.dataset.view === view; if (link.active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); }); } };
}
