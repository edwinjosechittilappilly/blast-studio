import '@carbon/web-components/es/components/number-input/index.js';
import '@carbon/web-components/es/components/select/index.js';
import '@carbon/web-components/es/components/toggle/index.js';
import '@carbon/web-components/es/components/password-input/index.js';
import '@carbon/web-components/es/components/modal/index.js';
import '@carbon/web-components/es/components/tile/index.js';
import { api, headers } from './api.js';
import { el, button } from './review.js';
import { notice, runJob, table, tag } from './health.js';

const money = value => `$${Number(value || 0).toFixed(2)}`;
function field(tagName, label, value, helper) {
  const node = el(tagName); node.setAttribute(tagName === 'cds-select' ? 'label-text' : 'label', label); if (helper) node.setAttribute('helper-text', helper); if (value != null) node.value = String(value); return node;
}
function select(label, value, options) {
  const node = field('cds-select', label, null); for (const [id, text] of options) { const item = el('cds-select-item', text); item.setAttribute('value', id); if (id === value) item.setAttribute('selected', ''); node.append(item); } node.value = value; return node;
}
function confirmVerify(id, action) {
  const modal = el('cds-modal'), header = el('cds-modal-header'), body = el('cds-modal-body'), footer = el('cds-modal-footer');
  header.append(el('cds-modal-heading', 'Verify source'), el('cds-modal-close-button'));
  body.append(el('p', `Confirm that you have manually reviewed ${id} and its platform guidance. This updates verification dates in the platform packs.`));
  const cancel = button('Cancel', 'secondary'), verify = button('Verify source', 'primary');
  cancel.addEventListener('click', () => { modal.open = false; }); verify.addEventListener('click', () => { modal.open = false; action(); });
  footer.append(cancel, verify); modal.append(header, body, footer); document.body.append(modal); modal.addEventListener('cds-modal-closed', () => modal.remove()); modal.open = true;
}

function confirmKeys(keys) {
  return new Promise(resolve => {
    const modal = el('cds-modal'), header = el('cds-modal-header'), body = el('cds-modal-body'), footer = el('cds-modal-footer');
    header.append(el('cds-modal-heading', 'Save provider keys?'), el('cds-modal-close-button'));
    body.append(el('p', `Save ${keys.join(', ')} to the login keychain? Existing keychain values will be overwritten for all studios.`));
    const cancel = button('Cancel', 'secondary'), confirm = button('Save keys', 'primary');
    const finish = confirmed => { modal.open = false; modal.remove(); resolve(confirmed); };
    cancel.addEventListener('click', () => finish(false));
    confirm.addEventListener('click', () => finish(true));
    footer.append(cancel, confirm); modal.append(header, body, footer); document.body.append(modal);
    modal.addEventListener('cds-modal-closed', () => finish(false));
    modal.open = true;
  });
}

export async function renderSettings(container) {
  container.replaceChildren(el('h1', 'Budget & providers'), el('p', 'Loading settings…'));
  let data; try { data = await api('/api/budget'); } catch (error) { container.replaceChildren(el('h1', 'Budget & providers'), notice(error.message)); return; }
  const intro = el('p', 'Manage spending limits, generation providers and credentials.'), spend = el('div', null, 'summary-tiles');
  for (const [label, value] of [['Spent this month', data.mtd], ['Monthly cap', data.cap], ...Object.entries(data.providerTotals || {}).map(([name, amount]) => [`${name} spend`, amount]), ...Object.entries(data.projects || {}).map(([name, amount]) => [`${name} spend`, amount])]) { const tile = el('cds-tile'); tile.append(el('strong', money(value)), el('span', label)); spend.append(tile); }
  const form = el('form'); form.noValidate = true; const grid = el('div', null, 'settings-grid'), budget = el('section', null, 'surface'), providers = el('section', null, 'surface');
  const monthly = field('cds-number-input', 'Monthly cap (USD)', data.cap, 'Zero blocks paid calls.'), campaign = field('cds-number-input', 'Per-campaign cap (USD)', data.perProject, 'Zero means no campaign limit.');
  for (const input of [monthly, campaign]) { input.setAttribute('min', '0'); input.setAttribute('step', 'any'); input.setAttribute('invalid-text', 'Enter a non-negative amount.'); }
  budget.append(el('h2', 'Spending limits'), monthly, campaign);
  const images = select('Images', data.providers.images, [['none', 'None — disabled'], ['gemini', 'Gemini — paid'], ['openai', 'OpenAI — paid'], ['omp', 'OMP']]);
  const voice = select('Voice', data.providers.voice, [['none', 'None — disabled'], ['openai', 'OpenAI — paid']]);
  const consent = el('cds-toggle'); consent.setAttribute('label-text', 'Allow uploads to external providers'); consent.checked = data.providers.allowUpload === true;
  providers.append(el('h2', 'Providers'), el('p', 'Paid services count against your budget.'), images, voice, consent, el('p', 'Enable only if you consent to sending assets to external providers.'));
  grid.append(budget, providers); const result = el('div'); result.setAttribute('aria-live', 'polite'); const save = button('Save settings', 'primary'); save.setAttribute('type', 'button');
  const clear = () => { result.replaceChildren(); for (const input of [monthly, campaign]) { const raw = String(input.value ?? '').trim(); input.invalid = !raw || !Number.isFinite(Number(raw)) || Number(raw) < 0; } };
  for (const event of ['input', 'change', 'cds-number-input', 'cds-select-selected', 'cds-toggle-changed']) form.addEventListener(event, () => queueMicrotask(clear));
  form.append(grid, result, save);
  const credentials = el('section', null, 'surface'), authStatus = el('div'); let keyStatus = null;
  credentials.append(el('h2', 'Provider keys'), el('p', 'Saved to your macOS login keychain (shared by all studios). Existing values are never displayed.'), authStatus);
  const keyInputs = [];
  for (const [key, label] of [['GEMINI_API_KEY', 'Gemini API key'], ['OPENAI_API_KEY', 'OpenAI API key']]) {
    const input = field('cds-password-input', label, '', 'Leave blank to keep the existing key.');
    input.setAttribute('autocomplete', 'off');
    // Carbon's password input renders a label without associating it with its input.
    input.updateComplete.then(() => input.shadowRoot.querySelector('label').setAttribute('for', 'input'));
    keyInputs.push([key, input]); credentials.append(input);
  }
  const keyResult = el('div'); keyResult.setAttribute('aria-live', 'polite'); credentials.append(keyResult);
  const saveSettings = async event => {
    event.preventDefault(); if (save.disabled) return; clear(); keyResult.replaceChildren();
    if (monthly.invalid || campaign.invalid) { (monthly.invalid ? monthly : campaign).focus(); return; }
    const entered = keyInputs.filter(([, input]) => input.value).map(([key]) => key);
    save.disabled = true;
    const saveKeys = entered.length && keyStatus ? await confirmKeys(entered) : false;
    if (entered.length && !saveKeys) keyResult.replaceChildren(notice(keyStatus ? 'Keys not saved.' : 'Keys not saved. Credential status is unavailable; reload before saving keys.'));
    try {
      await api('/api/budget', { method: 'PUT', headers, body: JSON.stringify({ monthlyUsd: Number(monthly.value), perProjectUsd: Number(campaign.value) }) });
      await api('/api/providers', { method: 'PUT', headers, body: JSON.stringify({ images: images.value, voice: voice.value, allowUpload: consent.checked }) });
      let savedKeys = false;
      if (saveKeys) for (const [key, input] of keyInputs) if (input.value) { await api('/api/secrets', { method: 'POST', headers, body: JSON.stringify({ key, value: input.value }) }); input.value = ''; savedKeys = true; }
      result.replaceChildren(notice('Settings saved.', 'success'));
      if (savedKeys) await refreshAuth();
    } catch (error) { result.replaceChildren(notice(`Could not save all settings: ${error.message}`)); }
    finally { save.disabled = false; }
  };
  save.addEventListener('click', saveSettings); form.addEventListener('submit', saveSettings);
  form.insertBefore(credentials, result); container.replaceChildren(el('h1', 'Budget & providers'), intro, spend, form);
  async function refreshAuth() {
    try {
      keyStatus = await api('/api/secrets/status');
      authStatus.replaceChildren(table(['Credential', 'Presence and source'], Object.entries(keyStatus).map(([key, status]) => [key, status.set ? `Set · ${status.source}` : 'Not set'])));
    } catch (error) { keyStatus = null; authStatus.replaceChildren(notice(`Could not read credential presence: ${error.message}`)); }
  }
  await refreshAuth();
}

export async function renderSources(container) {
  const title = el('h1', 'Source updates'), description = el('p', 'Review source changes and verify platform guidance after a manual check.'), run = button('Check sources', 'primary'), job = el('div', null, 'job-status'), results = el('div');
  container.replaceChildren(title, description, run, job, results);
  async function load() {
    try {
      const data = await api('/api/sources'), rows = [];
      for (const block of (data.report || '').split(/^## /m).slice(1)) {
        const lines = block.split(/\r?\n/), match = /^([^:]+):\s*(changed|new|failed|manual)\b/i.exec(lines[0]);
        if (match) rows.push({ id: match[1], status: match[2].toLowerCase(), title: lines.find(line => line.startsWith('Title: '))?.slice(7), url: lines.find(line => line.startsWith('URL: '))?.slice(5), fields: lines.find(line => line.startsWith('Fields: '))?.slice(8), error: lines.find(line => line.startsWith('Error: '))?.slice(7), previous: lines.find(line => line.startsWith('Previous: '))?.slice(10), current: lines.find(line => line.startsWith('Current: '))?.slice(9) });
      }
      results.replaceChildren(el('h2', `Last checked: ${data.lastCheck || 'Never'}`));
      if (!rows.length) results.append(el('p', data.lastCheck ? 'No changed, failed or manual sources in the latest report.' : 'No source check has been run yet.'));
      else results.append(table(['Source', 'Status', 'Details', 'Action'], rows.map(({ id, status, title, url, fields, error, previous, current }) => {
        const source = el('div'); source.append(el('strong', title || id)); if (title && title !== id) source.append(el('p', id));
        if (url && /^https?:\/\//i.test(url)) { const link = el('a', url); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; source.append(link); }
        const details = el('details'); details.append(el('summary', 'What changed'), el('p', error || `Affected guidance: ${fields || 'Not reported'}`));
        if (previous && current) { try { details.append(el('h4', 'Previous'), el('p', JSON.parse(previous)), el('h4', 'Current'), el('p', JSON.parse(current))); } catch { details.append(el('p', 'Snapshot details are unavailable.')); } }
        const action = el('span', '—');
        if (status === 'changed' || status === 'manual') { const verify = button('Verify', 'ghost'); verify.addEventListener('click', () => confirmVerify(id, async () => { await runJob(job, 'sources verify', { source: id }, async record => { if (record.state === 'succeeded') await load(); }); })); action.replaceChildren(verify); }
        return [source, tag(status === 'manual' ? 'Manual review' : status[0].toUpperCase() + status.slice(1), status === 'failed' ? 'red' : 'warm-gray'), details, action];
      })));
      if (data.unverified?.length) {
        const section = el('details'); section.append(el('summary', `Unverified guidance (${data.unverified.length})`), el('p', 'These fields do not yet have verification metadata.'));
        const groups = new Map(); for (const item of data.unverified) { const platform = item.split('.')[0]; if (!groups.has(platform)) groups.set(platform, []); groups.get(platform).push(item); }
        for (const [platform, items] of groups) { const group = el('details'), list = el('ul'); group.append(el('summary', `${platform} (${items.length})`)); for (const item of items) list.append(el('li', item)); group.append(list); section.append(group); } results.append(section);
      }
    } catch (error) { results.replaceChildren(notice(error.message)); }
  }
  run.addEventListener('click', async () => { run.disabled = true; await runJob(job, 'sources check', {}, async record => { run.disabled = false; if (record.state === 'succeeded' || record.state === 'failed') await load(); }); if (!job.querySelector('details')) run.disabled = false; });
  await load();
}
