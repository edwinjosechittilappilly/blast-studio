export const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
export function button(label, kind = 'ghost') { const b = el('cds-button', label); b.setAttribute('kind', kind); return b; }
export function verdictTag(review) { const tag = el('cds-tag', review?.verdict || 'unreviewed'); tag.setAttribute('type', review?.verdict === 'pass' || review?.verdict === 'accepted' ? 'green' : review ? 'red' : 'gray'); return tag; }
function statusIcon(pass) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16'); svg.setAttribute('width', '16'); svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('fill', 'currentColor');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', pass ? 'M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm-1 10L4.3 8.3l.9-.8L7 9.3l4-3.9.9.8z' : 'M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm.75 10.5h-1.5V10h1.5zm0-3h-1.5v-5h1.5z');
  svg.append(path); return svg;
}
export async function copyText(value) {
  try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(value); return true; } } catch { /* Try the selection fallback below. */ }
  const area = el('textarea'); area.value = value; area.style.position = 'fixed'; area.style.opacity = '0'; document.body.append(area); area.select(); const ok = document.execCommand('copy'); area.remove(); return ok;
}
export function copyButton(label, value) {
  const b = button(label); b.className = 'copy-control';
  b.addEventListener('click', async () => {
    const ok = await copyText(value);
    b.textContent = ok ? 'Copied' : 'Copy failed';
    setTimeout(() => { b.textContent = label; }, 2000);
  });
  return b;
}
export function scoreMeter(review, threshold) {
  const section = el('div', null, 'score'), total = review?.total;
  section.append(el('p', `Score ${total == null ? 'N/A' : Number(total).toFixed(1) + ' / 100'}`, 'score-value'));
  if (total != null) {
    const value = Math.max(0, Math.min(100, Number(total))), limit = Math.max(0, Math.min(100, Number(threshold)));
    const wrap = el('div', null, 'score-bar'), meter = el('meter'), marker = el('span', String(threshold), 'threshold-marker');
    meter.min = 0; meter.max = 100; meter.value = value; meter.low = limit; meter.high = limit; meter.optimum = 100;
    meter.setAttribute('aria-label', `Review score; pass threshold ${threshold}`);
    meter.className = value >= limit ? 'score-pass' : 'score-fail';
    marker.style.left = `${limit}%`; marker.setAttribute('aria-hidden', 'true');
    wrap.append(meter, marker); section.append(wrap, el('p', `Pass threshold ${threshold}`, 'muted'));
  }
  return section;
}
export function selfReview(review) {
  const section = el('section', null, 'review-tile'); section.append(el('h3', 'Maker self-review'));
  if (!review) { section.append(el('p', 'No self-review yet.', 'muted')); return section; }
  if (review.summary) section.append(el('p', String(review.summary)));
  const list = el('ul', null, 'checks');
  for (const item of Array.isArray(review.checks) ? review.checks : []) {
    const li = el('li', null, item.pass ? 'status-pass' : 'status-fail');
    li.append(statusIcon(item.pass), el('strong', item.pass ? 'Pass' : 'Fail'), document.createTextNode(` · ${item.item}${item.note ? ' — ' + item.note : ''}`)); list.append(li);
  }
  section.append(list); return section;
}
export function rubricTable(rubric, scores, blocked = false) {
  const section = el('div', null, 'rubric-list');
  if (!scores.some(score => score.score != null)) {
    section.append(el('p', blocked ? 'Not scored: blocked by gates' : 'Not scored', 'muted')); return section;
  }
  const showWeight = rubric.some(criterion => (criterion.weight ?? 1) !== 1);
  const entries = rubric.map(criterion => ({ criterion, score: scores.find(s => s.criterion === criterion.id) }));
  entries.sort((a, b) => (a.score?.score ?? Infinity) - (b.score?.score ?? Infinity));
  for (const { criterion, score } of entries) {
    const details = el('details', null, 'rubric-item'), summary = el('summary');
    summary.append(el('span', criterion.question), el('span', score?.score == null ? 'N/A' : `${score.score} / 2`, 'rubric-score'));
    if (showWeight) summary.append(el('span', `Weight ${criterion.weight ?? 1}`, 'muted'));
    details.append(summary);
    if (score?.evidence) details.append(el('p', `Evidence: ${score.evidence}`));
    if (score?.fix && score.fix !== '—') details.append(el('p', `Fix: ${score.fix}`));
    section.append(details);
  }
  return section;
}
export function gateList(gates) {
  const list = el('ul', null, 'gates');
  for (const gate of [...(gates || [])].sort((a, b) => Number(a.pass) - Number(b.pass))) {
    const li = el('li', null, gate.pass ? 'status-pass' : 'status-fail');
    li.append(statusIcon(gate.pass), el('strong', gate.pass ? 'Pass' : 'Fail'), document.createTextNode(` · ${gate.id}${gate.message ? ` — ${gate.message}` : ''}`)); list.append(li);
  }
  return list;
}
export function hookComparison(hooks, comparisons) {
  const section = el('section', null, 'hooks'); section.append(el('h3', 'Hook comparison'));
  const list = el('ol');
  hooks.forEach((hook, index) => {
    const li = el('li'), content = el('div'), preferred = (comparisons || []).filter(item => String(item.preferred).toUpperCase() === String.fromCharCode(65 + index));
    content.append(el('span', hook));
    for (const item of preferred) { const tag = el('cds-tag', 'Preferred'); tag.setAttribute('type', 'green'); content.append(tag); if (item.evidence) content.append(el('p', item.evidence)); }
    li.append(content, copyButton(`Copy hook ${String.fromCharCode(65 + index)}`, hook)); list.append(li);
  });
  section.append(list); return section;
}
