import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, readdirSync, watch, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parse, stringify } from 'yaml';
import { unzipSync, strFromU8 } from 'fflate';
import { startDashboard } from '../src/dashboard/server.ts';
import { findJob } from '../src/jobs/runner.ts';
import { exactProcess } from '../src/jobs/process.ts';
import { fakeIO, tempStudio } from './helpers.ts';

const cli = fileURLToPath(new URL('../bin/bstudio.mjs', import.meta.url));

// Bound external process readiness and cancellation so failures cannot strand the test servers.
async function within<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), 20_000);
    })]);
  } finally { clearTimeout(timer); }
}

test('Slipway: shared evidence through feedback, exports, dashboard jobs and renames', { timeout: 60_000 }, async () => {
  const root = tempStudio(), target = join(root, 'market-blaster');
  mkdirSync(target);
  const agent = join(root, 'agent.cjs'), reviewer = join(root, 'reviewer.cjs'), mb = join(root, 'mblast.cjs');
  writeFileSync(agent, `const fs = require('node:fs');
const prompt = process.argv.at(-1);
if (prompt.includes('Write plan.yml') || prompt.includes('Write plan.scoped.yml')) {
  const name = prompt.includes('Write plan.scoped.yml') ? 'plan.scoped.yml' : 'plan.yml';
  fs.writeFileSync(name, JSON.stringify(['bluesky', 'linkedin'].map(platform => ({platform, type:'text', angle:'Useful', hooks:['One','Two','Three'], assets:[]}))));
} else if (prompt.includes('OWNER INSTRUCTION')) {
  const file = 'posts/bluesky.md';
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('Original', 'Revised'));
} else {
  fs.mkdirSync('posts', {recursive:true});
  const first = !fs.existsSync(${JSON.stringify(join(root, 'made'))});
  fs.writeFileSync(${JSON.stringify(join(root, 'made'))}, 'yes');
  for (const platform of ['bluesky', 'linkedin']) fs.writeFileSync('posts/' + platform + '.md', '---\\nplatform: ' + platform + '\\ntitle: Useful\\nevidence: [E1]\\nmedia: []\\n' + (first && platform === 'bluesky' ? 'blockers: [Need owner confirmation]\\n' : '') + '---\\nOriginal\\n');
}
`);
  writeFileSync(reviewer, `const prompt = process.argv.at(-1); const data = JSON.parse(prompt.match(/<untrusted>\\n([\\s\\S]*?)\\n<\\/untrusted>/)[1]); console.log(JSON.stringify({scores:data.rubric.map(c => ({criterion:c.id,score:2,evidence:'Supported',fix:'None'})),hookComparison:{preferred:0,evidence:'Clear'}}));`);
  writeFileSync(mb, `require('node:fs').appendFileSync('calls.jsonl', JSON.stringify(process.argv.slice(2)) + '\\n'); console.log('ok');`);
  const config = (agentScript: string) => stringify({ brand: { name: 'Demo' }, platforms: ['bluesky', 'linkedin'], agent: { command: [process.execPath, agentScript], sandbox: 'off' }, reviewer: { command: [process.execPath, reviewer] }, marketBlaster: { command: [process.execPath, mb] } });
  writeFileSync(join(root, 'studio.yml'), config(agent));
  const env = { ...process.env, HOME: root, BSTUDIO_HOME: root, BSTUDIO_CONFIG: join(root, 'studio.yml') };
  const run = (...args: string[]) => {
    const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, env, encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, 0, `${args.join(' ')}\n${result.stdout}\n${result.stderr}\n${result.error ?? ''}`);
    return result.stdout + result.stderr;
  };
  run('project', 'new', 'slipway', '--note', 'Shared project evidence');
  for (const name of ['launch', 'followup']) run('brief', `slipway/${name}`, '--note', `Campaign ${name}`);
  const campaign = join(root, 'projects/slipway/campaigns/launch');
  for (const name of ['launch', 'followup']) assert.match(readFileSync(join(root, `projects/slipway/campaigns/${name}/brief.md`), 'utf8'), /Shared project evidence/);
  run('plan', 'slipway/launch');
  run('make', 'slipway/launch');
  run('render', 'slipway/launch');
  run('review', 'slipway/launch');
  const blocked = JSON.parse(readFileSync(join(campaign, 'reviews/bluesky.json'), 'utf8')) as { gates: { id: string; pass: boolean; message: string }[] };
  assert.match(blocked.gates.find(gate => gate.id === 'specs')!.message, /Need owner confirmation/);
  assert.equal(blocked.gates.find(gate => gate.id === 'specs')!.pass, false);
  run('make', 'slipway/launch', '--platforms', 'bluesky');
  run('review', 'slipway/launch');
  run('feedback', 'slipway/launch', 'add', '--note', 'Make it clearer');
  run('revise', 'slipway/launch', '--note', 'Use a direct opening');
  const feedback = parse(readFileSync(join(campaign, 'feedback.yml'), 'utf8')) as { note: string; status: string }[];
  assert.deepEqual(feedback.map(item => [item.note, item.status]), [['Make it clearer', 'applied'], ['Use a direct opening', 'applied']]);
  assert.match(readFileSync(join(campaign, 'posts/bluesky.md'), 'utf8'), /Revised/);
  run('make', 'slipway/launch', '--platforms', 'bluesky');
  const saved = readdirSync(join(campaign, 'history')).find(name => name.startsWith('2-')); assert.ok(saved);
  const savedPost = readFileSync(join(campaign, 'history', saved, 'posts/bluesky.md'), 'utf8');
  run('restore', 'slipway/launch', '2');
  assert.equal(readFileSync(join(campaign, 'posts/bluesky.md'), 'utf8'), savedPost);
  assert.match(savedPost, /Need owner confirmation/);
  const otherPost = readFileSync(join(campaign, 'posts/linkedin.md'), 'utf8');
  run('make', 'slipway/launch', '--platforms', 'bluesky');
  run('render', 'slipway/launch', '--platforms', 'bluesky');
  assert.equal(readFileSync(join(campaign, 'posts/linkedin.md'), 'utf8'), otherPost);
  run('review', 'slipway/launch');
  const otherReview = readFileSync(join(campaign, 'reviews/linkedin.json'), 'utf8');
  run('review', 'slipway/launch', '--platforms', 'bluesky');
  assert.equal(readFileSync(join(campaign, 'reviews/linkedin.json'), 'utf8'), otherReview);
  run('accept', 'slipway/launch', 'bluesky', '--reason', 'Reviewed by owner');
  run('accept', 'slipway/launch', 'linkedin', '--reason', 'Reviewed by owner');
  run('export', 'slipway/launch', '--local');
  run('export', 'slipway/launch', '--mb', target);
  const calls = readFileSync(join(target, 'calls.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line) as string[]);
  assert.equal(calls[0][0], 'import'); assert.deepEqual(calls[0].slice(-2), ['--slug', 'slipway--launch']);
  assert.deepEqual(calls[1], ['check', 'slipway--launch']);
  const exports = readdirSync(join(campaign, 'export'), { withFileTypes: true }).filter(entry => entry.isDirectory() && existsSync(join(campaign, 'export', entry.name, 'imported.json')));
  assert.equal(exports.length, 1);
  const receipt = JSON.parse(readFileSync(join(campaign, 'export', exports[0].name, 'imported.json'), 'utf8'));
  assert.equal(receipt.slug, 'slipway--launch'); assert.equal(receipt.project, target);
  const list = run('export', 'slipway/launch', '--list'); assert.match(list, /slipway--launch\.campaign\.zip/);
  const zip = unzipSync(readFileSync(join(campaign, 'export/slipway--launch.campaign.zip')));
  assert.equal(JSON.parse(strFromU8(zip['campaign.json'])).slug, 'slipway--launch');
  const status = run('status'); assert.match(status, /Project: slipway/); assert.match(status, /launch/); assert.match(status, /followup/);

  const ready = Promise.withResolvers<void>();
  const signal = createServer((_req, res) => { res.end('ok'); ready.resolve(); });
  await new Promise<void>(resolve => signal.listen(0, '127.0.0.1', resolve));
  let dashboard: Awaited<ReturnType<typeof startDashboard>> | undefined;
  let id = '', cookie = '';
  let watcher: ReturnType<typeof watch> | undefined, logWatcher: ReturnType<typeof watch> | undefined;
  try {
    const address = signal.address(); assert.ok(address && typeof address !== 'string');
    const holding = join(root, 'holding.cjs');
    writeFileSync(holding, `require('node:net').createServer().listen(0, '127.0.0.1', () => { console.log('streamed output'); require('node:http').get('http://127.0.0.1:${address.port}/'); });`);
    writeFileSync(join(root, 'studio.yml'), config(holding));
    dashboard = await startDashboard(fakeIO({ cwd: root, env }), { port: 0 });
    const base = `http://127.0.0.1:${dashboard.port}`;
    const exchange = await fetch(dashboard.url, { redirect: 'manual' });
    assert.equal(exchange.status, 302); cookie = exchange.headers.get('set-cookie') ?? ''; assert.ok(cookie);
    const headers = { cookie, origin: base, 'x-requested-with': 'bstudio', 'content-type': 'application/json' };
    const history = await fetch(`${base}/api/campaigns/slipway/launch/exports`, { headers });
    assert.equal(history.status, 200);
    const entries = await history.json() as { name: string; kind: string }[];
    assert.equal(entries.filter(entry => entry.kind === 'zip').length, 2);
    const download = await fetch(`${base}/api/campaigns/slipway/launch/exports/${encodeURIComponent(entries[0].name)}`, { headers });
    assert.equal(download.status, 200); assert.ok((await download.arrayBuffer()).byteLength > 0);
    const started = await fetch(`${base}/api/jobs`, { method: 'POST', headers, body: JSON.stringify({ op: 'plan', campaign: 'slipway/followup', args: {} }) });
    assert.equal(started.status, 202); id = (await started.json() as { id: string }).id;
    const finished = Promise.withResolvers<void>();
    const streamed = Promise.withResolvers<void>();
    let lastLog = '';
    // Attach a handler immediately: the job may fail before the readiness signal.
    void finished.promise.catch(() => {});
    const check = async () => {
      try {
        const res = await fetch(`${base}/api/jobs/${id}`, { headers });
        if (!res.ok) throw new Error(`Job status returned ${res.status}`);
        const { state } = await res.json() as { state: string };
        if (state === 'cancelled') finished.resolve();
        else if (state === 'failed' || state === 'succeeded') finished.reject(new Error(`Job ended ${state} instead of cancelled`));
        if (state === 'running') {
          const response = await fetch(`${base}/api/jobs/${id}/log`, { headers });
          if (!response.ok) throw new Error(`Job log returned ${response.status}`);
          lastLog = (await response.json() as { log: string }).log;
          if (lastLog.includes('streamed output')) streamed.resolve();
        }
      } catch (error) { finished.reject(error); }
    };
    watcher = watch(join(root, 'projects/slipway/campaigns/followup/logs/jobs'), () => { void check(); });
    logWatcher = watch(join(root, 'projects/slipway/campaigns/followup/logs/jobs', `${id}.log`), () => { void check(); });
    await check();
    await within(Promise.race([ready.promise, finished.promise.then(() => { throw new Error('Job cancelled before streaming'); })]), 'agent output');
    try { await within(Promise.race([streamed.promise, finished.promise.then(() => { throw new Error('Job cancelled before log output'); })]), 'streamed job log'); }
    catch (error) { throw new Error(`${error instanceof Error ? error.message : String(error)}; last log: ${lastLog}`); }
    assert.equal((await fetch(`${base}/api/jobs/${id}/cancel`, { method: 'POST', headers })).status, 200);
    await check();
    await within(finished.promise, 'job cancellation');
    watcher.close(); watcher = undefined;
    logWatcher.close(); logWatcher = undefined;
    id = '';
  } finally {
    watcher?.close();
    logWatcher?.close();
    try {
      if (id) {
        const job = findJob(root, id);
        for (const [pid, started] of [...(job.childPids ?? []).map(pid => [pid, job.childStarted?.[pid]] as const), ...(job.pid ? [[job.pid, job.processStarted] as const] : [])]) {
          if (exactProcess(pid, started)) {
            try { process.kill(process.platform === 'win32' ? pid : -pid, 'SIGKILL'); }
            catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
          }
        }
      }
    } finally {
      try { if (dashboard) { dashboard.server.closeAllConnections(); await new Promise<void>(resolve => dashboard!.server.close(() => resolve())); } }
      finally { signal.closeAllConnections(); await new Promise<void>(resolve => signal.close(() => resolve())); }
    }
  }
  const historyBefore = run('history', 'slipway/launch'); assert.doesNotMatch(historyBefore, /No snapshots/);
  run('project', 'rename', 'slipway', 'voyage');
  run('campaign', 'rename', 'voyage/launch', 'voyage/debut');
  assert.equal(run('history', 'voyage/debut'), historyBefore);
  assert.match(readFileSync(join(root, 'projects/voyage/campaigns/debut/feedback.yml'), 'utf8'), /Make it clearer/);
});
