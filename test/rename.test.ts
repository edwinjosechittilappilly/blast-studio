import assert from 'node:assert/strict';
import { existsSync, readFileSync, renameSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';
import { projectTotal } from '../src/budget/ledger.ts';
import { main } from '../src/cli.ts';
import { run as campaign } from '../src/commands/campaign.ts';
import { run as project } from '../src/commands/project.ts';
import { buildOperation } from '../src/jobs/registry.ts';
import { loadConfig } from '../src/config.ts';
import { jobLog, listJobs } from '../src/jobs/runner.ts';
import { recoverRenames } from '../src/rename.ts';
import { fakeIO, tempStudio } from './helpers.ts';

const id = '12345678-1234-4234-8234-123456789abc';
const record = (campaign: string) => JSON.stringify({ id, operation: 'plan', campaign, state: 'succeeded', createdAt: '2026-01-01', updatedAt: '2026-01-01', command: `bstudio plan ${campaign}` }) + '\n';
const ledger = (projectSlug: string, usd: number) => JSON.stringify({ id: `${projectSlug}-id`, type: 'reserved', at: '2026-01-01T00:00:00Z', usd, projectSlug, provider: 'agent', model: 'test' }) + '\n';
const ioFor = (root: string) => fakeIO({ cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: join(root, 'studio.yml') } });

test('registered CLI and dashboard argument vectors reach both rename commands', async () => {
  const root = tempStudio({ 'projects/one/project.yml': 'name: one\ncreatedAt: now\n', 'projects/one/campaigns/launch/brief.md': 'launch\n' });
  const io = ioFor(root);
  assert.equal(await main(buildOperation('project rename', { project: 'one', destination: 'two' }).args, io), 0);
  assert.equal(await main(buildOperation('campaign rename', { source: 'two/launch', destination: 'two/news' }).args, io), 0);
  assert.equal(readFileSync(join(root, 'projects/two/campaigns/news/brief.md'), 'utf8'), 'launch\n');
});

test('campaign rename moves history and feedback, job references, and legacy spend across projects', async () => {
  const root = tempStudio({
    'projects/old/project.yml': 'name: old\ncreatedAt: now\nmigratedFrom: old\n',
    'projects/old/campaigns/old/brief.md': '# Brief\n',
    'projects/old/campaigns/old/history/1/brief.md': 'historic\n',
    'projects/old/campaigns/old/feedback.yml': 'items: []\n',
    [`projects/old/campaigns/old/logs/jobs/${id}.json`]: record('old'),
    [`projects/old/campaigns/old/logs/jobs/${id}.log`]: 'job output\n',
    'projects/new/project.yml': 'name: new\ncreatedAt: now\n',
    'projects/new/campaigns/other/brief.md': 'other\n',
    'ledger.jsonl': ledger('old', 1.25) + ledger('old/old', 2.5) + ledger('new/other', 3),
  });
  const io = ioFor(root);
  assert.equal(await campaign(['rename', 'old/old', 'new/renamed'], io), 0);
  assert.equal(existsSync(join(root, 'projects/old/campaigns/old')), false);
  assert.equal(readFileSync(join(root, 'projects/new/campaigns/renamed/history/1/brief.md'), 'utf8'), 'historic\n');
  assert.equal(readFileSync(join(root, 'projects/new/campaigns/renamed/feedback.yml'), 'utf8'), 'items: []\n');
  assert.equal(projectTotal(root, 'new/renamed'), 3.75);
  assert.equal(projectTotal(root, 'new/other'), 3);
  assert.equal(projectTotal(root, 'old/old'), 0);
  assert.equal(parse(readFileSync(join(root, 'projects/old/project.yml'), 'utf8')).migratedFrom, undefined);
  assert.equal(listJobs(root).find(job => job.id === id)?.campaign, 'new/renamed');
  assert.equal(jobLog(root, id), 'job output\n');
});

test('project rename moves all campaigns, updates metadata and preserves legacy spending', async () => {
  const root = tempStudio({
    'projects/old/project.yml': 'name: old\ncreatedAt: now\nmigratedFrom: old\nlinks: { website: "https://example.com" }\n',
    'projects/old/campaigns/old/brief.md': 'legacy\n',
    'projects/old/campaigns/launch/brief.md': 'launch\n',
    [`projects/old/campaigns/launch/logs/jobs/${id}.json`]: record('old/launch'),
    [`projects/old/campaigns/launch/logs/jobs/${id}.log`]: 'launch log\n',
    'projects/old/evidence/sources.md': 'shared evidence\n',
    'ledger.jsonl': ledger('old', 1) + ledger('old/launch', 2),
  });
  assert.equal(await project(['rename', 'old', 'renamed'], ioFor(root)), 0);
  assert.equal(existsSync(join(root, 'projects/old')), false);
  assert.equal(readFileSync(join(root, 'projects/renamed/evidence/sources.md'), 'utf8'), 'shared evidence\n');
  const metadata = parse(readFileSync(join(root, 'projects/renamed/project.yml'), 'utf8'));
  assert.equal(metadata.name, 'renamed');
  assert.equal(metadata.links.website, 'https://example.com');
  assert.equal(projectTotal(root, 'renamed/old'), 1);
  assert.equal(projectTotal(root, 'renamed/launch'), 2);
  assert.equal(listJobs(root).find(job => job.id === id)?.campaign, 'renamed/launch');
  assert.equal(jobLog(root, id), 'launch log\n');
});

test('renames reject missing projects, unsafe paths, collisions and live locks without moving data', async () => {
  const root = tempStudio({
    'projects/one/project.yml': 'name: one\ncreatedAt: now\n',
    'projects/one/campaigns/source/brief.md': 'source\n',
    'projects/one/campaigns/existing/brief.md': 'existing\n',
  });
  const io = ioFor(root), source = join(root, 'projects/one/campaigns/source');
  await assert.rejects(campaign(['rename', 'one/source', 'missing/new'], io), /not found/i);
  await assert.rejects(campaign(['rename', 'one/source', 'one/existing'], io), /already exists/i);
  await assert.rejects(campaign(['rename', 'one/source', 'one/../escape'], io));
  await assert.rejects(project(['rename', 'one', 'one'], io), /already exists/i);
  writeFileSync(join(source, '.revise.lock'), String(process.pid));
  await assert.rejects(campaign(['rename', 'one/source', 'one/new'], io), /stop running jobs/i);
  await assert.rejects(project(['rename', 'one', 'two'], io), /stop running jobs/i);
  assert.equal(readFileSync(join(source, 'brief.md'), 'utf8'), 'source\n');
  assert.equal(readFileSync(join(root, 'projects/one/campaigns/existing/brief.md'), 'utf8'), 'existing\n');
});

test('rename refuses symlink destinations and provides help without loading configuration', async () => {
  const root = tempStudio({ 'projects/one/project.yml': 'name: one\ncreatedAt: now\n', 'projects/one/campaigns/source/brief.md': 'source\n' });
  symlinkSync(join(root, 'projects/one/campaigns/source'), join(root, 'projects/one/campaigns/alias'));
  await assert.rejects(campaign(['rename', 'one/source', 'one/alias'], ioFor(root)));
  const io = fakeIO({ cwd: '/nonexistent' });
  assert.equal(await campaign(['rename', '-h'], io), 0);
  assert.equal(await project(['new', '-h'], io), 0);
  assert.equal(await project(['rename', '-h'], io), 0);
});

test('interrupted renames recover their move and remaining updates', async () => {
  const before = 'name: old\ncreatedAt: now\n', after = 'name: new\ncreatedAt: now\n';
  const root = tempStudio({ 'projects/old/project.yml': before, 'projects/old/campaigns/launch/brief.md': 'launch\n', 'ledger.jsonl': ledger('old/launch', 2) });
  const source = join(root, 'projects/old'), destination = join(root, 'projects/new');
  const oldLedger = readFileSync(join(root, 'ledger.jsonl'), 'utf8'), newLedger = ledger('new/launch', 2);
  renameSync(source, destination);
  writeFileSync(join(root, 'projects/.bstudio-rename.json'), JSON.stringify({ source, destination, changes: [
    { path: join(source, 'project.yml'), before, after, mode: 0o644 },
    { path: join(root, 'ledger.jsonl'), before: oldLedger, after: newLedger, mode: 0o600 },
  ] }));
  const warnings: string[] = [];
  assert.equal((await recoverRenames(loadConfig(ioFor(root)), message => warnings.push(message))).size, 0);
  assert.deepEqual(warnings, []);
  assert.equal(readFileSync(join(destination, 'project.yml'), 'utf8'), after);
  assert.equal(projectTotal(root, 'new/launch'), 2);
  assert.equal(existsSync(join(root, 'projects/.bstudio-rename.json')), false);
});

test('recovery translates ledger addresses without losing later unrelated spending', async () => {
  const root = tempStudio({
    'projects/new/project.yml': 'name: new\ncreatedAt: now\n',
    'projects/new/campaigns/old/brief.md': 'legacy\n',
    'projects/new/campaigns/launch/brief.md': 'launch\n',
    'ledger.jsonl': ledger('old', 1) + ledger('old/launch', 2),
  });
  const source = join(root, 'projects/old'), destination = join(root, 'projects/new');
  writeFileSync(join(root, 'projects/.bstudio-rename.json'), JSON.stringify({
    source, destination, changes: [],
    ledgerMappings: [
      { from: 'old/', to: 'new/', prefix: true },
      { from: 'old', to: 'new/old', prefix: false },
    ],
  }));
  writeFileSync(join(root, 'ledger.jsonl'), ledger('other/campaign', 3), { flag: 'a' });
  const warnings: string[] = [];
  assert.equal((await recoverRenames(loadConfig(ioFor(root)), message => warnings.push(message))).size, 0);
  assert.deepEqual(warnings, []);
  assert.equal(readFileSync(join(root, 'ledger.jsonl'), 'utf8'), ledger('old', 1).replace('"projectSlug":"old"', '"projectSlug":"new/old"') + ledger('old/launch', 2).replace('"projectSlug":"old/launch"', '"projectSlug":"new/launch"') + ledger('other/campaign', 3));
  assert.equal(existsSync(join(root, 'projects/.bstudio-rename.json')), false);
});

test('legacy journal recovery preserves spending appended after interruption', async () => {
  const before = ledger('old/launch', 2), after = ledger('new/launch', 2), appended = ledger('other/campaign', 3);
  const root = tempStudio({
    'projects/new/project.yml': 'name: new\ncreatedAt: now\n',
    'projects/new/campaigns/launch/brief.md': 'launch\n',
    'ledger.jsonl': before + appended,
  });
  const source = join(root, 'projects/old'), destination = join(root, 'projects/new');
  writeFileSync(join(root, 'projects/.bstudio-rename.json'), JSON.stringify({ source, destination, changes: [
    { path: join(root, 'ledger.jsonl'), before, after, mode: 0o600 },
  ] }));
  assert.equal((await recoverRenames(loadConfig(ioFor(root)), () => {})).size, 0);
  assert.equal(readFileSync(join(root, 'ledger.jsonl'), 'utf8'), after + appended);
});

test('campaign recovery leaves already translated ledger entries unchanged', async () => {
  const contents = ledger('new/renamed', 1) + ledger('old/old', 2) + ledger('old', 3) + ledger('other/campaign', 4);
  const root = tempStudio({
    'projects/old/project.yml': 'name: old\ncreatedAt: now\n',
    'projects/new/project.yml': 'name: new\ncreatedAt: now\n',
    'projects/new/campaigns/renamed/brief.md': 'renamed\n',
    'ledger.jsonl': contents,
  });
  const source = join(root, 'projects/old/campaigns/old'), destination = join(root, 'projects/new/campaigns/renamed');
  writeFileSync(join(root, 'projects/.bstudio-rename.json'), JSON.stringify({
    source, destination, changes: [], ledgerMappings: [
      { from: 'old/old', to: 'new/renamed', prefix: false },
      { from: 'old', to: 'new/renamed', prefix: false },
    ],
  }));
  assert.equal((await recoverRenames(loadConfig(ioFor(root)), () => {})).size, 0);
  assert.equal(readFileSync(join(root, 'ledger.jsonl'), 'utf8'), ledger('new/renamed', 1) + ledger('old/old', 2).replace('"projectSlug":"old/old"', '"projectSlug":"new/renamed"') + ledger('old', 3).replace('"projectSlug":"old"', '"projectSlug":"new/renamed"') + ledger('other/campaign', 4));
});

test('recovery preserves conflicting ledger edits and reports affected projects', async () => {
  const root = tempStudio({ 'projects/new/project.yml': 'name: new\ncreatedAt: now\n', 'projects/new/campaigns/launch/brief.md': 'launch\n', 'ledger.jsonl': 'concurrent update\n' });
  const source = join(root, 'projects/old'), destination = join(root, 'projects/new');
  writeFileSync(join(root, 'projects/.bstudio-rename.json'), JSON.stringify({ source, destination, changes: [
    { path: join(root, 'ledger.jsonl'), before: 'old\n', after: 'new\n', mode: 0o600 },
  ] }));
  const warnings: string[] = [];
  const failures = await recoverRenames(loadConfig(ioFor(root)), message => warnings.push(message));
  assert.deepEqual([...failures.keys()].sort(), ['new', 'old']);
  assert.match(warnings[0], /changed/);
  assert.equal(readFileSync(join(root, 'ledger.jsonl'), 'utf8'), 'concurrent update\n');
  assert.equal(existsSync(join(root, 'projects/.bstudio-rename.json')), true);
});

test('rename refuses active global job records that reference the campaign', async () => {
  const active = JSON.stringify({ id, operation: 'history', campaign: 'one/source', state: 'running', createdAt: '2026-01-01', updatedAt: '2026-01-01', command: 'bstudio history one/source' });
  const root = tempStudio({
    'projects/one/project.yml': 'name: one\ncreatedAt: now\n',
    'projects/one/campaigns/source/brief.md': 'source\n',
    [`logs/jobs/${id}.json`]: active,
  });
  await assert.rejects(campaign(['rename', 'one/source', 'one/new'], ioFor(root)), /active/);
  assert.equal(existsSync(join(root, 'projects/one/campaigns/source/brief.md')), true);
});

test('a corrupt rename journal reports unknown scope without altering files', async () => {
  const root = tempStudio({ 'projects/.bstudio-rename.json': '{invalid', 'projects/one/project.yml': 'name: one\ncreatedAt: now\n' });
  const warnings: string[] = [];
  const failures = await recoverRenames(loadConfig(ioFor(root)), message => warnings.push(message));
  assert.deepEqual([...failures.keys()], ['*']);
  assert.match(warnings[0], /rename recovery failed/i);
  assert.equal(readFileSync(join(root, 'projects/.bstudio-rename.json'), 'utf8'), '{invalid');
});
