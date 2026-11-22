import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildOperation, campaignRef } from '../src/jobs/registry.ts';
import { acquireCampaignLock, cancelJob, JobConflict, listJobs, processGroupRunning } from '../src/jobs/runner.ts';
import { saveSecret } from '../src/jobs/secrets.ts';
import { main, realIO } from '../src/cli.ts';
import { runBilledAgent } from '../src/agent-env.ts';
import { loadConfig } from '../src/config.ts';
import { usualStepMs } from '../src/budget/ledger.ts';
import { fakeIO, tempStudio } from './helpers.ts';

test('registry validates campaign addresses and constructs an argument vector', () => {
  const job = buildOperation('render', { campaign: 'launch', assets: 'card-one,card-two', regen: true });
  assert.deepEqual(job.args, ['render', 'launch', '--assets=card-one,card-two', '--regen']);
  assert.equal(campaignRef('legacy'), 'legacy');
  for (const invalid of ['../other', 'acme/launch', 'acme/../other', 'a/b/c', '/tmp', 'A']) assert.throws(() => campaignRef(invalid));
  assert.throws(() => buildOperation('sh -c', { campaign: 'launch' }));
  assert.throws(() => buildOperation('render', { campaign: 'launch', shell: 'touch /tmp/x' }));
  assert.throws(() => buildOperation('mark', { campaign: 'launch', platform: 'x', url: 'javascript:alert(1)' }));
});

test('terminal-only provider gives a copyable command', () => {
  const job = buildOperation('render', { campaign: 'launch' }, { imageProvider: 'omp' });
  assert.equal(job.requiresTTY, true);
  assert.equal(job.command, 'bstudio render launch');
});

test('campaign lock excludes concurrent owners but not other campaigns', () => {
  const root = mkdtempSync(join(tmpdir(), 'bstudio-jobs-'));
  try {
    mkdirSync(join(root, 'projects', 'launch'), { recursive: true });
    mkdirSync(join(root, 'projects', 'other'), { recursive: true });
    const release = acquireCampaignLock(root, 'launch');
    assert.throws(() => acquireCampaignLock(root, 'launch'), JobConflict);
    const other = acquireCampaignLock(root, 'other'); other(); release();
    const again = acquireCampaignLock(root, 'launch'); again();
    assert.throws(() => acquireCampaignLock(root, 'acme/launch'), /Invalid campaign address/);
    assert.throws(() => acquireCampaignLock(root, 'missing'), /not found/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('credentials are passed only through Keychain stdin and failures are redacted', () => {
  let argv: string[] = [], input = '';
  saveSecret('OPENAI_API_KEY', 'sensitive-value', { platform: 'darwin', runner: (args, data) => { argv = args; input = data ?? ''; return ''; } });
  assert.deepEqual(argv, ['-i']);
  assert.ok(!argv.join(' ').includes('sensitive-value'));
  assert.match(input, /73656e7369746976652d76616c7565/);
  assert.throws(() => saveSecret('OPENAI_API_KEY', 'sensitive-value', { platform: 'darwin', runner: () => { throw new Error('sensitive-value'); } }), error => !String(error).includes('sensitive-value'));
});

test('program output is streamed before process completion', async () => {
  const io = realIO();
  let pid = 0, observed = false;
  const promise = io.run(process.execPath, ['-e', 'const timer=setInterval(()=>{},10000); process.on("SIGUSR1",()=>{clearInterval(timer); console.log("last"); process.exit(0)}); console.log("pid:"+process.pid); console.log("first");'], {
    onOutput: line => { if (line.startsWith('pid:')) pid = Number(line.slice(4)); if (line === 'first') { observed = true; process.kill(pid, 'SIGUSR1'); } },
  });
  const result = await promise;
  assert.equal(observed, true);
  assert.match(result, /^pid:\d+\nfirst\nlast\n$/);
});

test('cancelling a foreground CLI job terminates its agent and grandchild', { timeout: 15000 }, async () => {
  const script = `const {spawn}=require('node:child_process'); const child=spawn(process.execPath,['-e','setInterval(() => {},1000)']); console.error('grandchild:'+child.pid); setInterval(() => {},1000);`;
  const config = `brand:\n  name: Test\nagent:\n  command: ${JSON.stringify([process.execPath, '-e', script])}\n`;
  const root = tempStudio({ 'studio.yml': config, 'projects/demo/brief.md': '# Brief\n' });
  const child = spawn(process.execPath, ['bin/bstudio.mjs', 'plan', 'demo'], {
    cwd: process.cwd(), env: { ...process.env, BSTUDIO_HOME: root, BSTUDIO_CONFIG: join(root, 'studio.yml') }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const exit = once(child, 'exit');
  let output = '', grandchild = 0;
  try {
    for await (const chunk of child.stderr!) {
      output += chunk.toString();
      const match = /grandchild:(\d+)/.exec(output);
      if (match) {
        grandchild = Number(match[1]);
        const job = listJobs(root).find(item => item.operation === 'plan' && item.state === 'running');
        const competing = spawnSync(process.execPath, ['bin/bstudio.mjs', 'plan', 'demo'], {
          cwd: process.cwd(), env: { ...process.env, BSTUDIO_HOME: root, BSTUDIO_CONFIG: join(root, 'studio.yml') }, encoding: 'utf8',
        });
        assert.equal(competing.status, 1);
        assert.match(competing.stderr, /locked by/);
        assert.ok(job); cancelJob(root, job.id); break;
      }
    }
    assert.ok(grandchild, output);
    await exit;
    assert.throws(() => process.kill(grandchild, 0), { code: 'ESRCH' });
    assert.equal(listJobs(root)[0].state, 'cancelled');
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    rmSync(root, { recursive: true, force: true });
  }
});

for (const [signal, expected] of [['SIGINT', 130], ['SIGHUP', 129]] as const) test(`${signal} during a blocked fetch releases its campaign`, { timeout: 10000 }, async () => {
  const root = tempStudio(), server = createServer(() => {});
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const request = once(server, 'request');
  const child = spawn(process.execPath, ['bin/bstudio.mjs', 'brief', '--url', `http://127.0.0.1:${address.port}/`, 'demo'], {
    cwd: process.cwd(), env: { ...process.env, BSTUDIO_HOME: root, BSTUDIO_CONFIG: join(root, 'studio.yml') }, stdio: 'ignore',
  });
  const exit = once(child, 'exit');
  try {
    await request;
    child.kill(signal);
    const [code] = await exit;
    assert.equal(code, expected);
    assert.equal(listJobs(root)[0].state, 'cancelled');
    const release = acquireCampaignLock(root, 'demo'); release();
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
  }
});

test('stale locks and reused PIDs cannot block a campaign', () => {
  const root = tempStudio({ 'projects/demo/brief.md': '# demo' });
  try {
    const path = join(root, 'projects/demo/.bstudio-job.lock');
    writeFileSync(path, JSON.stringify({ id: 'old', pid: process.pid, processStarted: 'a different process' }));
    const release = acquireCampaignLock(root, 'demo'); release();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('ETA ignores failed and legacy runs', () => {
  const root = tempStudio();
  try {
    const line = (ms: number, extra: object) => JSON.stringify({ id: 'x', type: 'agent', at: '2026-01-01', usd: null, projectSlug: 'demo', provider: 'agent', model: 'test', ms, ...extra });
    writeFileSync(join(root, 'ledger.jsonl'), [line(500, {}), line(1000, { step: 'plan', succeeded: false }), line(3000, { step: 'plan', succeeded: true })].join('\n') + '\n');
    assert.equal(usualStepMs(root, 'plan'), 3000);
    assert.equal(usualStepMs(root, 'review'), undefined);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('leading-dash text stays a single valued option', () => {
  assert.deepEqual(buildOperation('brief', { campaign: 'demo', note: '- tighten hook' }).args, ['brief', 'demo', '--note=- tighten hook']);
  assert.throws(() => buildOperation('brief', { campaign: 'demo', pr: '1.5' }));
});

test('registered workflow arguments reach merged CLI parsers', async () => {
  const root = tempStudio({
    'projects/demo/brief.md': '# Brief',
    'projects/demo/plan.yml': '- platform: bluesky\n  type: text\n  angle: Demo\n  hooks: [one, two, three]\n  assets: []\n',
  });
  const io = fakeIO({ cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: join(root, 'studio.yml') } });
  try {
    for (const name of ['plan', 'make']) {
      const args = buildOperation(name, { campaign: 'demo', platforms: 'unknown' }).args;
      assert.equal(await main(args, io), 1);
      assert.match(io.stderr.at(-1)!, /Unknown platform/);
    }
    assert.equal(await main(buildOperation('feedback add', { campaign: 'demo', note: '- improve' }).args, io), 0);
    assert.equal(await main(buildOperation('feedback list', { campaign: 'demo' }).args, io), 0);
    assert.ok(io.stdout.some(line => line.includes('- improve')));
    assert.equal(await main(buildOperation('history', { campaign: 'demo' }).args, io), 0);
    assert.equal(await main(buildOperation('restore', { campaign: 'demo', version: '999' }).args, io), 1);
    assert.match(io.stderr.at(-1)!, /Unknown history snapshot/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('quiet suppresses live output but preserves job log and step timing', async () => {
  const root = tempStudio(), lines: string[] = [];
  const io = fakeIO({ cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: join(root, 'studio.yml') }, step: 'plan', quiet: true, log: line => lines.push(line),
    run: async (_command, _args, options) => { options?.onOutput?.('agent output'); return 'done'; } });
  try {
    await runBilledAgent(io, loadConfig(io), {}, 'demo', ['agent'], 'prompt', root, root, {}, 1000);
    assert.deepEqual(io.stderr, []);
    assert.ok(lines.some(line => line.includes('[plan] agent')));
    assert.ok(lines.includes('agent output'));
    assert.notEqual(usualStepMs(root, 'plan'), undefined);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a finished global job is recovered without trusting a reused PID', () => {
  const root = tempStudio(), id = 'a0000000-0000-4000-8000-000000000000', dir = join(root, 'logs/jobs');
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${id}.json`), JSON.stringify({ id, operation: 'doctor', state: 'running', createdAt: '2026-01-01', updatedAt: '2026-01-01', pid: process.pid, processStarted: 'old process', completed: true, exitCode: 0, command: 'bstudio doctor' }));
    assert.equal(listJobs(root)[0].state, 'succeeded');
    assert.throws(() => cancelJob(root, id), /not running/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('an aged malformed campaign lock can be recovered', () => {
  const root = tempStudio({ 'projects/demo/brief.md': '# demo' });
  try {
    const path = join(root, 'projects/demo/.bstudio-job.lock');
    writeFileSync(path, '');
    utimesSync(path, new Date(0), new Date(0));
    const release = acquireCampaignLock(root, 'demo'); release();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('program timeout terminates descendants holding output pipes', { timeout: 5000 }, async () => {
  let grandchild = 0, group = 0;
  const script = `const {spawn}=require('node:child_process'); const c=spawn(process.execPath,['-e','process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'],{stdio:'inherit'}); console.log('group:'+process.pid); console.log('child:'+c.pid); setInterval(()=>{},1000);`;
  await assert.rejects(realIO().run(process.execPath, ['-e', script], { timeoutMs: 500, onOutput: line => { if (line.startsWith('child:')) grandchild = Number(line.slice(6)); if (line.startsWith('group:')) group = Number(line.slice(6)); } }), /timed out/);
  assert.ok(grandchild);
  assert.ok(group); assert.equal(processGroupRunning(group), false);
  if (process.platform === 'linux') {
    let state = '';
    try { const stat = readFileSync(`/proc/${grandchild}/stat`, 'utf8'); state = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[0]; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    assert.ok(state === '' || state === 'Z', `descendant is still running: ${state}`);
  } else assert.throws(() => process.kill(grandchild, 0), { code: 'ESRCH' });
});
