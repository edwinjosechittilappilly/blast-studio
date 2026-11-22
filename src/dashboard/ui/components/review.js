export const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
export function button(label, kind = 'ghost') { const b = el('cds-button', label); b.setAttribute('kind', kind); return b; }
export function verdictTag(review) { const tag = el('cds-tag', review?.verdict || 'unreviewed'); tag.setAttribute('type', review?.verdict === 'pass' || review?.verdict === 'accepted' ? 'green' : review ? 'red' : 'gray'); return tag; }
export function copyButton(label, value) {
  const b = button(label); b.setAttribute('aria-label', label);
  b.addEventListener('click', async () => {
    try { if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value); else throw new Error('Clipboard unavailable'); }
    catch { const area = el('textarea'); area.value = value; area.style.position = 'fixed'; area.style.opacity = '0'; document.body.append(area); area.select(); const ok = document.execCommand('copy'); area.remove(); if (!ok) { b.textContent = 'Copy failed'; return; } }
    b.textContent = 'Copied'; setTimeout(() => { b.textContent = label; }, 2000);
  }); return b;
}
export function scoreMeter(review, threshold) {
  const section = el('div', null, 'score'); const total = review?.total;
  section.append(el('p', `Score ${total == null ? 'N/A' : Number(total).toFixed(1) + ' / 100'} · Pass threshold ${Number(threshold).toFixed(1)}`));
  if (total != null) { const progress = el('cds-progress-bar'); progress.setAttribute('value', String(total)); progress.setAttribute('max', '100'); progress.setAttribute('label', 'Review score'); section.append(progress); }
  return section;
}
export function selfReview(review) { const tile = el('cds-tile', null, 'review-tile'); tile.append(el('h3', 'Maker self-review')); if (!review) { tile.append(el('p', 'No self-review yet.', 'muted')); return tile; } if (review.summary) tile.append(el('p', String(review.summary))); const list = el('ul', null, 'checks'); for (const item of Array.isArray(review.checks) ? review.checks : []) list.append(el('li', `${item.pass ? 'Pass' : 'Fail'} · ${item.item}${item.note ? ' — ' + item.note : ''}`)); tile.append(list); return tile; }
export function rubricTable(rubric, scores) {
  const table = el('table', null, 'rubric-table'), head = el('thead'), row = el('tr'); for (const name of ['Criterion', 'Weight', 'Score', 'Evidence', 'Fix']) row.append(el('th', name)); head.append(row); table.append(head);
  const tbody = el('tbody'), na = []; const sorted = [...rubric].sort((a,b) => (b.weight ?? 1) - (a.weight ?? 1));
  for (const criterion of sorted) { const score = scores.find(s => s.criterion === criterion.id); const r = el('tr'); for (const value of [criterion.question, criterion.weight ?? 1, score?.score == null ? 'N/A' : `${score.score} / 2`, score?.evidence || '—', score?.fix || '—']) r.append(el('td', String(value))); if (score?.score == null) na.push(r); else tbody.append(r); }
  table.append(tbody); const wrap = el('div', null, 'table-scroll'); wrap.append(table); if (na.length) { const details = el('details'); details.append(el('summary', `Not applicable or unscored (${na.length})`)); const other = table.cloneNode(false), body = el('tbody'); for (const row of na) body.append(row); other.append(body); details.append(other); wrap.append(details); } return wrap;
}
export function gateList(gates) { const list = el('ul', null, 'gates'); for (const gate of gates || []) list.append(el('li', `${gate.pass ? '✓ Pass' : '✕ Fail'} · ${gate.id} — ${gate.message}`)); return list; }
export function hookComparison(hooks, comparisons) { const section = el('section', null, 'hooks'); section.append(el('h3', 'Hook comparison')); const list = el('ol'); hooks.forEach(hook => { const li = el('li'); li.append(el('span', hook), copyButton('Copy hook', hook)); list.append(li); }); section.append(list); for (const item of comparisons || []) { const index = typeof item.preferred === 'string' ? item.preferred.toUpperCase().charCodeAt(0) - 65 : -1; section.append(el('p', `Preferred hook: ${hooks[index] || item.preferred || 'N/A'} — ${item.evidence}`)); } return section; }
