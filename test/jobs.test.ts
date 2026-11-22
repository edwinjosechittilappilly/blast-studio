import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildOperation, campaignRef } from '../src/jobs/registry.ts';
import { acquireCampaignLock, cancelJob, JobConflict, listJobs } from '../src/jobs/runner.ts';
import { saveSecret } from '../src/jobs/secrets.ts';
import { realIO } from '../src/cli.ts';
import { tempStudio } from './helpers.ts';

test('registry validates campaign addresses and constructs an argument vector', () => {
  const job = buildOperation('render', { campaign: 'acme/launch', assets: 'card-one,card-two', regen: true });
  assert.deepEqual(job.args, ['render', 'acme/launch', '--assets=card-one,card-two', '--regen']);
  assert.equal(campaignRef('legacy'), 'legacy');
  for (const invalid of ['../other', 'acme/../other', 'a/b/c', '/tmp', 'A']) assert.throws(() => campaignRef(invalid));
  assert.throws(() => buildOperation('sh -c', { campaign: 'acme/launch' }));
  assert.throws(() => buildOperation('render', { campaign: 'acme/launch', shell: 'touch /tmp/x' }));
  assert.throws(() => buildOperation('mark', { campaign: 'acme/launch', platform: 'x', url: 'javascript:alert(1)' }));
});

test('terminal-only provider gives a copyable command', () => {
  const job = buildOperation('render', { campaign: 'acme/launch' }, { imageProvider: 'omp' });
  assert.equal(job.requiresTTY, true);
  assert.equal(job.command, 'bstudio render acme/launch');
});

test('campaign lock excludes concurrent owners but not other campaigns', () => {
  const root = mkdtempSync(join(tmpdir(), 'bstudio-jobs-'));
  try {
    const release = acquireCampaignLock(root, 'acme/launch');
    assert.throws(() => acquireCampaignLock(root, 'acme/launch'), JobConflict);
    const other = acquireCampaignLock(root, 'acme/other'); other(); release();
    const again = acquireCampaignLock(root, 'acme/launch'); again();
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
  let running = true, observed = false;
  // A real child must remain alive after its first output to prove pre-exit streaming.
  const promise = io.run(process.execPath, ['-e', 'console.log("first"); setTimeout(() => console.log("last"), 50)'], { onOutput: line => { if (line === 'first' && running) observed = true; } });
  const result = await promise; running = false;
  assert.equal(observed, true);
  assert.equal(result, 'first\nlast\n');
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
