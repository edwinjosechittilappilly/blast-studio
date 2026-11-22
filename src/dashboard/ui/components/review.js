export const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
export function button(label, kind = 'ghost') { const b = el('cds-button', label); b.setAttribute('kind', kind); return b; }
export function verdictTag(review) { const tag = el('cds-tag', review?.verdict || 'unreviewed'); tag.setAttribute('type', review?.verdict === 'pass' || review?.verdict === 'accepted' ? 'green' : review ? 'red' : 'gray'); return tag; }
export async function copyText(value) {
  try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(value); return true; } } catch { /* Try the selection fallback below. */ }
  const area = el('textarea'); area.value = value; area.style.position = 'fixed'; area.style.opacity = '0'; document.body.append(area); area.select(); const ok = document.execCommand('copy'); area.remove(); return ok;
}
export function copyButton(label, value) {
  const wrapper = el('span', null, 'copy-control'), b = el('cds-copy-button'); b.setAttribute('aria-label', label); b.setAttribute('feedback', 'Copied'); wrapper.append(b, el('span', label));
  b.addEventListener('click', async () => {
    if (!await copyText(value)) b.setAttribute('feedback', 'Copy failed'); else b.setAttribute('feedback', 'Copied');
  }); return wrapper;
}
export function scoreMeter(review, threshold) {
  const section = el('div', null, 'score'); const total = review?.total;
  section.append(el('p', `Score ${total == null ? 'N/A' : Number(total).toFixed(1) + ' / 100'} · Pass threshold ${Number(threshold).toFixed(1)}`));
  if (total != null) { const wrap = el('div', null, 'score-bar'), progress = el('cds-progress-bar'), marker = el('span', null, 'threshold-marker'); progress.setAttribute('value', String(total)); progress.setAttribute('max', '100'); progress.setAttribute('label', 'Review score'); marker.style.left = `${Math.max(0, Math.min(100, threshold))}%`; marker.setAttribute('aria-hidden', 'true'); wrap.append(progress, marker); section.append(wrap); }
  return section;
}
export function selfReview(review) { const tile = el('cds-tile', null, 'review-tile'); tile.append(el('h3', 'Maker self-review')); if (!review) { tile.append(el('p', 'No self-review yet.', 'muted')); return tile; } if (review.summary) tile.append(el('p', String(review.summary))); const list = el('ul', null, 'checks'); for (const item of Array.isArray(review.checks) ? review.checks : []) list.append(el('li', `${item.pass ? 'Pass' : 'Fail'} · ${item.item}${item.note ? ' — ' + item.note : ''}`)); tile.append(list); return tile; }
export function rubricTable(rubric, scores) {
  const table = el('cds-table'), head = el('cds-table-head'), row = el('cds-table-header-row'), tbody = el('cds-table-body'), na = []; let sortKey = 'weight', ascending = false;
  const entries = rubric.map(criterion => ({ criterion, score: scores.find(s => s.criterion === criterion.id) }));
  function render() {
    tbody.replaceChildren(); na.length = 0;
    const sorted = [...entries].sort((a, b) => { const left = sortKey === 'weight' ? a.criterion.weight ?? 1 : sortKey === 'score' ? a.score?.score ?? -1 : a.criterion.question, right = sortKey === 'weight' ? b.criterion.weight ?? 1 : sortKey === 'score' ? b.score?.score ?? -1 : b.criterion.question; return (typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right))) * (ascending ? 1 : -1); });
    for (const { criterion, score } of sorted) { const r = el('cds-table-row'); for (const value of [criterion.question, criterion.weight ?? 1, score?.score == null ? 'N/A' : `${score.score} / 2`, score?.evidence || '—', score?.fix || '—']) r.append(el('cds-table-cell', String(value))); if (score?.score == null) na.push(r); else tbody.append(r); }
    otherBody.replaceChildren(...na); details.hidden = !na.length; summary.textContent = `Not applicable or unscored (${na.length})`;
  }
  for (const [name, key] of [['Criterion', 'question'], ['Weight', 'weight'], ['Score', 'score'], ['Evidence', ''], ['Fix', '']]) { const cell = el('cds-table-header-cell'); if (key) { const control = el('button', name, 'sort-button'); control.type = 'button'; control.setAttribute('aria-label', `Sort by ${name}`); control.addEventListener('click', () => { ascending = sortKey === key ? !ascending : true; sortKey = key; render(); }); cell.append(control); } else cell.textContent = name; row.append(cell); }
  head.append(row); table.append(head, tbody); const wrap = el('div', null, 'table-scroll'), details = el('details'), summary = el('summary'), other = el('cds-table'), otherBody = el('cds-table-body'); other.append(otherBody); details.append(summary, other); wrap.append(table, details); render(); return wrap;
}
export function gateList(gates) { const list = el('ul', null, 'gates'); for (const gate of gates || []) list.append(el('li', `${gate.pass ? '✓ Pass' : '✕ Fail'} · ${gate.id} — ${gate.message}`)); return list; }
export function hookComparison(hooks, comparisons) { const section = el('section', null, 'hooks'); section.append(el('h3', 'Hook comparison')); const list = el('ol'); hooks.forEach(hook => { const li = el('li'); li.append(el('span', hook), copyButton('Copy hook', hook)); list.append(li); }); section.append(list); for (const item of comparisons || []) { const index = typeof item.preferred === 'string' ? item.preferred.toUpperCase().charCodeAt(0) - 65 : -1; section.append(el('p', `Preferred hook: ${hooks[index] || item.preferred || 'N/A'} — ${item.evidence}`)); } return section; }
