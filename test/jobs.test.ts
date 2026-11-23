import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildOperation, campaignRef } from '../src/jobs/registry.ts';
import { acquireCampaignLock, campaignDirectory, campaignLockStatus, cancelJob, findJob, finishSpawnedJob, jobLog, jobLogTail, JobConflict, JobNotFound, JobNotRunning, listJobs, processGroupRunning, startCliJob, startJob } from '../src/jobs/runner.ts';
import { processStarted } from '../src/jobs/process.ts';
import { saveSecret } from '../src/jobs/secrets.ts';
import { main, realIO, withCampaignLock } from '../src/cli.ts';
import { run as jobsCommand } from '../src/commands/jobs.ts';
import { runBilledAgent } from '../src/agent-env.ts';
import { loadConfig } from '../src/config.ts';
import { usualStepMs } from '../src/budget/ledger.ts';
import { fakeIO, tempStudio } from './helpers.ts';
import { run as revise } from '../src/commands/revise.ts';

test('registry validates campaign addresses and constructs an argument vector', () => {
  const job = buildOperation('render', { campaign: 'acme/launch', assets: 'card-one,card-two', regen: true });
  assert.deepEqual(job.args, ['render', 'acme/launch', '--assets=card-one,card-two', '--regen']);
  assert.equal(campaignRef('acme/launch'), 'acme/launch');
  for (const invalid of ['legacy', '../other', 'acme/../other', 'a/b/c', '/tmp', 'A']) assert.throws(() => campaignRef(invalid));
  assert.throws(() => buildOperation('sh -c', { campaign: 'acme/launch' }));
  assert.throws(() => buildOperation('render', { campaign: 'acme/launch', shell: 'touch /tmp/x' }));
  assert.throws(() => buildOperation('mark', { campaign: 'acme/launch', platform: 'x', url: 'javascript:alert(1)' }));
  assert.throws(() => buildOperation('export', { campaign: 'acme/launch', local: true, force: true }), /Local export/);
  assert.throws(() => buildOperation('export', { campaign: 'acme/launch', local: true, mb: '/tmp' }), /Local export/);
});

test('delivery jobs allow only supported routes and preserve command order', () => {
  for (const delivery of ['manual', 'marketBlaster']) {
    const job = buildOperation('delivery', { campaign: 'acme/launch', platform: 'linkedin', delivery });
    assert.deepEqual(job.args, ['delivery', 'acme/launch', 'linkedin', delivery]);
    assert.equal(job.campaign, 'acme/launch');
    assert.equal(job.operation.paid, false);
  }
  for (const delivery of ['', 'automatic', 'marketblaster', '--help', null]) assert.throws(() => buildOperation('delivery', { campaign: 'acme/launch', platform: 'linkedin', delivery }));
  assert.throws(() => buildOperation('delivery', { campaign: 'acme/launch', platform: '../linkedin', delivery: 'manual' }));
  assert.throws(() => buildOperation('delivery', { campaign: 'acme/launch', platform: 'linkedin' }));
  assert.throws(() => buildOperation('delivery', { campaign: 'acme/launch', platform: 'linkedin', delivery: 'manual', extra: true }));
});

test('registry builds scoped and unscoped review revisions', () => {
  const campaign = 'acme/launch';
  assert.deepEqual(buildOperation('revise', { campaign }).args, ['revise', campaign]);
  const scoped = buildOperation('revise', { campaign, platform: 'linkedin', asset: 'hero-card' });
  assert.deepEqual(scoped.args, ['revise', campaign, '--asset=hero-card', '--platform=linkedin']);
  assert.equal(scoped.operation.paid, true);
  for (const key of ['asset', 'platform']) assert.throws(() => buildOperation('revise', { campaign, [key]: '../escape' }));
});

test('dashboard review revision arguments reach the CLI review loop', async () => {
  const root = tempStudio({ 'projects/acme/campaigns/launch/brief.md': '# Launch' });
  const io = fakeIO({ cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: join(root, 'studio.yml') } });
  const { args } = buildOperation('revise', { campaign: 'acme/launch' });
  await assert.rejects(revise(args.slice(1), io), /Run review before revise/);
});

test('blocker resolution jobs validate arguments and preserve command order', () => {
  const args = { campaign: 'acme/launch', target: 'post:linkedin', index: '0', text: '  - Missing source  ', reason: '- approved by owner' };
  const job = buildOperation('blockers resolve', args);
  assert.deepEqual(job.args, ['blockers', 'acme/launch', 'resolve', 'post:linkedin', '0', '--text=  - Missing source  ', '--reason=- approved by owner']);
  assert.equal(job.campaign, 'acme/launch');
  assert.equal(job.operation.paid, false);
  assert.deepEqual(buildOperation('blockers resolve', { ...args, target: 'asset:hero-card', index: '12' }).args, ['blockers', 'acme/launch', 'resolve', 'asset:hero-card', '12', '--text=  - Missing source  ', '--reason=- approved by owner']);
  for (const target of ['post:../x', 'asset:', 'post:-x', 'other:card', 'post:linkedin/other']) assert.throws(() => buildOperation('blockers resolve', { ...args, target }));
  for (const index of ['-1', '1.5', '01', '9007199254740992', '', 0]) assert.throws(() => buildOperation('blockers resolve', { ...args, index }));
  for (const reason of ['', '  ']) assert.throws(() => buildOperation('blockers resolve', { ...args, reason }));
  for (const text of ['', '  ']) assert.throws(() => buildOperation('blockers resolve', { ...args, text }));
  const { text: _text, ...withoutText } = args;
  assert.throws(() => buildOperation('blockers resolve', withoutText), /Missing text/);
  assert.throws(() => buildOperation('blockers resolve', { ...args, extra: true }));
  assert.throws(() => buildOperation('blockers resolve', { campaign: args.campaign, target: args.target, index: args.index }));
});

test('project operations use global structured arguments', () => {
  const job = buildOperation('project new', { project: 'acme', repo: 'org/repo', url: ['https://example.com/a', 'https://example.com/b'], note: ['- first', 'second'] });
  assert.equal(job.campaign, undefined);
  assert.equal(job.operation.campaign, false);
  assert.deepEqual(job.args, ['project', 'new', 'acme', '--repo=org/repo', '--url=https://example.com/a', '--url=https://example.com/b', '--note=- first', '--note=second']);
  assert.deepEqual(buildOperation('project list', {}).args, ['project', 'list']);
  assert.throws(() => buildOperation('project new', { project: '../acme' }));
  assert.throws(() => buildOperation('project new', { project: 'acme', repo: 'local' }));
  assert.throws(() => buildOperation('project new', { project: 'acme', url: ['https://example.com', 'file:///etc/passwd'] }));
});

test('rename operations use validated structured arguments', () => {
  assert.deepEqual(buildOperation('project rename', { project: 'acme', destination: 'other' }).args, ['project', 'rename', 'acme', 'other']);
  assert.deepEqual(buildOperation('campaign rename', { source: 'acme/launch', destination: 'other/news' }).args, ['campaign', 'rename', 'acme/launch', 'other/news']);
  assert.throws(() => buildOperation('project rename', { project: '../acme', destination: 'other' }));
  assert.throws(() => buildOperation('campaign rename', { source: 'acme/launch', destination: '../news' }));
  assert.throws(() => buildOperation('campaign rename', { source: 'acme/launch', destination: 'other/news', flag: '--force' }));
  assert.deepEqual(buildOperation('accept', { campaign: 'acme/launch', platform: 'x', reason: '- checked by legal' }).args, ['accept', 'acme/launch', 'x', '--reason=- checked by legal']);
  assert.deepEqual(buildOperation('confirm', { campaign: 'acme/launch', asset: 'image', license: '- license' }).args, ['confirm', 'acme/launch', 'image', '--license=- license']);
});

test('project registry arguments reach project commands', async () => {
  const root = tempStudio();
  const io = fakeIO({ cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: join(root, 'studio.yml') } });
  try {
    assert.equal(await main(buildOperation('project new', { project: 'acme', note: ['- first', 'second'] }).args, io), 0);
    assert.equal(await main(buildOperation('project list', {}).args, io), 0);
    assert.ok(io.stdout.some(line => line.startsWith('acme\t')));
    const evidence = readFileSync(join(root, 'projects/acme/evidence/sources.md'), 'utf8');
    assert.match(evidence, /- first/);
    assert.match(evidence, /second/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('jobs help describes each command without loading configuration', async () => {
  const io = fakeIO({ cwd: '/nonexistent' });
  for (const args of [['--help'], ['list', '--help'], ['log', '-h'], ['cancel', '--help']]) {
    assert.equal(await jobsCommand(args, io), 0);
    assert.match(io.stdout.at(-1)!, /Example:/);
  }
  await assert.rejects(jobsCommand(['list', '--unknown'], io));
});

test('terminal-only provider follows campaign illustration plans', () => {
  const root = tempStudio({
    'projects/acme/project.yml': 'name: Acme\ncreatedAt: 2025-01-01\n',
    'projects/acme/campaigns/launch/plan.yml': '- platform: bluesky\n  type: image\n  angle: Demo\n  hooks: [one, two, three]\n  assets:\n    - id: hero\n      kind: illustration\n      brief: Hero\n',
    'projects/acme/campaigns/plain/plan.yml': '- platform: bluesky\n  type: text\n  angle: Demo\n  hooks: [one, two, three]\n  assets: []\n',
  });
  try {
    const options = { imageProvider: 'omp', root };
    const job = buildOperation('render', { campaign: 'acme/launch' }, options);
    assert.equal(job.requiresTTY, true);
    assert.equal(job.command, 'bstudio render acme/launch');
    assert.equal(buildOperation('revise', { campaign: 'acme/plain' }, options).requiresTTY, false);
    assert.equal(buildOperation('make', { campaign: 'acme/launch' }, options).requiresTTY, true);
    assert.equal(buildOperation('new', { campaign: 'acme/plain' }, options).requiresTTY, true);
    assert.equal(buildOperation('render', { campaign: 'acme/launch' }, { ...options, imageProvider: 'none' }).requiresTTY, false);
    assert.throws(() => startJob(root, 'render', { campaign: 'acme/launch' }, options), /Requires a terminal; run bstudio render acme\/launch/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('campaign lock excludes concurrent owners but not other campaigns', () => {
  const root = mkdtempSync(join(tmpdir(), 'bstudio-jobs-'));
  try {
    for (const project of ['acme', 'other']) {
      mkdirSync(join(root, 'projects', project, 'campaigns', 'launch'), { recursive: true });
      writeFileSync(join(root, 'projects', project, 'project.yml'), 'name: test\ncreatedAt: now\n');
    }
    const release = acquireCampaignLock(root, 'acme/launch');
    assert.throws(() => acquireCampaignLock(root, 'acme/launch'), JobConflict);
    const other = acquireCampaignLock(root, 'other/launch'); other(); release();
    const again = acquireCampaignLock(root, 'acme/launch'); again();
    assert.throws(() => acquireCampaignLock(root, 'launch'));
    assert.throws(() => acquireCampaignLock(root, 'acme/missing'), /not found/);
    assert.throws(() => campaignDirectory(root, 'missing/launch', true), /does not exist/);
    const first = startCliJob(root, 'acme/launch', 'plan');
    const second = startCliJob(root, 'other/launch', 'plan');
    first.log('first'); second.log('second'); first.finish(0); second.finish(0);
    assert.equal(jobLog(root, first.id), 'first\n');
    assert.equal(jobLog(root, second.id), 'second\n');
    assert.deepEqual(new Set(listJobs(root).map(job => job.campaign)), new Set(['acme/launch', 'other/launch']));
    const outside = mkdtempSync(join(tmpdir(), 'bstudio-outside-'));
    try {
      symlinkSync(outside, join(root, 'projects', 'acme', 'campaigns', 'escape'));
      assert.throws(() => campaignDirectory(root, 'acme/escape', true), /Unsafe/);
    } finally { rmSync(outside, { recursive: true, force: true }); }
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
  const root = tempStudio({ 'studio.yml': config, 'projects/acme/project.yml': 'name: acme\ncreatedAt: now\n', 'projects/acme/campaigns/demo/brief.md': '# Brief\n' });
  const child = spawn(process.execPath, ['bin/bstudio.mjs', 'plan', 'acme/demo'], {
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
        const competing = spawnSync(process.execPath, ['bin/bstudio.mjs', 'plan', 'acme/demo'], {
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
  const root = tempStudio({ 'projects/acme/project.yml': 'name: acme\ncreatedAt: now\n' }), server = createServer(() => {});
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const request = once(server, 'request');
  const child = spawn(process.execPath, ['bin/bstudio.mjs', 'brief', '--url', `http://127.0.0.1:${address.port}/`, 'acme/demo'], {
    cwd: process.cwd(), env: { ...process.env, BSTUDIO_HOME: root, BSTUDIO_CONFIG: join(root, 'studio.yml') }, stdio: 'ignore',
  });
  const exit = once(child, 'exit');
  try {
    await request;
    child.kill(signal);
    const [code] = await exit;
    assert.equal(code, expected);
    assert.equal(listJobs(root)[0].state, 'cancelled');
    const release = acquireCampaignLock(root, 'acme/demo'); release();
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
  }
});

test('stale locks and reused PIDs cannot block a campaign', () => {
  const root = tempStudio({ 'projects/acme/project.yml': 'name: acme\ncreatedAt: now\n', 'projects/acme/campaigns/demo/brief.md': '# demo' });
  try {
    const path = join(root, 'projects/acme/campaigns/demo/.bstudio-job.lock');
    writeFileSync(path, JSON.stringify({ id: 'old', pid: process.pid, processStarted: 'a different process' }));
    const release = acquireCampaignLock(root, 'acme/demo'); release();
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
  assert.deepEqual(buildOperation('brief', { campaign: 'acme/demo', note: '- tighten hook' }).args, ['brief', 'acme/demo', '--note=- tighten hook']);
  assert.throws(() => buildOperation('brief', { campaign: 'acme/demo', pr: '1.5' }));
});

test('registered workflow arguments reach merged CLI parsers', async () => {
  const root = tempStudio({
    'projects/acme/project.yml': 'name: acme\ncreatedAt: now\n',
    'projects/acme/campaigns/demo/brief.md': '# Brief',
    'projects/acme/campaigns/demo/plan.yml': '- platform: bluesky\n  type: text\n  angle: Demo\n  hooks: [one, two, three]\n  assets: []\n',
  });
  const io = fakeIO({ cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: join(root, 'studio.yml') } });
  try {
    for (const name of ['plan', 'make']) {
      const args = buildOperation(name, { campaign: 'acme/demo', platforms: 'unknown' }).args;
      assert.equal(await main(args, io), 1);
      assert.match(io.stderr.at(-1)!, /Unknown platform/);
    }
    assert.equal(await main(buildOperation('feedback add', { campaign: 'acme/demo', note: '- improve' }).args, io), 0);
    assert.equal(await main(buildOperation('feedback list', { campaign: 'acme/demo' }).args, io), 0);
    assert.ok(io.stdout.some(line => line.includes('- improve')));
    assert.equal(await main(buildOperation('history', { campaign: 'acme/demo' }).args, io), 0);
    assert.equal(await main(buildOperation('restore', { campaign: 'acme/demo', version: '999' }).args, io), 1);
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

test('global job findings require a normal diagnostic command return', async () => {
  const root = tempStudio(), dir = join(root, 'logs/jobs');
  mkdirSync(dir, { recursive: true });
  const cases = [
    { operation: 'doctor', code: 1, findings: true },
    { operation: 'sources check', code: 1, findings: true },
    { operation: 'sources check', code: 2, findings: true },
    { operation: 'doctor', code: 0, findings: false },
    { operation: 'sources check', code: 1, findings: false, throws: true },
    { operation: 'doctor', code: 1, findings: false, throws: true },
  ];
  for (const [index, entry] of cases.entries()) {
    const id = `a0000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
    writeFileSync(join(dir, `${id}.json`), JSON.stringify({ id, operation: entry.operation, state: 'running', createdAt: '2026-01-01', updatedAt: '2026-01-01', command: `bstudio ${entry.operation}` }));
    const io = fakeIO({ cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: join(root, 'studio.yml'), BSTUDIO_JOB_ID: id } });
    const run = async () => { if (entry.throws) throw new Error('check failed'); return entry.code; };
    if (entry.throws) await assert.rejects(withCampaignLock(entry.operation, [], io, run), /check failed/);
    else assert.equal(await withCampaignLock(entry.operation, [], io, run), entry.code);
    assert.equal(findJob(root, id).findings, entry.findings, entry.operation);
  }
});

test('unverified child identities neither keep jobs running nor receive cancellation signals', { timeout: 10000 }, async () => {
  const root = tempStudio(), dir = join(root, 'logs/jobs');
  const unrelated = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: process.platform !== 'win32', stdio: 'ignore' });
  const owners = [0, 1].map(() => spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: process.platform !== 'win32', stdio: 'ignore' }));
  const ownerExits = owners.map(owner => once(owner, 'exit')), unrelatedExit = once(unrelated, 'exit');
  try {
    assert.ok(unrelated.pid);
    mkdirSync(dir, { recursive: true });
    const base = { operation: 'doctor', state: 'running', createdAt: '2026-01-01', updatedAt: '2026-01-01', command: 'bstudio doctor', childPids: [unrelated.pid] };
    for (const [index, childStarted] of [undefined, { [unrelated.pid]: 'Mon Jan  1 00:00:00 2001' }].entries()) {
      const id = `a000000${index}-0000-4000-8000-000000000000`;
      writeFileSync(join(dir, `${id}.json`), JSON.stringify({ ...base, id, pid: process.pid, processStarted: 'different process', childStarted, completed: true, exitCode: 0 }));
      assert.equal(findJob(root, id).state, 'succeeded');
      assert.throws(() => cancelJob(root, id), JobNotRunning);
    }
    for (const [index, started] of [undefined, 'Mon Jan  1 00:00:00 2001'].entries()) {
      const id = `b000000${index}-0000-4000-8000-000000000000`;
      writeFileSync(join(dir, `${id}.json`), JSON.stringify({ ...base, id, pid: unrelated.pid, processStarted: started, childPids: [], completed: true, exitCode: 0 }));
      assert.equal(findJob(root, id).state, 'succeeded');
      assert.throws(() => cancelJob(root, id), JobNotRunning);
    }
    for (const [index, owner] of owners.entries()) {
      assert.ok(owner.pid);
      const started = processStarted(owner.pid); assert.ok(started);
      const id = `a000000${index + 2}-0000-4000-8000-000000000000`;
      const childStarted = index ? { [unrelated.pid]: 'Mon Jan  1 00:00:00 2001' } : undefined;
      writeFileSync(join(dir, `${id}.json`), JSON.stringify({ ...base, id, pid: owner.pid, processStarted: started, childStarted }));
      cancelJob(root, id);
      await ownerExits[index];
    }
    assert.doesNotThrow(() => process.kill(unrelated.pid!, 0));
  } finally {
    for (const owner of owners) if (owner.exitCode === null && owner.signalCode === null) owner.kill('SIGKILL');
    if (unrelated.exitCode === null && unrelated.signalCode === null) unrelated.kill('SIGKILL');
    await Promise.all([...ownerExits, unrelatedExit]);
    rmSync(root, { recursive: true, force: true });
  }
});

test('unverifiable live lock owners remain protected', () => {
  const root = tempStudio({ 'projects/acme/project.yml': 'name: acme\ncreatedAt: now\n', 'projects/acme/campaigns/demo/brief.md': '# demo' });
  try {
    const path = join(root, 'projects/acme/campaigns/demo/.bstudio-job.lock');
    writeFileSync(path, JSON.stringify({ id: 'old', pid: process.pid }));
    assert.equal(campaignLockStatus(root, 'acme/demo'), 'running');
    assert.throws(() => acquireCampaignLock(root, 'acme/demo'), JobConflict);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('spawned job completion releases only its own campaign lock', () => {
  const root = tempStudio({ 'projects/acme/project.yml': 'name: acme\ncreatedAt: now\n', 'projects/acme/campaigns/demo/brief.md': '# demo' });
  try {
    const job = startCliJob(root, 'acme/demo', 'plan');
    finishSpawnedJob(root, 'acme/demo', job.id, 0);
    const next = acquireCampaignLock(root, 'acme/demo');
    finishSpawnedJob(root, 'acme/demo', job.id, 0);
    assert.throws(() => acquireCampaignLock(root, 'acme/demo'), JobConflict);
    next(); job.finish(0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('job log tail reads complete lines from the last 64 KiB', () => {
  const root = tempStudio({ 'projects/acme/project.yml': 'name: acme\ncreatedAt: now\n', 'projects/acme/campaigns/demo/brief.md': '# demo' });
  try {
    const job = startCliJob(root, 'acme/demo', 'plan');
    const path = join(root, 'projects/acme/campaigns/demo/logs/jobs', `${job.id}.log`);
    assert.deepEqual(jobLogTail(root, job.id), []);
    writeFileSync(path, 'first\nsecond\n');
    assert.deepEqual(jobLogTail(root, job.id), ['first', 'second']);
    writeFileSync(path, `${'x'.repeat(65536)}\nlast\n`);
    assert.deepEqual(jobLogTail(root, job.id), ['last']);
    writeFileSync(path, `${'x'.repeat(8)}\n${'a'.repeat(65534)}\n`);
    assert.deepEqual(jobLogTail(root, job.id), ['a'.repeat(65534)]);
    writeFileSync(path, 'x'.repeat(65537));
    assert.deepEqual(jobLogTail(root, job.id), []);
    rmSync(path);
    symlinkSync(join(root, 'studio.yml'), path);
    assert.throws(() => jobLogTail(root, job.id), /Unsafe job log/);
    job.finish(0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('job lookup and cancellation expose distinct not-found and not-running errors', () => {
  const root = tempStudio({ 'projects/acme/project.yml': 'name: acme\ncreatedAt: now\n', 'projects/acme/campaigns/demo/brief.md': '# demo' });
  try {
    const missing = 'a0000000-0000-4000-8000-000000000000';
    assert.throws(() => findJob(root, missing), JobNotFound);
    assert.throws(() => jobLog(root, missing), JobNotFound);
    assert.throws(() => cancelJob(root, missing), JobNotFound);
    const job = startCliJob(root, 'acme/demo', 'plan');
    job.finish(0);
    assert.throws(() => cancelJob(root, job.id), JobNotRunning);
    assert.equal(findJob(root, job.id).state, 'succeeded');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('permission denied while cancelling preserves the running job and suggests elevated privileges', () => {
  const root = tempStudio(), id = 'a0000000-0000-4000-8000-000000000000', dir = join(root, 'logs/jobs'), originalKill = process.kill;
  const started = processStarted(process.pid); assert.ok(started);
  mkdirSync(dir, { recursive: true });
  const record = { id, operation: 'doctor', state: 'running', createdAt: '2026-01-01', updatedAt: '2026-01-01', pid: process.pid, processStarted: started, command: 'bstudio doctor' };
  writeFileSync(join(dir, `${id}.json`), JSON.stringify(record));
  process.kill = ((pid: number, signal?: string | number) => { if (signal === 'SIGTERM') throw Object.assign(new Error('denied'), { code: 'EPERM' }); return originalKill(pid, signal); }) as typeof process.kill;
  try {
    assert.throws(() => cancelJob(root, id), /another user.*elevated privileges/);
    const after = findJob(root, id); assert.equal(after.state, 'running'); assert.equal(after.cancelRequested, undefined); assert.equal(after.updatedAt, record.updatedAt);
  } finally { process.kill = originalKill; rmSync(root, { recursive: true, force: true }); }
});
test('partial signal delivery keeps cancellation requested when a child is denied', async () => {
  if (process.platform === 'win32') return;
  const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { detached: true, stdio: 'ignore' });
  await once(child, 'spawn');
  const root = tempStudio(), id = 'b0000000-0000-4000-8000-000000000000', dir = join(root, 'logs/jobs'), originalKill = process.kill;
  const started = processStarted(process.pid), childStart = processStarted(child.pid!); assert.ok(started); assert.ok(childStart);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${id}.json`), JSON.stringify({ id, operation: 'doctor', state: 'running', createdAt: '2026-01-01', updatedAt: '2026-01-01', pid: process.pid, processStarted: started, childPids: [child.pid], childStarted: { [child.pid!]: childStart }, command: 'bstudio doctor' }));
  process.kill = ((pid: number, signal?: string | number) => { if (signal === 'SIGTERM') { if (pid === process.pid) return true; throw Object.assign(new Error('denied'), { code: 'EPERM' }); } return originalKill(pid, signal); }) as typeof process.kill;
  try { assert.equal(cancelJob(root, id).cancelRequested, true); assert.equal(findJob(root, id).cancelRequested, true); }
  finally { process.kill = originalKill; originalKill(-child.pid!, 'SIGKILL'); await once(child, 'exit'); rmSync(root, { recursive: true, force: true }); }
});

test('an aged malformed campaign lock can be recovered', () => {
  const root = tempStudio({ 'projects/acme/project.yml': 'name: acme\ncreatedAt: now\n', 'projects/acme/campaigns/demo/brief.md': '# demo' });
  try {
    const path = join(root, 'projects/acme/campaigns/demo/.bstudio-job.lock');
    writeFileSync(path, '');
    utimesSync(path, new Date(0), new Date(0));
    const release = acquireCampaignLock(root, 'acme/demo'); release();
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
