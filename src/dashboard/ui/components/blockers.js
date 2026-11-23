import { api } from './api.js';
import { el, button } from './review.js';
import { jobRegion, openForm } from './actions.js';
const targetPath = target => target.startsWith('post:') ? `posts/${target.slice(5)}.md` : target.startsWith('asset:') ? `assets/${target.slice(6)}/asset.yml` : target;


export function renderBlockers(project, target = null, onResolved = () => {}) {
  const section = el('section', null, 'asset-blockers'), content = el('div');
  section.id = 'blockers'; section.append(el('h3', 'Blockers'), content);
  const path = `/api/campaigns/${project.slug.split('/').map(encodeURIComponent).join('/')}/blockers`;
  let resolvingTarget;
  async function load() {
    try {
      const data = await api(path);
      if (!section.isConnected) return;
      const matches = item => !target || (target === 'asset:' ? item.target.startsWith(target) : item.target === target);
      const blockers = data.blockers.filter(matches);
      const resolutions = data.resolutions.filter(matches);
      content.replaceChildren();
      if (!blockers.length) content.append(el('p', 'No open blockers.', 'muted'));
      else {
        const list = el('ul', null, 'blocker-list');
        for (const blocker of blockers) {
          const item = el('li'), detail = el('div'), resolve = button('Resolve', 'secondary');
          resolve.append(el('span', ` ${targetPath(blocker.target)} blocker ${blocker.index + 1}`, 'visually-hidden'));
          detail.append(el('strong', `${!target || target === 'asset:' ? `${targetPath(blocker.target)} · ` : ''}Blocker ${blocker.index + 1}`), el('p', blocker.text));
          resolve.addEventListener('click', () => {
            const reason = el('cds-textarea'), label = el('span', 'Reason'); label.slot = 'label-text'; reason.append(label);
            openForm('Resolve blocker', `${targetPath(blocker.target)}: ${blocker.text} — Resolving removes this blocker, records your reason in the audit history, and creates a snapshot. Run review again to update the review.`, [{ key: 'reason', label: 'Reason', required: true, invalidText: 'Enter a reason.', node: reason }], 'Resolve', (args, reportError) => { resolvingTarget = blocker.target; return run('blockers resolve', { target: blocker.target, index: String(blocker.index), text: blocker.text, reason: args.reason }, reportError); });
          });
          item.append(detail, resolve); list.append(item);
        }
        content.append(list);
      }
      const history = el('details', null, 'blocker-history'); history.append(el('summary', `Resolved history (${resolutions.length})`));
      if (!resolutions.length) history.append(el('p', 'No resolved blockers yet.', 'muted'));
      else {
        const list = el('ul');
        for (const resolution of [...resolutions].reverse()) {
          const item = el('li'); item.append(el('strong', targetPath(resolution.target)), el('p', resolution.text), el('p', `Reason: ${resolution.reason}`), el('p', `Resolved by ${resolution.by} · ${new Date(resolution.resolvedAt).toLocaleString()}`, 'muted')); list.append(item);
        }
        history.append(list);
      }
      content.append(history);
    } catch (error) {
      if (!section.isConnected) return;
      const retry = button('Retry', 'secondary'); retry.addEventListener('click', load);
      content.replaceChildren(el('p', `Could not load blockers: ${error.message}`, 'form-error'), retry);
    }
  }
  const run = jobRegion(section, { project }, { operation: 'blockers resolve', ownOnly: true, matches: job => !target || (target === 'asset:' ? job.target?.startsWith(target) : job.target === target), onConflict: load, onComplete: async job => { await load(); if (job.state === 'succeeded') { const updated = await api(`/api/project/${encodeURIComponent(project.slug)}`); project.reviews = updated.reviews; onResolved(job.target || resolvingTarget); } } });
  content.append(el('p', 'Loading blockers…', 'muted')); setTimeout(load, 0);
  return section;
}
