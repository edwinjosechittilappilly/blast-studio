import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { run as exportCommand } from '../src/commands/export.ts';
import { run as mark } from '../src/commands/mark.ts';
import { run as accept, confirm } from '../src/commands/accept.ts';
import { run as library } from '../src/commands/library.ts';
import { run as status } from '../src/commands/status.ts';
import { listExports, loadLibrary, projectDetails } from '../src/library.ts';
import { loadConfig } from '../src/config.ts';
import { mediaContentHash, reviewHash } from '../src/review-hash.ts';
import { fakeIO, tempStudio } from './helpers.ts';

function fixture(platform = 'bluesky') {
  const root = tempStudio(), project = join(root, 'projects/acme/campaigns/demo');
  for (const dir of ['posts', 'reviews', 'assets/a/out']) mkdirSync(join(project, dir), { recursive: true });
  writeFileSync(join(project, 'brief.md'), '# Brief\n\n## [E1] Example\n\nEvidence.\n');
  writeFileSync(join(project, 'assets/a/out/image.png'), 'image');
  writeFileSync(join(project, 'assets/a/asset.yml'), 'id: a\nkind: card\nprovider: template\naiGenerated: false\noutputs:\n  - { file: out/image.png, bytes: 5 }\n');
  writeFileSync(join(project, 'posts', `${platform}.md`), `---\nplatform: ${platform}\ntitle: T\nevidence: [E1]\nmedia:\n  - asset: a\n    file: assets/a/out/image.png\n    alt: Alt\n    kind: image\n---\nHello\n`);
  const review = { platform, postHash: reviewHash({ title: 'T', body: 'Hello', media: [{ path: 'image.png', alt: 'Alt' }] }), mediaHash: mediaContentHash(project, [{ asset: 'a', file: 'assets/a/out/image.png', alt: 'Alt', kind: 'image' }]), gates: ['policy', 'disclosure', 'specs', 'accessibility', 'fabricated-metrics', 'rights'].map(id => ({ id, pass: true, message: 'ok' })), verdict: 'pass', total: 90 };
  const save = () => writeFileSync(join(project, 'reviews', `${platform}.json`), JSON.stringify(review)); save();
  writeFileSync(join(root, 'market-blaster.yml'), 'brand: { name: Demo }\ndestinations: [bluesky]\n');
  const io = fakeIO({ cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: join(root, 'studio.yml') } });
  return { root, project, review, save, io };
}

function marketBlasterDir(): string {
  return process.env.MARKET_BLASTER_DIR
    ? resolve(process.env.MARKET_BLASTER_DIR)
    : [new URL('../../market-blaster/', import.meta.url), new URL('../../../market-blaster/', import.meta.url)]
      .map(url => fileURLToPath(url)).find(path => existsSync(join(path, 'bin/mblast.mjs'))) ?? fileURLToPath(new URL('../../market-blaster/', import.meta.url));
}

test('shared review hash vector', () => {
  assert.equal(reviewHash({ title: 'T', body: '  Hello\n', media: [{ path: 'a/img.png', alt: ' Alt ' }] }), '5d5491c0f7ae06bef68e9dabfd55f2e6c8152f8e6fdb96cd24d294cd203bc977');
});

test('local export ignores configured targets and rejects import options', async () => {
  const f = fixture();
  writeFileSync(join(f.root, 'projects/acme/project.yml'), 'marketBlaster:\n  project: /missing-market-blaster\n');
  await exportCommand(['acme/demo', '--local'], f.io);
  assert.equal(listExports(loadConfig(f.io), 'acme/demo')[0].kind, 'zip');
  await assert.rejects(exportCommand(['acme/demo', '--local', '--mb', '/tmp'], f.io), /usage:/);
  await assert.rejects(exportCommand(['acme/demo', '--local', '--force'], f.io), /usage:/);
});
test('refuses nonpassing, failed gates and stale reviews', async () => {
  const f = fixture();
  for (const verdict of ['revise', 'blocked']) { f.review.verdict = verdict; f.save(); await assert.rejects(exportCommand(['acme/demo'], f.io), /bluesky.*review/); }
  f.review.verdict = 'pass'; f.review.gates[0].pass = false; f.save(); await assert.rejects(exportCommand(['acme/demo'], f.io), /bluesky.*review/);
  f.review.gates[0].pass = true; f.review.postHash = 'stale'; f.save(); await assert.rejects(exportCommand(['acme/demo'], f.io), /bluesky.*stale/);
});

test('refuses missing gates and changed media', async () => {
  const f = fixture();
  f.review.gates.pop(); f.save(); await assert.rejects(exportCommand(['acme/demo'], f.io), /not passing/);
  f.review.gates.push({ id: 'rights', pass: true, message: 'ok' }); f.save();
  writeFileSync(join(f.project, 'assets/a/out/image.png'), 'changed');
  await assert.rejects(exportCommand(['acme/demo'], f.io), /media is stale/);
});

test('warns that a migrated campaign has a new Market Blaster identity', async () => {
  const f = fixture();
  const migrated = join(f.root, 'projects/demo/campaigns/demo');
  cpSync(f.project, migrated, { recursive: true });
  writeFileSync(join(f.root, 'projects/demo/project.yml'), 'name: Demo\ncreatedAt: 2025-01-01\nmigratedFrom: demo\n');
  await exportCommand(['demo/demo', '--dir'], f.io);
  assert.match(f.io.stderr.join('\n'), /slug changed from demo to demo--demo/);
  assert.match(f.io.stderr.join('\n'), /duplicate previously published posts/);
});

test('market-blaster imports manifest and media', async t => {
  const marketBlaster = marketBlasterDir();
  if (!existsSync(marketBlaster)) {
    t.skip('set MARKET_BLASTER_DIR to a market-blaster checkout to run the import integration test');
    return;
  }
  const f = fixture(); await exportCommand(['acme/demo', '--dir'], f.io);
  const manifest = JSON.parse(readFileSync(join(f.project, 'export/manifest.json'), 'utf8'));
  assert.deepEqual([manifest.project, manifest.campaign, manifest.slug], ['acme', 'demo', 'acme--demo']);
  const ajv = new Ajv2020({ allErrors: true });
  ajv.addFormat('date-time', { type: 'string', validate: (s: string) => Number.isFinite(Date.parse(s)) });
  const validate = ajv.compile(JSON.parse(readFileSync(join(marketBlaster, 'schemas/studio-manifest.v1.json'), 'utf8')));
  assert.ok(validate(manifest), ajv.errorsText(validate.errors));
  writeFileSync(join(f.root, 'market-blaster.yml'), 'brand: { name: Demo }\ndestinations: [bluesky]\n');
  const result = spawnSync(process.execPath, [join(marketBlaster, 'bin/mblast.mjs'), 'import', join(f.project, 'export'), '--slug', 'acme--demo'], { cwd: f.root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const draft = readFileSync(join(f.root, 'campaigns/acme--demo/drafts/bluesky.md'), 'utf8');
  assert.match(draft, /reviewHash/); const path = draft.match(/path: (media\/[^\s]+)/)?.[1]; assert.ok(path); assert.ok(existsSync(join(f.root, 'campaigns/acme--demo', path)));
});

test('market-blaster imports the default campaign zip', async t => {
  const marketBlaster = marketBlasterDir();
  if (!existsSync(marketBlaster)) { t.skip('set MARKET_BLASTER_DIR to a market-blaster checkout'); return; }
  const f = fixture(); await exportCommand(['acme/demo'], f.io);
  writeFileSync(join(f.root, 'market-blaster.yml'), 'brand: { name: Demo }\ndestinations: [bluesky]\n');
  const result = spawnSync(process.execPath, [join(marketBlaster, 'bin/mblast.mjs'), 'import', join(f.project, 'export/acme--demo.campaign.zip')], { cwd: f.root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(readFileSync(join(f.root, 'campaigns/acme--demo/drafts/bluesky.md'), 'utf8'), /reviewHash/);
});

test('distinct hyphenated campaign addresses produce distinct import identities', async t => {
  const marketBlaster = marketBlasterDir();
  if (!existsSync(marketBlaster)) { t.skip('set MARKET_BLASTER_DIR to a market-blaster checkout'); return; }
  const f = fixture();
  for (const [address, slug] of [['a-b/c', 'a-b--c'], ['a/b-c', 'a--b-c']]) {
    const [project, campaign] = address.split('/');
    const dir = join(f.root, 'projects', project, 'campaigns', campaign);
    cpSync(f.project, dir, { recursive: true });
    await exportCommand([address, '--dir'], f.io);
    const manifest = JSON.parse(readFileSync(join(dir, 'export/manifest.json'), 'utf8'));
    assert.deepEqual([manifest.project, manifest.campaign, manifest.slug], [project, campaign, slug]);
    const result = spawnSync(process.execPath, [join(marketBlaster, 'bin/mblast.mjs'), 'import', join(dir, 'export')], { cwd: f.root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.ok(existsSync(join(f.root, 'campaigns', slug, 'drafts/bluesky.md')));
  }
});

test('real Market Blaster warns for unapproved drafts and refuses approved drafts unless forced', async t => {
  const marketBlaster = marketBlasterDir();
  if (!existsSync(marketBlaster)) { t.skip('set MARKET_BLASTER_DIR to a market-blaster checkout'); return; }
  const f = fixture();
  f.io.run = async (_cmd, args, opts) => {
    const result = spawnSync(process.execPath, [join(marketBlaster, 'bin/mblast.mjs'), ...args], { cwd: opts?.cwd, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stdout + result.stderr);
    if (result.stderr) opts?.onStderr?.(result.stderr);
    return result.stdout;
  };
  await exportCommand(['acme/demo', '--mb', f.root], f.io);
  const draft = join(f.root, 'campaigns/acme--demo/drafts/bluesky.md');
  const before = readFileSync(draft, 'utf8');
  await exportCommand(['acme/demo', '--mb', f.root], f.io);
  assert.match(f.io.stderr.join('\n'), /import will replace existing files/);
  writeFileSync(join(f.root, 'campaigns/acme--demo/state.json'), JSON.stringify({ bluesky: { approvedHash: 'approved' } }));
  await assert.rejects(exportCommand(['acme/demo', '--mb', f.root], f.io), /approved drafts.*--force/s);
  assert.equal(readFileSync(draft, 'utf8'), before);
  await exportCommand(['acme/demo', '--mb', f.root, '--force'], f.io);
  assert.equal(readFileSync(draft, 'utf8'), before);
});


test('manual export and mark host validation', async () => {
  const f = fixture('instagram'); await exportCommand(['acme/demo', '--dir'], f.io);
  assert.match(readFileSync(join(f.project, 'exports/instagram/README.md'), 'utf8'), /alt: Alt/);
  assert.ok(existsSync(join(f.project, 'exports/instagram/post.md')));
  await assert.rejects(mark(['acme/demo', 'instagram', '--url', 'https://instagram.com.evil.test/p/1'], f.io), /host/);
  await assert.rejects(mark(['acme/demo', 'instagram', '--url', 'http://instagram.com/p/1'], f.io), /host/);
  await mark(['acme/demo', 'instagram', '--url=https://www.instagram.com/p/1'], f.io);
  assert.equal(JSON.parse(readFileSync(join(f.project, 'published.json'), 'utf8')).instagram.url, 'https://www.instagram.com/p/1');
});

test('handoff invokes configured import and check and propagates failure', async () => {
  const f = fixture(), calls: string[][] = [];
  f.io.run = async (cmd, args, opts) => { calls.push([cmd, ...args]); assert.equal(opts?.cwd, f.root); return 'ok'; };
  await exportCommand(['acme/demo', `--mb=${f.root}`, '--force'], f.io);
  assert.deepEqual(calls.map(c => c[1]), ['import', 'check']); assert.ok(calls[0].includes('--force'));
  assert.deepEqual(calls[0].slice(-3), ['--slug', 'acme--demo', '--force']); assert.equal(calls[1][2], 'acme--demo');
  f.io.run = async () => { throw new Error('import failed'); };
  await assert.rejects(exportCommand(['acme/demo', '--mb', f.root], f.io), /import failed/);
});

test('export enforces current gates and reports Market Blaster check failures', async () => {
  const f = fixture();
  writeFileSync(join(f.project, 'assets/a/asset.yml'), 'id: a\nkind: logo\nprovider: template\naiGenerated: false\noutputs:\n  - { file: out/image.png, bytes: 5 }\n');
  await assert.rejects(exportCommand(['acme/demo'], f.io), /current gates failed/);
  writeFileSync(join(f.project, 'assets/a/asset.yml'), 'id: a\nkind: card\nprovider: template\naiGenerated: false\noutputs:\n  - { file: out/image.png, bytes: 5 }\n');
  f.io.run = async (_cmd, args) => { if (args.includes('check')) throw new Error('invalid destination'); return ''; };
  await assert.rejects(exportCommand(['acme/demo', '--mb', f.root], f.io), { name: 'UserError', message: /Market Blaster check failed: invalid destination/ });
});

test('campaign commands support help, option forms and early address validation', async () => {
  const f = fixture();
  for (const command of [accept, confirm, mark, exportCommand, library]) {
    assert.equal(await command(['--help'], f.io), 0);
    assert.match(f.io.stdout.at(-1)!, /Example:/);
  }
  await assert.rejects(accept(['demo', 'bluesky', '--reason=yes'], f.io), /Campaign address/);
  await assert.rejects(confirm(['demo', 'a', '--license=CC0'], f.io), /Campaign address/);
  await assert.rejects(mark(['demo', 'instagram', '--url=https://instagram.com/p/1'], f.io), /Campaign address/);
  await assert.rejects(exportCommand(['demo'], f.io), /Campaign address/);
  await confirm(['acme/demo', 'a', '--license=CC0', '--trademark-checked'], f.io);
  assert.match(readFileSync(join(f.project, 'assets/a/asset.yml'), 'utf8'), /license: CC0/);
  await accept(['--reason=Reviewed', 'acme/demo', 'bluesky'], f.io);
  assert.equal(JSON.parse(readFileSync(join(f.project, 'reviews/bluesky.json'), 'utf8')).acceptedReason, 'Reviewed');
});

test('library enumerates and searches composite campaign identities', async () => {
  const f = fixture();
  mkdirSync(join(f.root, 'projects/other/campaigns/demo'), { recursive: true });
  const entries = loadLibrary(loadConfig(f.io));
  assert.deepEqual(entries.map(entry => entry.slug), ['acme/demo', 'other/demo']);
  assert.deepEqual(loadLibrary(loadConfig(f.io), 'OTHER/DEMO').map(entry => entry.slug), ['other/demo']);
  await library(['search', 'acme'], f.io);
  assert.match(f.io.text(), /acme\tdemo/);
});

test('local zip exports retain history and update library status', async () => {
  const f = fixture(), config = loadConfig(f.io);
  assert.equal(projectDetails(config, 'acme/demo').exported, false);
  await exportCommand(['acme/demo', '--list'], f.io);
  assert.match(f.io.stdout.at(-1)!, /No campaign exports/);
  await exportCommand(['acme/demo'], f.io);
  assert.match(f.io.stdout.join('\n'), /Import later.*--mb <path>/);
  assert.equal(projectDetails(config, 'acme/demo').exported, true);
  const stable = join(f.project, 'export/acme--demo.campaign.zip');
  const first = readFileSync(stable);
  await exportCommand(['acme/demo'], f.io);
  const exports = listExports(config, 'acme/demo');
  assert.equal(exports.length, 2);
  assert.notEqual(exports[0].name, exports[1].name);
  for (const entry of exports) {
    assert.equal(entry.size, first.length);
    assert.deepEqual(readFileSync(join(f.project, 'export', entry.name)), first);
    assert.ok(Number.isFinite(Date.parse(entry.time)));
  }
  assert.deepEqual(readFileSync(stable), first);
  await exportCommand(['acme/demo', '--list'], f.io);
  assert.match(f.io.stdout.join('\n'), new RegExp(exports[0].name.replaceAll('.', '\\.')));
});

test('project Market Blaster target is project-relative, expands home and yields to explicit target', async () => {
  const f = fixture(), target = join(f.root, 'projects/acme/target'), override = join(f.root, 'override');
  mkdirSync(target); mkdirSync(override);
  const metadata = join(f.root, 'projects/acme/project.yml');
  writeFileSync(metadata, `name: Acme\ncreatedAt: '2026-01-01'\nmarketBlaster:\n  project: target\n`);
  const calls: string[] = [];
  f.io.run = async (_cmd, _args, opts) => { calls.push(opts!.cwd!); return ''; };
  await exportCommand(['acme/demo'], f.io);
  writeFileSync(metadata, `name: Acme\ncreatedAt: '2026-01-01'\nmarketBlaster:\n  project: ~/override\n`);
  f.io.env.HOME = f.root;
  await exportCommand(['acme/demo'], f.io);
  writeFileSync(metadata, `name: Acme\ncreatedAt: '2026-01-01'\nmarketBlaster:\n  project:\n`);
  await exportCommand(['acme/demo', '--mb', override], f.io);
  assert.deepEqual(calls, [target, target, override, override, override, override]);
  await assert.rejects(exportCommand(['acme/demo', '--mb', join(f.root, 'missing')], f.io), /directory not found/);
});

test('approved draft refusal suggests force without importing twice', async () => {
  const f = fixture();
  let calls = 0;
  f.io.run = async () => { calls++; throw new Error('cannot replace approved drafts'); };
  await assert.rejects(exportCommand(['acme/demo', '--mb', f.root], f.io), /approved drafts[\s\S]*--force/);
  assert.equal(calls, 1);
});

test('library summarizes recent top-level changes, pending feedback and marked platforms', () => {
  const f = fixture();
  writeFileSync(join(f.project, 'feedback.yml'), [
    '- { id: one, target: {}, note: pending, at: "2026-01-01", status: pending }',
    '- { id: two, target: {}, note: done, at: "2026-01-01", status: applied }',
    '- { id: three, target: {}, note: no, at: "2026-01-01", status: rejected }',
  ].join('\n'));
  writeFileSync(join(f.project, 'published.json'), JSON.stringify({ instagram: { url: 'https://instagram.com/p/1' } }));
  const latest = new Date('2030-01-01T00:00:00.000Z');
  utimesSync(join(f.project, 'feedback.yml'), latest, latest);
  const entry = loadLibrary(loadConfig(f.io))[0];
  assert.equal(entry.updatedAt, latest.toISOString());
  assert.equal(entry.pendingFeedback, 1);
  assert.deepEqual(Object.keys(entry.published), ['instagram']);
});

test('status reports export time, publication marks and the next export action', async () => {
  const f = fixture();
  writeFileSync(join(f.project, 'plan.yml'), '[]\n');
  await status(['acme/demo'], f.io);
  assert.match(f.io.text(), /exported: not exported/);
  assert.match(f.io.text(), /published: none/);
  assert.match(f.io.text(), /next: export: bstudio export acme\/demo/);
  await exportCommand(['acme/demo'], f.io);
  const time = new Date('2026-06-01T12:00:00.000Z');
  utimesSync(join(f.project, 'export/acme--demo.campaign.zip'), time, time);
  writeFileSync(join(f.project, 'published.json'), JSON.stringify({ instagram: { url: 'https://instagram.com/p/1' } }));
  await status(['acme/demo'], f.io);
  assert.match(f.io.text(), /exported: 2026-06-01T12:00:00.000Z/);
  assert.match(f.io.text(), /published: instagram/);
});

test('directory exports retain snapshots including handoffs and report exported', async () => {
  const f = fixture('instagram'), config = loadConfig(f.io);
  await exportCommand(['acme/demo', '--dir'], f.io);
  await exportCommand(['acme/demo', '--dir'], f.io);
  const entries = listExports(config, 'acme/demo');
  assert.equal(entries.length, 2);
  assert.ok(entries.every(entry => entry.kind === 'directory' && entry.size > 0));
  for (const entry of entries) {
    assert.ok(existsSync(join(f.project, 'export', entry.name, 'manifest.json')));
    assert.ok(existsSync(join(f.project, 'export', entry.name, 'handoff/instagram/post.md')));
  }
  assert.equal(projectDetails(config, 'acme/demo').exported, true);
  await exportCommand(['acme/demo', '--list'], f.io);
  assert.match(f.io.text(), /directory/);
});

test('status suggests re-export for newer posts and marking unpublished manual destinations', async () => {
  const f = fixture('instagram');
  writeFileSync(join(f.project, 'plan.yml'), '[]\n');
  await exportCommand(['acme/demo'], f.io);
  const stable = join(f.project, 'export/acme--demo.campaign.zip');
  const future = new Date('2030-01-01T00:00:00Z');
  utimesSync(stable, future, future);
  await status(['acme/demo'], f.io);
  assert.match(f.io.text(), /record publication: bstudio mark acme\/demo instagram --url <url>/);
  utimesSync(join(f.project, 'posts/instagram.md'), new Date('2031-01-01'), new Date('2031-01-01'));
  const before = f.io.stdout.length;
  await status(['acme/demo'], f.io);
  assert.match(f.io.stdout.slice(before).join('\n'), /next: export: bstudio export acme\/demo/);
});

test('library updatedAt includes post, review and asset metadata edits', () => {
  const f = fixture(), config = loadConfig(f.io);
  for (const [file, year] of [['posts/bluesky.md', 2031], ['reviews/bluesky.json', 2032], ['assets/a/asset.yml', 2033]] as const) {
    const time = new Date(`${year}-01-01T00:00:00Z`);
    utimesSync(join(f.project, file), time, time);
    assert.equal(projectDetails(config, 'acme/demo').updatedAt, time.toISOString());
  }
});

test('export history orders collision numbers and uses timestamps in names', () => {
  const f = fixture(), root = join(f.project, 'export');
  for (const suffix of ['', '-1', '-10']) {
    const dir = join(root, `2026-01-02T03-04-05-006Z${suffix}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'acme--demo.campaign.zip'), suffix);
    utimesSync(join(dir, 'acme--demo.campaign.zip'), new Date('2040-01-01'), new Date('2040-01-01'));
  }
  const entries = listExports(loadConfig(f.io), 'acme/demo');
  assert.deepEqual(entries.map(entry => entry.name.split('/')[0]), ['2026-01-02T03-04-05-006Z-10', '2026-01-02T03-04-05-006Z-1', '2026-01-02T03-04-05-006Z']);
  assert.ok(entries.every(entry => entry.time === '2026-01-02T03:04:05.006Z'));
});

test('retained history counts as exported when the stable zip is removed', async () => {
  const f = fixture(), config = loadConfig(f.io);
  writeFileSync(join(f.project, 'plan.yml'), '[]\n');
  await exportCommand(['acme/demo'], f.io);
  const history = listExports(config, 'acme/demo')[0];
  unlinkSync(join(f.project, 'export/acme--demo.campaign.zip'));
  assert.equal(projectDetails(config, 'acme/demo').exported, true);
  await status(['acme/demo'], f.io);
  assert.ok(f.io.stdout.includes(`  exported: ${history.time}`));
});


test('status requires the latest Market Blaster export to have been imported', async () => {
  const f = fixture(), config = loadConfig(f.io);
  writeFileSync(join(f.project, 'plan.yml'), '[]\n');
  const next = async () => {
    const start = f.io.stdout.length;
    await status(['acme/demo'], f.io);
    return f.io.stdout.slice(start).find(line => line.includes('next:'))!;
  };
  await exportCommand(['acme/demo'], f.io);
  assert.match(await next(), /bstudio export acme\/demo --mb <path>/);
  f.io.run = async () => '';
  await exportCommand(['acme/demo', '--mb', f.root], f.io);
  const imported = listExports(config, 'acme/demo')[0];
  const receipt = JSON.parse(readFileSync(join(f.project, 'export', imported.name.split('/')[0], 'imported.json'), 'utf8'));
  assert.equal(receipt.project, f.root);
  assert.equal(receipt.slug, 'acme--demo');
  assert.ok(Number.isFinite(Date.parse(receipt.at)));
  assert.match(await next(), /next: done/);
  f.io.run = async () => { throw new Error('cannot replace approved drafts'); };
  await assert.rejects(exportCommand(['acme/demo', '--mb', f.root], f.io), /approved drafts/);
  const refused = listExports(config, 'acme/demo')[0];
  assert.notEqual(refused.name, imported.name);
  assert.equal(existsSync(join(f.project, 'export', refused.name.split('/')[0], 'imported.json')), false);
  assert.match(await next(), /bstudio export acme\/demo --mb <path>/);
  f.io.run = async () => '';
  await exportCommand(['acme/demo', '--mb', f.root, '--dir'], f.io);
  assert.match(await next(), /next: done/);
  await exportCommand(['acme/demo', '--dir'], f.io);
  assert.match(await next(), /bstudio export acme\/demo --mb <path>/);
});

test('successful import is recorded even when the subsequent check fails', async () => {
  const f = fixture(), config = loadConfig(f.io);
  writeFileSync(join(f.project, 'plan.yml'), '[]\n');
  f.io.run = async (_cmd, args) => { if (args.includes('check')) throw new Error('invalid destination'); return ''; };
  await assert.rejects(exportCommand(['acme/demo', '--mb', f.root], f.io), /check failed/);
  const latest = listExports(config, 'acme/demo')[0];
  assert.ok(existsSync(join(f.project, 'export', latest.name.split('/')[0], 'imported.json')));
  await status(['acme/demo'], f.io);
  assert.match(f.io.text(), /next: done/);
});

test('a manual-only campaign is complete once its publications are marked', async () => {
  const f = fixture('instagram');
  writeFileSync(join(f.project, 'plan.yml'), '[]\n');
  await exportCommand(['acme/demo'], f.io);
  await mark(['acme/demo', 'instagram', '--url', 'https://instagram.com/p/1'], f.io);
  await status(['acme/demo'], f.io);
  assert.match(f.io.text(), /next: done/);
});

test('mixed campaigns require both a manual publication mark and an import', async () => {
  const f = fixture(), manual = fixture('instagram');
  cpSync(join(manual.project, 'posts/instagram.md'), join(f.project, 'posts/instagram.md'));
  cpSync(join(manual.project, 'reviews/instagram.json'), join(f.project, 'reviews/instagram.json'));
  writeFileSync(join(f.project, 'plan.yml'), '[]\n');
  await exportCommand(['acme/demo'], f.io);
  await mark(['acme/demo', 'instagram', '--url', 'https://instagram.com/p/1'], f.io);
  await status(['acme/demo'], f.io);
  assert.match(f.io.text(), /next: import: bstudio export acme\/demo --mb <path>/);
  f.io.run = async () => '';
  await exportCommand(['acme/demo', '--mb', f.root], f.io);
  const before = f.io.stdout.length;
  await status(['acme/demo'], f.io);
  assert.match(f.io.stdout.slice(before).join('\n'), /next: done/);
});