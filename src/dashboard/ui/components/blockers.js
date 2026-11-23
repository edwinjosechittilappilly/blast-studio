import { api } from './api.js';
import { el, button } from './review.js';
import { jobRegion, openForm } from './actions.js';
const targetPath = target => target.startsWith('post:') ? `posts/${target.slice(5)}.md` : target.startsWith('asset:') ? `assets/${target.slice(6)}/asset.yml` : target;


export function renderBlockers(project) {
  const section = el('section', null, 'asset-blockers'), content = el('div');
  section.append(el('h3', 'Blockers'), content);
  const path = `/api/campaigns/${project.slug.split('/').map(encodeURIComponent).join('/')}/blockers`;
  async function load() {
    try {
      const data = await api(path);
      if (!section.isConnected) return;
      content.replaceChildren();
      if (!data.blockers.length) content.append(el('p', 'No open blockers.', 'muted'));
      else {
        const list = el('ul', null, 'blocker-list');
        for (const blocker of data.blockers) {
          const item = el('li'), detail = el('div'), resolve = button('Resolve', 'secondary');
          detail.append(el('strong', targetPath(blocker.target)), el('p', blocker.text));
          resolve.setAttribute('aria-label', `Resolve blocker for ${blocker.target}: ${blocker.text}`);
          resolve.addEventListener('click', () => {
            const reason = el('cds-textarea'), label = el('span', 'Reason'); label.slot = 'label-text'; reason.append(label);
            openForm('Resolve blocker', `${targetPath(blocker.target)}: ${blocker.text}`, [{ key: 'reason', label: 'Reason', required: true, node: reason }], 'Resolve', (args, reportError) => run('blockers resolve', { target: blocker.target, index: String(blocker.index), reason: args.reason }, reportError));
          });
          item.append(detail, resolve); list.append(item);
        }
        content.append(list);
      }
      const history = el('details', null, 'blocker-history'); history.append(el('summary', `Resolved history (${data.resolutions.length})`));
      if (!data.resolutions.length) history.append(el('p', 'No resolved blockers yet.', 'muted'));
      else {
        const list = el('ul');
        for (const resolution of [...data.resolutions].reverse()) {
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
  const run = jobRegion(section, { project }, { operation: 'blockers resolve', onComplete: async job => { if (job.state === 'succeeded') await load(); } });
  content.append(el('p', 'Loading blockers…', 'muted')); setTimeout(load, 0);
  return section;
}
