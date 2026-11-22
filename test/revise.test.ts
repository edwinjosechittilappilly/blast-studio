import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { stringify } from 'yaml';
import { run as revise } from '../src/commands/revise.ts';
import { run as review } from '../src/commands/review.ts';
import { fakeIO, tempStudio } from './helpers.ts';
import { loadFeedback, addFeedback } from '../src/feedback.ts';
import { UserError } from '../src/types.ts';
import { withCampaignLock } from '../src/cli.ts';
import { acquireCampaignLock } from '../src/jobs/runner.ts';

function fixture(maxRounds: number) {
  const root = tempStudio({
    'studio.yml': `brand: {name: Demo}\nplatforms: [bluesky]\nreviewer: {command: null}\nreview: {maxRounds: ${maxRounds}}\n`,
    'projects/demo/campaigns/launch/brief.md': '## [E1] Idea\n\nA useful idea.\n',
    'projects/demo/campaigns/launch/plan.yml': stringify([{ platform: 'bluesky', type: 'text', angle: 'Useful', hooks: ['One', 'Two', 'Three'], assets: [] }]),
    'projects/demo/campaigns/launch/posts/bluesky.md': '---\nplatform: bluesky\nevidence: [E1]\nmedia: []\n---\nOriginal\n',
    'projects/demo/campaigns/launch/reviews/bluesky.json': JSON.stringify({ platform: 'bluesky', verdict: 'revise', gates: [] }),
  });
  const project = join(root, 'projects/demo/campaigns/launch'); let calls = 0;
  const io = fakeIO({ cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: join(root, 'studio.yml') }, run: async (_cmd, _args, opts) => {
    calls++;
    writeFileSync(join(opts!.cwd!, 'posts/bluesky.md'), `---\nplatform: bluesky\nevidence: [E1]\nmedia: []\n---\nRevision ${calls}\n`);
    return '';
  } });
  return { root, project, io, calls: () => calls };
}

test('zero revision rounds refuses without invoking the agent', async () => {
  const f = fixture(0);
  await assert.rejects(revise(['demo/launch'], f.io), /revision.*limit/i);
  assert.equal(f.calls(), 0);
  assert.match(readFileSync(join(f.project, 'posts/bluesky.md'), 'utf8'), /Original/);
});

test('revision applies edits, rerenders and rereviews at most maxRounds times', async () => {
  const f = fixture(2);
  await assert.rejects(revise(['demo/launch'], f.io), /revision.*limit/i);
  assert.equal(f.calls(), 2);
  assert.match(readFileSync(join(f.project, 'posts/bluesky.md'), 'utf8'), /Revision 2/);
  const review = JSON.parse(readFileSync(join(f.project, 'reviews/bluesky.json'), 'utf8'));
  assert.equal(review.verdict, 'revise');
  assert.ok(review.gates.length > 0);
  assert.equal(f.io.stdout.filter(line => line.startsWith('Rendered ')).length, 2);
  assert.equal(f.io.stdout.filter(line => line.startsWith('bluesky: revise')).length, 2);
});

test('missing media fails specs without invoking the paid reviewer', async () => {
  const f = fixture(1);
  writeFileSync(join(f.root, 'studio.yml'), 'brand: {name: Demo}\nplatforms: [bluesky]\nreviewer: {command: [reviewer]}\n');
  writeFileSync(join(f.project, 'posts/bluesky.md'), '---\nplatform: bluesky\nevidence: [E1]\nmedia:\n  - { asset: missing, file: assets/missing/out/image.png, kind: image, alt: Alt }\n---\nOriginal\n');
  await review(['demo/launch'], f.io);
  const result = JSON.parse(readFileSync(join(f.project, 'reviews/bluesky.json'), 'utf8'));
  assert.equal(f.calls(), 0);
  assert.equal(result.gates.find((g: { id: string }) => g.id === 'specs').pass, false);
  assert.match(result.gates.find((g: { id: string }) => g.id === 'specs').message, /missing project media/i);
});

test('revision leaves accepted posts and their assets untouched', async () => {
  const f = fixture(1);
  const logo = { id: 'logo', kind: 'logo', brief: 'Logo' };
  writeFileSync(join(f.project, 'plan.yml'), stringify([
    { platform: 'bluesky', type: 'text', angle: 'Useful', hooks: ['One', 'Two', 'Three'], assets: [] },
    { platform: 'instagram', type: 'image', angle: 'Useful', hooks: ['One', 'Two', 'Three'], assets: [logo] },
  ]));
  mkdirSync(join(f.project, 'assets/logo/out'), { recursive: true });
  writeFileSync(join(f.project, 'assets/logo/asset.yml'), 'id: logo\nkind: logo\nprovider: template\naiGenerated: false\noutputs: []\n');
  writeFileSync(join(f.project, 'posts/instagram.md'), '---\nplatform: instagram\nevidence: [E1]\nmedia:\n  - { asset: logo, file: assets/logo/out/logo.png, kind: image, alt: Logo }\n---\nAccepted\n');
  const accepted = JSON.stringify({ platform: 'instagram', verdict: 'accepted', gates: [], acceptedReason: 'approved' });
  writeFileSync(join(f.project, 'reviews/instagram.json'), accepted);
  await assert.rejects(revise(['demo/launch'], f.io), /revision.*limit/i);
  assert.equal(readFileSync(join(f.project, 'reviews/instagram.json'), 'utf8'), accepted);
  assert.equal(f.io.stdout.some(line => line.startsWith('instagram:')), false);
});

test('owner asset feedback is scoped, passed verbatim and marked applied', async () => {
  const f = fixture(0);
  writeFileSync(join(f.project, 'plan.yml'), stringify([{ platform: 'bluesky', type: 'text', angle: 'Useful', hooks: ['One', 'Two', 'Three'], assets: [{ id: 'logo', kind: 'logo', brief: 'Logo' }] }]));
  mkdirSync(join(f.project, 'assets/logo'), { recursive: true });
  writeFileSync(join(f.project, 'assets/logo/asset.yml'), 'id: logo\nkind: logo\nprovider: template\naiGenerated: false\noutputs: []\n');
  let prompt = '';
  f.io.run = async (_cmd, args, opts) => {
    prompt = args.join('\n');
    mkdirSync(join(opts!.cwd!, 'posts'), { recursive: true });
    writeFileSync(join(opts!.cwd!, 'posts/bluesky.md'), 'unauthorized');
    return '';
  };
  await revise(['demo/launch', '--note', 'Use a brighter color.\nKeep the mark.', '--asset', 'logo'], f.io);
  assert.match(prompt, /Use a brighter color\.\nKeep the mark\./);
  assert.match(readFileSync(join(f.project, 'posts/bluesky.md'), 'utf8'), /Original/);
  assert.equal(loadFeedback(f.project)[0].status, 'applied');
  assert.ok(loadFeedback(f.project)[0].appliedAt);
});

test('unknown asset is rejected without recording feedback', async () => {
  const f = fixture(0);
  await assert.rejects(revise(['demo/launch', '--note', 'Change it', '--asset', 'missing'], f.io), UserError);
  assert.deepEqual(loadFeedback(f.project), []);
});

test('concurrent feedback submissions and revision updates preserve every committed change', async () => {
  const { project } = fixture(0);
  const applied = addFeedback(project, {}, 'To apply');
  const rejected = addFeedback(project, {}, 'To reject');
  const moduleUrl = new URL('../src/feedback.ts', import.meta.url).href;
  const script = `
    import { addFeedback, markApplied, rejectFeedback } from ${JSON.stringify(moduleUrl)};
    const [dir, worker, applied, rejected] = process.argv.slice(1);
    for (let i = 0; i < 20; i++) {
      addFeedback(dir, {}, worker + ':' + i);
      markApplied(dir, [applied]);
      rejectFeedback(dir, new Map([[rejected, 'No longer relevant']]));
    }
  `;
  await Promise.all(Array.from({ length: 4 }, (_, worker) => {
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    const child = spawn(process.execPath, ['--input-type=module', '-e', script, project, String(worker), applied.id, rejected.id]);
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`feedback worker failed (${code}): ${stderr}`)));
    return promise;
  }));
  const entries = loadFeedback(project);
  assert.equal(entries.length, 82);
  assert.equal(entries.find(entry => entry.id === applied.id)?.status, 'applied');
  const rejectedEntry = entries.find(entry => entry.id === rejected.id);
  assert.equal(rejectedEntry?.status, 'rejected');
  assert.equal(rejectedEntry?.rejectedReason, 'No longer relevant');
  for (let worker = 0; worker < 4; worker++) {
    for (let i = 0; i < 20; i++) {
      assert.equal(entries.filter(entry => entry.note === `${worker}:${i}` && entry.status === 'pending').length, 1);
    }
  }
});

test('plain revise applies pending dashboard feedback even with zero automatic rounds', async () => {
  const f = fixture(0);
  writeFileSync(join(f.project, 'reviews/bluesky.json'), JSON.stringify({ platform: 'bluesky', verdict: 'pass', gates: [] }));
  addFeedback(f.project, { platform: 'bluesky' }, 'Adjust the opening');
  let prompt = '';
  f.io.run = async (_cmd, args) => { prompt = args.join('\n'); return ''; };
  await revise(['demo/launch'], f.io);
  assert.match(prompt, /Adjust the opening/);
  assert.equal(loadFeedback(f.project)[0].status, 'applied');
});

test('passing reviews with no feedback have nothing to revise', async () => {
  const f = fixture(0);
  writeFileSync(join(f.project, 'reviews/bluesky.json'), JSON.stringify({ platform: 'bluesky', verdict: 'pass', gates: [] }));
  await revise(['demo/launch'], f.io);
  assert.ok(f.io.stdout.includes('Nothing to revise'));
});

test('platform feedback reviews only the edited platform', async () => {
  const f = fixture(0);
  writeFileSync(join(f.project, 'plan.yml'), stringify([
    { platform: 'bluesky', type: 'text', angle: 'Useful', hooks: ['One', 'Two', 'Three'], assets: [] },
    { platform: 'instagram', type: 'text', angle: 'Useful', hooks: ['One', 'Two', 'Three'], assets: [] },
  ]));
  writeFileSync(join(f.project, 'posts/instagram.md'), '---\nplatform: instagram\nevidence: [E1]\nmedia: []\n---\nOriginal\n');
  const untouched = JSON.stringify({ platform: 'instagram', verdict: 'pass', gates: [] });
  writeFileSync(join(f.project, 'reviews/instagram.json'), untouched);
  f.io.run = async (_cmd, _args, opts) => {
    writeFileSync(join(opts!.cwd!, 'posts/bluesky.md'), '---\nplatform: bluesky\nevidence: [E1]\nmedia: []\n---\nUpdated\n');
    return '';
  };
  await revise(['demo/launch', '--note=New opening', '--platform=bluesky'], f.io);
  assert.equal(readFileSync(join(f.project, 'reviews/instagram.json'), 'utf8'), untouched);
  assert.ok(f.io.stdout.some(line => line.startsWith('bluesky:')));
  assert.ok(!f.io.stdout.some(line => line.startsWith('instagram:')));
});

test('changed asset rerenders assets embedding it', async () => {
  const f = fixture(0);
  const assets = [{ id: 'child', kind: 'illustration', brief: 'Child' }, { id: 'parent', kind: 'illustration', brief: 'Parent' }];
  writeFileSync(join(f.project, 'plan.yml'), stringify([{ platform: 'bluesky', type: 'text', angle: 'Useful', hooks: ['One', 'Two', 'Three'], assets }]));
  for (const id of ['child', 'parent']) {
    mkdirSync(join(f.project, 'assets', id), { recursive: true });
    writeFileSync(join(f.project, 'assets', id, 'asset.yml'), stringify({ id, kind: 'illustration', provider: 'none', aiGenerated: false, outputs: [], ...(id === 'parent' ? { embeds: ['child'] } : {}) }));
    writeFileSync(join(f.project, 'assets', id, 'source.json'), '{"prompt":"original"}');
  }
  f.io.run = async (_cmd, _args, opts) => { writeFileSync(join(opts!.cwd!, 'assets/child/source.json'), '{"prompt":"updated"}'); return ''; };
  await revise(['demo/launch', '--note', 'Change child', '--asset', 'child'], f.io);
  assert.ok(f.io.stdout.some(line => line.includes('child: illustration needs')));
  assert.ok(f.io.stdout.some(line => line.includes('parent: illustration needs')));
});

test('render failure leaves feedback applied so it is not applied twice', async () => {
  const f = fixture(0);
  writeFileSync(join(f.project, 'plan.yml'), stringify([{ platform: 'bluesky', type: 'text', angle: 'Useful', hooks: ['One', 'Two', 'Three'], assets: [{ id: 'logo', kind: 'logo', brief: 'Logo' }] }]));
  mkdirSync(join(f.project, 'assets/logo'), { recursive: true });
  writeFileSync(join(f.project, 'assets/logo/asset.yml'), 'id: logo\nkind: logo\nprovider: template\naiGenerated: false\noutputs: []\n');
  let calls = 0;
  f.io.run = async (_cmd, _args, opts) => { calls++; writeFileSync(join(opts!.cwd!, 'assets/logo/source.txt'), 'changed'); return ''; };
  await assert.rejects(revise(['demo/launch', '--note', 'Change logo', '--asset', 'logo'], f.io), /Feedback is applied in the sources[\s\S]*Re-render:[\s\S]*Re-review:/);
  assert.equal(loadFeedback(f.project)[0].status, 'applied');
  await revise(['demo/launch', '--feedback-only'], f.io);
  assert.equal(calls, 1);
});

test('stale feedback is rejected without blocking other feedback', async () => {
  const f = fixture(0);
  writeFileSync(join(f.project, 'reviews/bluesky.json'), JSON.stringify({ platform: 'bluesky', verdict: 'pass', gates: [] }));
  writeFileSync(join(f.project, 'feedback.yml'), stringify([{ id: 'old', target: { asset: 'removed' }, note: 'Old', at: new Date().toISOString(), status: 'pending' }]));
  addFeedback(f.project, { platform: 'bluesky' }, 'Current');
  let prompt = '';
  f.io.run = async (_cmd, args) => { prompt = args.join('\n'); return ''; };
  await revise(['demo/launch', '--feedback-only'], f.io);
  const entries = loadFeedback(f.project);
  assert.equal(entries[0].status, 'rejected');
  assert.match(entries[0].rejectedReason!, /Unknown asset/);
  assert.equal(entries[1].status, 'applied');
  assert.match(prompt, /Current/);
});

test('revision lock prevents concurrent runs', async () => {
  const f = fixture(0);
  writeFileSync(join(f.root, 'projects/demo/project.yml'), 'name: Demo\n');
  const release = acquireCampaignLock(f.root, 'demo/launch');
  try {
    await assert.rejects(withCampaignLock('revise', ['demo/launch', '--feedback-only'], f.io, io => revise(['demo/launch', '--feedback-only'], io)), /Campaign is locked/);
  } finally { release(); }
});

test('different feedback targets get separate scoped agent runs', async () => {
  const f = fixture(0);
  writeFileSync(join(f.project, 'plan.yml'), stringify([{ platform: 'bluesky', type: 'text', angle: 'Useful', hooks: ['One', 'Two', 'Three'], assets: [{ id: 'logo', kind: 'logo', brief: 'Logo' }] }]));
  mkdirSync(join(f.project, 'assets/logo'), { recursive: true });
  writeFileSync(join(f.project, 'assets/logo/asset.yml'), 'id: logo\nkind: logo\nprovider: template\naiGenerated: false\noutputs: []\n');
  addFeedback(f.project, { asset: 'logo' }, 'Adjust logo');
  addFeedback(f.project, { platform: 'bluesky' }, 'Adjust post');
  const prompts: string[] = [];
  f.io.run = async (_cmd, args) => { prompts.push(args.join('\n')); return ''; };
  await revise(['demo/launch', '--feedback-only'], f.io);
  assert.equal(prompts.length, 2);
  assert.match(prompts[0], /Adjust logo/);
  assert.doesNotMatch(prompts[0], /Adjust post/);
  assert.match(prompts[1], /Adjust post/);
  assert.doesNotMatch(prompts[1], /Adjust logo/);
});
