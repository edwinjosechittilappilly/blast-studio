import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildOperation, campaignRef } from '../src/jobs/registry.ts';
import { acquireCampaignLock, cancelJob, JobConflict, listJobs } from '../src/jobs/runner.ts';
import { saveSecret } from '../src/jobs/secrets.ts';
import { realIO } from '../src/cli.ts';
import { usualStepMs } from '../src/budget/ledger.ts';
import { tempStudio } from './helpers.ts';

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

test('interrupting a blocked fetch terminates the CLI and releases its campaign', { timeout: 10000 }, async () => {
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
    child.kill('SIGINT');
    const [code] = await exit;
    assert.equal(code, 130);
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
