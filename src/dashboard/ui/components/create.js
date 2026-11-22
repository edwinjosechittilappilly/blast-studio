import '@carbon/web-components/es/components/text-input/index.js';
import '@carbon/web-components/es/components/textarea/index.js';
import '@carbon/web-components/es/components/checkbox/index.js';
import '@carbon/web-components/es/components/select/index.js';
import '@carbon/web-components/es/components/modal/index.js';
import '@carbon/web-components/es/components/notification/index.js';
import { api, headers } from './api.js';
import { el, button, copyButton } from './review.js';

const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const quote = value => /^[a-zA-Z0-9_./:=,-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
const route = value => encodeURIComponent(value);

function notification(kind, title, text) {
  const notice = el('cds-inline-notification');
  notice.setAttribute('kind', kind); notice.setAttribute('hide-close-button', ''); notice.setAttribute('title', title);
  if (text) notice.setAttribute('subtitle', text);
  return notice;
}

function field(label, multiline = false, helper = '') {
  const input = el(multiline ? 'cds-textarea' : 'cds-text-input');
  const labelNode = el('span', label); labelNode.slot = 'label-text'; input.append(labelNode);
  if (helper) input.setAttribute('helper-text', helper);
  if (multiline) input.setAttribute('rows', '3');
  input.style.display = 'block'; input.style.marginBlock = '1rem';
  input.addEventListener('input', () => input.removeAttribute('invalid'));
  return input;
}

function validateField(input, value, spec, key, project) {
  let error = '';
  if (!value) { if (spec.required) error = 'This field is required.'; }
  else if (value.length > 4096 || value.includes('\0')) error = 'Enter no more than 4096 characters.';
  else if (spec.kind === 'id' && !slug.test(value)) error = 'Use lowercase letters and numbers separated by single hyphens.';
  else if (spec.kind === 'repo' && (value === 'local' ? project : !/^[\w.-]+\/[\w.-]+$/.test(value))) error = project ? 'Enter a repository as owner/name.' : 'Enter owner/name or local.';
  else if (spec.kind === 'number' && !(key === 'pr' ? /^\d+$/.test(value) : /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value))) error = 'Enter a valid number.';
  else if (spec.kind === 'sha' && !/^[a-f\d]{4,64}$/i.test(value)) error = 'Enter a commit SHA (4–64 hexadecimal characters).';
  else if (spec.kind === 'path' && (value.startsWith('-') || value.split(/[\\/]/).includes('..'))) error = 'Enter a path without parent-directory segments.';
  else if (spec.kind === 'url') {
    try { const url = new URL(value); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error(); }
    catch { error = 'Enter an HTTP or HTTPS URL without credentials.'; }
  }
  if (error) { input.setAttribute('invalid-text', error); input.setAttribute('invalid', ''); }
  return !error;
}

function command(op, schema, args) {
  const positional = [], flags = [];
  for (const [key, spec] of Object.entries(schema.fields)) {
    if (args[key] === undefined) continue;
    for (const value of Array.isArray(args[key]) ? args[key] : [args[key]]) {
      if (spec.positional) positional.push(value);
      else if (spec.flag && value === true) flags.push(spec.flag);
      else if (spec.flag && value !== false) flags.push(`${spec.flag}=${value}`);
    }
  }
  return ['bstudio', ...op.split(' '), ...positional, ...flags].map(quote).join(' ');
}

function commandNotice(target, text) {
  const wrap = el('div', null, 'command-snippet'); wrap.append(el('code', text), copyButton('Copy command', text));
  target.replaceChildren(notification('info', 'Run this operation in a terminal', 'The configured image provider requires an interactive terminal.'), wrap);
}

function confirmPaid(budget, start) {
  const modal = el('cds-modal'); modal.setAttribute('aria-label', 'Confirm paid pipeline');
  const header = el('cds-modal-header'), heading = el('cds-modal-heading', 'Run full pipeline?'), close = el('cds-modal-close-button');
  header.append(close, heading);
  const body = el('cds-modal-body');
  body.append(el('p', 'Planning, generation, rendering and review may incur provider charges. Actual cost depends on the work generated.'));
  body.append(el('p', budget ? `Monthly spend: $${Number(budget.mtd).toFixed(2)} of $${Number(budget.cap).toFixed(2)}. Per-campaign limit: ${Number(budget.perProject) === 0 ? 'none' : `$${Number(budget.perProject).toFixed(2)}`}.` : 'Current budget is unavailable. Check Budget & providers before continuing.'));
  const footer = el('cds-modal-footer'), cancel = button('Cancel', 'secondary'), confirm = button('Run pipeline', 'primary');
  cancel.addEventListener('click', () => { modal.open = false; });
  confirm.addEventListener('click', () => { modal.open = false; start(); });
  footer.append(cancel, confirm); modal.append(header, body, footer); document.body.append(modal);
  modal.addEventListener('cds-modal-closed', () => modal.remove()); modal.open = true;
}

async function monitor(region, job, success, submit) {
  const status = el('div'), log = el('pre', '', 'job-log'), cancel = button('Cancel job', 'secondary');
  const details = el('details'); details.open = true; details.append(el('summary', 'Job log'), log);
  status.setAttribute('role', 'status'); log.style.whiteSpace = 'pre-wrap'; log.style.overflowWrap = 'anywhere';
  cancel.addEventListener('click', async () => {
    cancel.disabled = true;
    try { await api(`/api/jobs/${encodeURIComponent(job.id)}/cancel`, { method: 'POST', headers }); }
    catch (error) { status.replaceChildren(notification('error', 'Could not cancel job', error.message)); cancel.disabled = false; }
  });
  region.replaceChildren(status, cancel, details);
  async function update() {
    if (!region.isConnected) return;
    try {
      const [current, output] = await Promise.all([api(`/api/jobs/${encodeURIComponent(job.id)}`), api(`/api/jobs/${encodeURIComponent(job.id)}/log?tail=200`)]);
      if (!region.isConnected) return;
      log.textContent = output.log || 'Waiting for output…';
      const running = current.state === 'queued' || current.state === 'running';
      status.replaceChildren(notification(current.state === 'failed' ? 'error' : current.state === 'succeeded' ? 'success' : 'info', current.cancelRequested && running ? 'Cancelling job…' : `Job ${current.state}`, current.state === 'failed' ? 'Review the log, correct the problem, and try again.' : ''));
      cancel.hidden = !running; cancel.disabled = !!current.cancelRequested;
      if (running) setTimeout(update, 2000);
      else if (current.state === 'succeeded') success();
      else submit.disabled = false;
    } catch (error) {
      if (!region.isConnected) return;
      status.replaceChildren(notification('error', 'Could not load job status', error.message));
      const retry = button('Retry status', 'secondary'); retry.addEventListener('click', update, { once: true }); status.append(retry);
    }
  }
  await update();
}

async function render(container, ctx, projectMode) {
  const loading = el('p', 'Loading creation options…', 'empty'); container.replaceChildren(loading);
  let operations;
  try { operations = await api('/api/operations'); }
  catch (error) {
    const retry = button('Try again', 'secondary'); retry.addEventListener('click', () => render(container, ctx, projectMode));
    if (!loading.isConnected) return;
    container.replaceChildren(notification('error', 'Unable to load creation options', error.message), retry); return;
  }
  if (!loading.isConnected) return;
  const schemas = projectMode ? [operations['project new']] : [operations.new, operations.brief];
  if (schemas.some(schema => !schema)) { container.replaceChildren(notification('error', 'Creation is unavailable', 'The server did not provide the required operation schema.')); return; }
  const page = el('div', null, 'surface'); page.style.maxWidth = '48rem';
  const title = el('h1', projectMode ? 'New project' : 'New campaign');
  page.append(title, el('p', projectMode ? 'Create a project and add shared evidence for its campaigns.' : `Create a campaign in ${ctx.project}. Project evidence is included automatically.`, 'muted'));
  const form = el('form'); form.noValidate = true;
  const id = field(projectMode ? 'Project name / ID' : 'Campaign ID', false, 'Lowercase letters and numbers, separated by hyphens.');
  const preview = el('p', '', 'muted'); preview.setAttribute('aria-live', 'polite');
  function updatePreview() { preview.textContent = projectMode ? `Project address: ${id.value || 'project-id'}` : `Campaign address: ${ctx.project}/${id.value || 'campaign-id'}`; }
  id.addEventListener('input', updatePreview); updatePreview(); form.append(id, preview);
  const inputs = {};
  const definitions = projectMode ? [
    ['repo', 'Repository', false, 'GitHub owner/name (optional).'], ['url', 'URLs', true, 'One HTTP or HTTPS URL per line.'], ['note', 'Notes', true, 'One shared evidence note per line.'],
  ] : [
    ['idea', 'Idea', true, 'Optional campaign idea.'], ['note', 'Notes', true, 'Optional campaign evidence.'], ['url', 'URL', false, 'Optional HTTP or HTTPS source.'], ['pr', 'Pull request number', false, 'Requires a GitHub repository.'], ['commit', 'Commit SHA', false, 'Requires a repository.'], ['repo', 'Repository', false, 'GitHub owner/name, or local for a commit.'], ['mbBrief', 'Market Blaster brief path', false, 'Path to an existing brief.'],
  ];
  for (const [key, label, multiline, helper] of definitions) { inputs[key] = field(label, multiline, helper); form.append(inputs[key]); }
  let mode, force;
  if (!projectMode) {
    mode = el('cds-select'); mode.setAttribute('label-text', 'Creation mode'); mode.value = 'brief'; mode.style.display = 'block'; mode.style.marginBlock = '1rem';
    for (const [value, label] of [['brief', 'Brief only'], ['new', 'Run full pipeline']]) { const option = el('cds-select-item', label); option.setAttribute('value', value); mode.append(option); }
    form.append(mode);
    force = el('cds-checkbox'); force.setAttribute('label-text', 'Replace an existing brief (--force)'); force.setAttribute('helper-text', 'The existing brief will be overwritten.'); form.append(force);
  }
  const tty = el('div'), errors = el('div'), progress = el('section'); errors.setAttribute('role', 'alert');
  const actions = el('div', null, 'form-actions'), cancel = button('Cancel', 'secondary'), submit = button(projectMode ? 'Create project' : 'Create campaign', 'primary');
  cancel.addEventListener('click', () => { location.hash = projectMode ? '#/projects' : `#/p/${route(ctx.project)}`; }); actions.append(cancel, submit); form.append(tty, errors, progress, actions); page.append(form); container.replaceChildren(page);
  const argsFor = () => {
    const args = projectMode ? { project: id.value.trim() } : { campaign: `${ctx.project}/${id.value.trim()}` };
    for (const [key, input] of Object.entries(inputs)) {
      const value = input.value?.trim(); if (!value) continue;
      args[key] = projectMode && (key === 'url' || key === 'note') ? value.split('\n').map(line => line.trim()).filter(Boolean) : value;
    }
    if (force?.checked) args.force = true;
    return args;
  };
  function updateTTY() {
    const op = mode?.value || 'brief', schema = operations[op];
    if (!projectMode && schema?.requiresTTY) commandNotice(tty, command(op, schema, argsFor())); else tty.replaceChildren();
  }
  form.addEventListener('input', () => { errors.replaceChildren(); updateTTY(); }); mode?.addEventListener('cds-select-selected', updateTTY); force?.addEventListener('cds-checkbox-changed', updateTTY); updateTTY();
  form.addEventListener('submit', event => event.preventDefault());
  submit.addEventListener('click', async event => {
    event.preventDefault(); errors.replaceChildren();
    const op = projectMode ? 'project new' : mode.value || 'brief', schema = operations[op], args = argsFor();
    let valid = validateField(id, id.value.trim(), projectMode ? schema.fields.project : { kind: 'id', required: true }, 'id', projectMode);
    for (const [key, input] of Object.entries(inputs)) {
      const values = Array.isArray(args[key]) ? args[key] : [args[key] || ''];
      for (const value of values) if (!validateField(input, value, schema.fields[key], key, projectMode)) { valid = false; break; }
    }
    if (!projectMode && (args.pr || args.commit) && !args.repo) { inputs.repo.setAttribute('invalid-text', 'A repository is required for a pull request or commit.'); inputs.repo.setAttribute('invalid', ''); valid = false; }
    if (!projectMode && args.pr && args.repo === 'local') { inputs.repo.setAttribute('invalid-text', 'A pull request requires a GitHub owner/name.'); inputs.repo.setAttribute('invalid', ''); valid = false; }
    if (!valid) { errors.append(notification('error', 'Check the highlighted fields')); return; }
    if (schema.requiresTTY) { updateTTY(); return; }
    const start = async () => {
      submit.disabled = true; errors.replaceChildren();
      try {
        const body = projectMode ? { op, args } : { op, campaign: args.campaign, args: Object.fromEntries(Object.entries(args).filter(([key]) => key !== 'campaign')) };
        const job = await api('/api/jobs', { method: 'POST', headers, body: JSON.stringify(body) });
        await monitor(progress, job, () => { location.hash = projectMode ? `#/p/${route(args.project)}` : `#/p/${args.campaign.split('/').map(route).join('/')}/overview`; }, submit);
      } catch (error) { errors.replaceChildren(notification('error', 'Could not start job', error.message)); if (error.command) { const terminal = el('div'); commandNotice(terminal, error.command); errors.append(terminal); } submit.disabled = false; }
    };
    if (schema.paid) {
      submit.disabled = true;
      let budget; try { budget = await api('/api/budget'); } catch { /* Confirm with an explicit unavailable state. */ }
      submit.disabled = false;
      if (page.isConnected) confirmPaid(budget, start);
    }
    else await start();
  });
}

export function renderNewProject(container, ctx = {}) { return render(container, ctx, true); }
export function renderNewCampaign(container, ctx) { return render(container, ctx, false); }
