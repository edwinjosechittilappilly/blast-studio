import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../src/config.ts';
import { check, extractText, repoRoot } from '../src/updater/check.ts';
import { propose, verify } from '../src/updater/propose.ts';
import { latestSources } from '../src/library.ts';
import { runAgentInWorkspace } from '../src/workspace.ts';
import type { SourceRow } from '../src/packs.ts';
import { fakeIO, tempStudio } from './helpers.ts';

const source: SourceRow = { id: 's', platform: 'devto', url: 'https://example.org/page', scope: 'test', detector: { kind: 'page-hash', selector: '#content' }, governs: [] };
const packs = new Map<string, unknown>([['devto', { limit: { value: 1, source: 's' } }]]);
test('checks snapshots, selector, report, failures and git paths', async () => {
  const root = tempStudio(); let html = '<body><nav>noise</nav><main id="content">old <b>text</b></main></body>';
  const io = fakeIO({ cwd: root, fetch: async () => new Response(html) });
  assert.equal((await check(io, { root, sources: [source], packs, date: '2026-01-01' })).results[0].status, 'new');
  assert.equal(existsSync(join(root, 'platforms/snapshots/s.txt')), false);
  assert.equal((await check(io, { root, sources: [source], packs, date: '2026-01-02', write: true })).results[0].status, 'new');
  html = '<main id="content">new text<script>bad</script></main>';
  const changed = await check(io, { root, sources: [source], packs, date: '2026-01-03', write: true });
  assert.equal(changed.code, 2); assert.match(changed.report, /devto.limit/);
  assert.equal(readFileSync(join(root, 'platforms/snapshots/s.txt'), 'utf8'), 'new text');
  const fail = fakeIO({ cwd: root, fetch: async () => new Response('', { status: 404 }) });
  assert.equal((await check(fail, { root, sources: [source], packs })).code, 1);
  const empty = fakeIO({ cwd: root, fetch: async () => new Response('<main><script>client render only</script></main>') });
  assert.equal((await check(empty, { root, sources: [source], packs })).results[0].status, 'failed');
  let redirect: RequestRedirect | undefined;
  const sameHost = fakeIO({ cwd: root, fetch: async (_, init) => { redirect = init?.redirect; return new Response(null, { status: 302, headers: { location: '/new' } }); } });
  assert.equal((await check(sameHost, { root, sources: [source], packs })).results[0].status, 'failed');
  assert.equal(redirect, 'manual');
  const git: SourceRow = { ...source, detector: { kind: 'git-path', repo: 'owner/repo', path: 'some file', branch: 'main' } };
  let called = ''; const gitIO = fakeIO({ cwd: root, run: async (_, args) => { called = args[1]; return JSON.stringify([{ sha: 'a'.repeat(40) }]); } });
  assert.equal((await check(gitIO, { root, sources: [git], packs })).results[0].status, 'changed');
  assert.match(called, /path=some\+file/); assert.match(called, /sha=main/);
  assert.equal(extractText('<body><article><p class="pick">one <b>two</b></p></article></body>', '.pick'), 'one two');
  assert.equal(extractText('<body><div data-id="yes">fine</div></body>', '[data-id=yes]'), 'fine');
});

test('propose ignores changes with no governed fields', async () => {
  const root = tempStudio(); mkdirSync(join(root, 'updates'));
  writeFileSync(join(root, 'updates/2026-01-03.json'), JSON.stringify([{ id: 's', status: 'changed', fields: [] }]));
  await propose(fakeIO({ cwd: root, run: async () => { throw new Error('agent must not run'); } }), { root });
});

test('verify preserves comments and writes sourced metadata', () => {
  const root = tempStudio(); cpSync(join(repoRoot, 'platforms'), join(root, 'platforms'), { recursive: true });
  const file = join(root, 'platforms/devto/pack.yml'); writeFileSync(file, '# retained\n' + readFileSync(file, 'utf8'));
  verify(['devto-28'], { root, date: '2026-01-03' });
  const text = readFileSync(file, 'utf8'); assert.match(text, /# retained/); assert.match(text, /verified: 2026-01-03/); assert.match(text, /lastVerified: 2026-01-03/);
  assert.match(text, /aiLastVerified: 2026-01-03/);
});

test('dashboard lists unverified sourced pack fields', () => {
  const root = tempStudio(), config = loadConfig(fakeIO({ cwd: root, env: { BSTUDIO_CONFIG: join(root, 'studio.yml'), BSTUDIO_HOME: root } }));
  const { unverified } = latestSources(config);
  assert.ok(unverified.includes('devto.disclosure.text'));
  assert.ok(!unverified.some(path => path.includes(': manual') || path.includes(': new')));
});

test('proposals reject unsupported quotes and forbidden writes', async () => {
  const root = tempStudio(); cpSync(join(repoRoot, 'platforms'), join(root, 'platforms'), { recursive: true }); mkdirSync(join(root, 'updates'));
  writeFileSync(join(root, 'updates/2026-01-03.json'), JSON.stringify([{ id: 'devto-28', status: 'changed', fields: ['devto.disclosure.text'], old: 'before', text: 'The changed policy has enough evidence.' }]));
  const file = join(root, 'platforms/devto/pack.yml'), original = readFileSync(file, 'utf8');
  const io = fakeIO({ cwd: root, env: { BSTUDIO_CONFIG: join(root, 'studio.yml'), BSTUDIO_HOME: root }, run: async (_, __, opts) => {
    const target = join(opts!.cwd!, 'platforms/devto/pack.yml'); const pack = JSON.parse(readFileSync(target, 'utf8')); pack.disclosure.text.rule = 'changed'; writeFileSync(target, JSON.stringify(pack));
    return '```json\n[{"path":"platforms/devto/pack.yml/disclosure/text/rule","source":"devto-28","quote":"invented"}]\n```';
  } });
  await assert.rejects(propose(io, { root }), /unsupported quote/); assert.equal(readFileSync(file, 'utf8'), original);
  const bad = fakeIO({ ...io, cwd: root, run: async (_, __, opts) => { writeFileSync(join(opts!.cwd!, 'evil.txt'), 'bad'); return '```json\n[]\n```'; } });
  await assert.rejects(propose(bad, { root }), /disallowed output/);
  const badSkill = fakeIO({ ...io, cwd: root, run: async (_, __, opts) => { writeFileSync(join(opts!.cwd!, 'skills/studio-updater/SKILL.md'), 'changed'); return '```json\n[]\n```'; } });
  const short = fakeIO({ ...io, cwd: root, run: async (_, __, opts) => {
    const target = join(opts!.cwd!, 'platforms/devto/pack.yml'); const pack = JSON.parse(readFileSync(target, 'utf8')); pack.disclosure.text.rule = 'changed'; writeFileSync(target, JSON.stringify(pack));
    return '```json\n[{"path":"platforms/devto/pack.yml/disclosure/text/rule","source":"devto-28","quote":"changed"}]\n```';
  } });
  await assert.rejects(propose(short, { root }), /unsupported quote/);
  const metadata = fakeIO({ ...io, cwd: root, run: async (_, __, opts) => {
    const target = join(opts!.cwd!, 'platforms/devto/pack.yml'); const pack = JSON.parse(readFileSync(target, 'utf8')); pack.disclosure.text.verified = '2026-01-03'; writeFileSync(target, JSON.stringify(pack));
    return '```json\n[]\n```';
  } });
  await assert.rejects(propose(metadata, { root }), /verification metadata/);
  await assert.rejects(propose(badSkill, { root }), /disallowed output/);
  const good = fakeIO({ ...io, cwd: root, run: async (_, __, opts) => {
    const target = join(opts!.cwd!, 'platforms/devto/pack.yml'); const pack = JSON.parse(readFileSync(target, 'utf8')); pack.disclosure.text.rule = 'changed'; writeFileSync(target, JSON.stringify(pack));
    return '```json\n[{"path":"platforms/devto/pack.yml/disclosure/text/rule","source":"devto-28","quote":"The changed policy has enough evidence."}]\n```';
  } });
  await propose(good, { root });
  assert.match(readFileSync(file, 'utf8'), /changed/);
  assert.match(readFileSync(join(root, 'updates/2026-01-03-proposal.md'), 'utf8'), /changed policy/);
});

test('workspace only passes approved agent environment', async () => {
  const root = tempStudio(), config = loadConfig(fakeIO({ cwd: root, env: { BSTUDIO_CONFIG: join(root, 'studio.yml'), BSTUDIO_HOME: root } }));
  let env: Record<string, string | undefined> = {};
  const io = fakeIO({ cwd: root, env: { ANTHROPIC_API_KEY: 'key', OPENAI_API_KEY: 'private' }, run: async (_, __, opts) => { env = opts?.env ?? {}; return ''; } });
  const options = { config, io, projectDir: root, files: {}, allowOut: [], prompt: '', timeoutMs: 1000 };
  await runAgentInWorkspace({ ...options, passEnv: ['ANTHROPIC_API_KEY'] });
  assert.equal(env.ANTHROPIC_API_KEY, 'key'); assert.equal(env.OPENAI_API_KEY, undefined);
  await assert.rejects(runAgentInWorkspace({ ...options, passEnv: ['OPENAI_API_KEY'] }), /Disallowed/);
});
