import { el, button } from './review.js';

// The caller owns filtering and refreshing; this component only renders the supplied entries.
export function renderFeedbackHistory(container, { campaign, entries, onRemove }) {
  container.replaceChildren();
  if (!entries.length) { container.append(el('p', 'No feedback yet.', 'muted')); return; }
  const scroll = el('div', null, 'table-scroll'), table = el('table', null, 'overview-table'), head = el('thead'), header = el('tr'), body = el('tbody');
  for (const label of ['Status', 'Target', 'Feedback', 'Date', '']) header.append(el('th', label));
  head.append(header);
  for (const entry of entries) {
    const row = el('tr'), status = el('td'), tag = el('cds-tag', entry.status); tag.setAttribute('type', entry.status === 'applied' ? 'green' : entry.status === 'rejected' ? 'red' : 'blue'); status.append(tag);
    const target = entry.target?.platform || entry.target?.asset || campaign || 'Campaign', note = el('td'); note.append(el('span', entry.note), el('p', `ID: ${entry.id.slice(0, 8)}`, 'muted')); if (entry.rejectedReason) note.append(el('p', `Reason: ${entry.rejectedReason}`, 'form-error'));
    const action = el('td'); if (onRemove) { const remove = button('Remove', 'ghost'); remove.addEventListener('click', () => onRemove(entry)); action.append(remove); }
    row.append(status, el('td', target), note, el('td', new Date(entry.at).toLocaleString()), action); body.append(row);
  }
  table.append(head, body); scroll.append(table); container.append(scroll);
}
