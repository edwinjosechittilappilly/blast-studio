import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { parse, stringify } from 'yaml';
import { chromium } from 'playwright';
import { createRevise, run as revise } from '../src/commands/revise.ts';
import { run as review } from '../src/commands/review.ts';
import { fakeIO, tempStudio } from './helpers.ts';
import { loadFeedback, addFeedback } from '../src/feedback.ts';
import { UserError } from '../src/types.ts';
import { withCampaignLock } from '../src/cli.ts';
import { acquireCampaignLock } from '../src/jobs/runner.ts';
import { packageBin } from '../src/render/bins.ts';

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
    const meta = join(opts!.cwd!, 'assets/logo/asset.yml');
    writeFileSync(meta, `${readFileSync(meta, 'utf8')}description: Brighter\n`);
    return '';
  };
  await createRevise(async () => 0)(['demo/launch', '--note', 'Use a brighter color.\nKeep the mark.', '--asset', 'logo'], f.io);
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
  f.io.run = async (_cmd, args, opts) => {
    prompt = args.join('\n');
    writeFileSync(join(opts!.cwd!, 'posts/bluesky.md'), '---\nplatform: bluesky\nevidence: [E1]\nmedia: []\n---\nRevised opening\n');
    return '';
  };
  await assert.rejects(revise(['demo/launch'], f.io), /Revision round limit \(0\)/);
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

test('render failure leaves feedback pending', async () => {
  const f = fixture(0);
  writeFileSync(join(f.project, 'plan.yml'), stringify([{ platform: 'bluesky', type: 'text', angle: 'Useful', hooks: ['One', 'Two', 'Three'], assets: [{ id: 'logo', kind: 'logo', brief: 'Logo' }] }]));
  mkdirSync(join(f.project, 'assets/logo'), { recursive: true });
  writeFileSync(join(f.project, 'assets/logo/asset.yml'), 'id: logo\nkind: logo\nprovider: template\naiGenerated: false\noutputs: []\n');
  f.io.run = async (_cmd, _args, opts) => { writeFileSync(join(opts!.cwd!, 'assets/logo/source.txt'), 'changed'); return ''; };
  await assert.rejects(createRevise(async () => { throw new UserError('render failed'); })(['demo/launch', '--note', 'Change logo', '--asset', 'logo'], f.io), /Feedback remains pending[\s\S]*Re-render:[\s\S]*Re-review:/);
  assert.equal(loadFeedback(f.project)[0].status, 'pending');
});

test('unexpected render errors propagate unchanged and leave feedback pending', async () => {
  const f = fixture(0);
  writeFileSync(join(f.project, 'plan.yml'), stringify([{ platform: 'bluesky', type: 'text', angle: 'Useful', hooks: ['One', 'Two', 'Three'], assets: [{ id: 'logo', kind: 'logo', brief: 'Logo' }] }]));
  mkdirSync(join(f.project, 'assets/logo'), { recursive: true });
  writeFileSync(join(f.project, 'assets/logo/asset.yml'), 'id: logo\nkind: logo\nprovider: template\naiGenerated: false\noutputs: []\n');
  f.io.run = async (_cmd, _args, opts) => { writeFileSync(join(opts!.cwd!, 'assets/logo/source.txt'), 'changed'); return ''; };
  const failure = new Error('unexpected render error');
  await assert.rejects(createRevise(async () => { throw failure; })(['demo/launch', '--note', 'Change logo', '--asset', 'logo'], f.io), error => error === failure);
  assert.equal(loadFeedback(f.project)[0].status, 'pending');
});

test('feedback remains pending when the agent makes no changes', async () => {
  const f = fixture(0);
  let renders = 0;
  f.io.run = async () => '';
  await assert.rejects(createRevise(async () => { renders++; return 0; })(['demo/launch', '--note', 'Improve the post', '--platform', 'bluesky'], f.io), /Feedback remains pending/);
  assert.equal(renders, 0);
  assert.equal(loadFeedback(f.project)[0].status, 'pending');
});

test('retry after fixing invalid aspects renders written sources without rerunning the agent', async () => {
  const f = fixture(0);
  writeFileSync(join(f.project, 'plan.yml'), stringify([{ platform: 'bluesky', type: 'text', angle: 'Useful', hooks: ['One', 'Two', 'Three'], assets: [{ id: 'motion', kind: 'video', brief: 'Motion' }] }]));
  mkdirSync(join(f.project, 'assets/motion/source/1:1'), { recursive: true });
  const meta = join(f.project, 'assets/motion/asset.yml');
  const source = join(f.project, 'assets/motion/source/1:1/index.html');
  writeFileSync(meta, 'id: motion\nkind: video\nprovider: hyperframes\naiGenerated: false\naspects: [61]\noutputs: []\n');
  writeFileSync(source, 'original');
  let calls = 0;
  f.io.run = async (_cmd, _args, opts) => {
    calls++;
    writeFileSync(join(opts!.cwd!, 'assets/motion/source/1:1/index.html'), 'revised');
    return '';
  };
  await assert.rejects(revise(['demo/launch', '--note', 'Change motion', '--asset', 'motion'], f.io), /Feedback remains pending[\s\S]*aspects/);
  assert.equal(readFileSync(source, 'utf8'), 'revised');
  assert.equal(loadFeedback(f.project)[0].status, 'pending');
  writeFileSync(meta, 'id: motion\nkind: video\nprovider: hyperframes\naiGenerated: false\naspects: ["1:1"]\noutputs: []\n');
  let renders = 0;
  await createRevise(async args => {
    renders++;
    assert.ok(args.includes('--assets=motion'));
    assert.equal(readFileSync(source, 'utf8'), 'revised');
    return 0;
  })(['demo/launch', '--feedback-only'], f.io);
  assert.equal(calls, 1);
  assert.equal(renders, 1);
  assert.equal(loadFeedback(f.project)[0].status, 'applied');
});

test('retry rerenders a targeted asset even when the agent makes no further edits', async () => {
  const f = fixture(0);
  writeFileSync(join(f.project, 'plan.yml'), stringify([{ platform: 'bluesky', type: 'text', angle: 'Useful', hooks: ['One', 'Two', 'Three'], assets: [{ id: 'logo', kind: 'logo', brief: 'Logo' }] }]));
  mkdirSync(join(f.project, 'assets/logo'), { recursive: true });
  writeFileSync(join(f.project, 'assets/logo/asset.yml'), 'id: logo\nkind: logo\nprovider: template\naiGenerated: false\noutputs: []\n');
  let calls = 0, renders = 0;
  f.io.run = async (_cmd, _args, opts) => {
    if (++calls === 1) writeFileSync(join(opts!.cwd!, 'assets/logo/source.txt'), 'changed');
    return '';
  };
  const reviseWithRender = createRevise(async args => {
    assert.ok(args.includes('--assets=logo'));
    if (++renders === 1) throw new UserError('render failed');
    return 0;
  });
  await assert.rejects(reviseWithRender(['demo/launch', '--note', 'Change logo', '--asset', 'logo'], f.io), /Feedback remains pending/);
  await reviseWithRender(['demo/launch', '--feedback-only'], f.io);
  assert.equal(renders, 2);
  assert.equal(calls, 1);
  assert.equal(loadFeedback(f.project)[0].status, 'applied');
});

test('asset feedback can update alt text in posts referencing the asset', async () => {
  const f = fixture(0);
  writeFileSync(join(f.project, 'plan.yml'), stringify([{ platform: 'bluesky', type: 'text', angle: 'Useful', hooks: ['One', 'Two', 'Three'], assets: [{ id: 'logo', kind: 'logo', brief: 'Logo' }] }]));
  mkdirSync(join(f.project, 'assets/logo'), { recursive: true });
  writeFileSync(join(f.project, 'assets/logo/asset.yml'), 'id: logo\nkind: logo\nprovider: template\naiGenerated: false\noutputs: []\n');
  writeFileSync(join(f.project, 'posts/bluesky.md'), '---\nplatform: bluesky\nevidence: [E1]\nmedia:\n  - { asset: logo, file: assets/logo/out/logo.png, kind: image, alt: Old visual }\n---\nOriginal\n');
  f.io.run = async (_cmd, _args, opts) => {
    const post = join(opts!.cwd!, 'posts/bluesky.md');
    writeFileSync(post, readFileSync(post, 'utf8').replace('Old visual', 'Brighter visual'));
    return '';
  };
  await createRevise(async () => 0)(['demo/launch', '--note', 'Brighten the logo', '--asset', 'logo'], f.io);
  assert.match(readFileSync(join(f.project, 'posts/bluesky.md'), 'utf8'), /Brighter visual/);
  assert.equal(loadFeedback(f.project)[0].status, 'applied');
});

test('video aspect sources, fonts and images are copied for rendering', async () => {
  const f = fixture(0);
  writeFileSync(join(f.project, 'plan.yml'), stringify([{ platform: 'bluesky', type: 'text', angle: 'Useful', hooks: ['One', 'Two', 'Three'], assets: [{ id: 'motion', kind: 'video', brief: 'Motion' }] }]));
  mkdirSync(join(f.project, 'assets/motion/source/1:1'), { recursive: true });
  writeFileSync(join(f.project, 'assets/motion/asset.yml'), 'id: motion\nkind: video\nprovider: hyperframes\naiGenerated: false\naspects: ["1:1"]\noutputs: []\n');
  writeFileSync(join(f.project, 'assets/motion/source/1:1/index.html'), 'original');
  f.io.run = async (_cmd, _args, opts) => {
    const source = join(opts!.cwd!, 'assets/motion/source/1:1');
    assert.equal(readFileSync(join(source, 'index.html'), 'utf8'), 'original');
    writeFileSync(join(source, 'index.html'), 'revised');
    mkdirSync(join(source, 'fonts'));
    mkdirSync(join(source, 'images'));
    writeFileSync(join(source, 'fonts/font.woff2'), 'font bytes');
    writeFileSync(join(source, 'images/hero.png'), 'image bytes');
    return '';
  };
  await createRevise(async args => {
    assert.ok(args.includes('--assets=motion'));
    for (const [path, content] of [['index.html', 'revised'], ['fonts/font.woff2', 'font bytes'], ['images/hero.png', 'image bytes']]) {
      assert.equal(readFileSync(join(f.project, 'assets/motion/source/1:1', path), 'utf8'), content);
    }
    return 0;
  })(['demo/launch', '--note', 'Change motion', '--asset', 'motion'], f.io);
  assert.equal(loadFeedback(f.project)[0].status, 'applied');
});

test('ignored targeted output leaves feedback pending', async () => {
  const f = fixture(0);
  writeFileSync(join(f.project, 'plan.yml'), stringify([{ platform: 'bluesky', type: 'text', angle: 'Useful', hooks: ['One', 'Two', 'Three'], assets: [{ id: 'logo', kind: 'logo', brief: 'Logo' }] }]));
  mkdirSync(join(f.project, 'assets/logo'), { recursive: true });
  writeFileSync(join(f.project, 'assets/logo/asset.yml'), 'id: logo\nkind: logo\nprovider: template\naiGenerated: false\noutputs: []\n');
  f.io.run = async (_cmd, _args, opts) => {
    writeFileSync(join(opts!.cwd!, 'assets/logo/notes.md'), 'ignored');
    return '';
  };
  await assert.rejects(revise(['demo/launch', '--note', 'Change logo', '--asset', 'logo'], f.io), /Feedback remains pending.*assets\/logo\/notes\.md/);
  assert.equal(loadFeedback(f.project)[0].status, 'pending');
});

const hyperframesBin = packageBin('hyperframes', 'hyperframes');
test('asset feedback renders revised per-aspect video sources', {
  skip: !hyperframesBin || !existsSync(hyperframesBin) ? 'HyperFrames is not installed' : !existsSync(chromium.executablePath()) ? 'Playwright Chromium is not installed' : false,
}, async () => {
  const f = fixture(0);
  writeFileSync(join(f.root, 'studio.yml'), 'brand: {name: Demo}\nplatforms: [bluesky]\nagent: {sandbox: off}\nreviewer: {command: null}\nreview: {maxRounds: 0}\n');
  f.io.env.HOME = f.root;
  writeFileSync(join(f.project, 'plan.yml'), stringify([{ platform: 'bluesky', type: 'text', angle: 'Useful', hooks: ['One', 'Two', 'Three'], assets: [{ id: 'motion', kind: 'video', brief: 'Motion' }] }]));
  const asset = join(f.project, 'assets/motion');
  for (const aspect of ['1:1', '9:16']) {
    mkdirSync(join(asset, 'source', aspect), { recursive: true });
    writeFileSync(join(asset, 'source', aspect, 'index.html'), `<html><body>Original ${aspect}</body></html>`);
  }
  const meta = join(asset, 'asset.yml');
  writeFileSync(meta, 'id: motion\nkind: video\nprovider: hyperframes\naiGenerated: false\naspects: ["1:1", "9:16"]\noutputs: []\n');
  const consumed: string[] = [];
  f.io.run = async (cmd, args, opts) => {
    if (cmd === hyperframesBin) {
      const source = readFileSync(join(args[1], 'index.html'), 'utf8');
      consumed.push(source);
      writeFileSync(args[args.indexOf('--output') + 1], source);
    } else if (cmd === 'ffmpeg') {
      const input = args[args.indexOf('-i') + 1];
      writeFileSync(args[args.length - 1], readFileSync(input));
    } else if (cmd === 'ffprobe') {
      const source = readFileSync(args[args.length - 1], 'utf8');
      return JSON.stringify({ streams: [{ codec_type: 'video', width: 1080, height: source.includes('9:16') ? 1920 : 1080 }], format: { duration: '2' } });
    } else {
      for (const aspect of ['1:1', '9:16']) {
        const source = join(opts!.cwd!, 'assets/motion/source', aspect, 'index.html');
        assert.match(readFileSync(source, 'utf8'), /Original/);
        writeFileSync(source, `<html><body>Revised ${aspect}</body></html>`);
      }
    }
    return '';
  };
  await revise(['demo/launch', '--note', 'Change motion', '--asset', 'motion'], f.io);
  assert.deepEqual(consumed, ['<html><body>Revised 1:1</body></html>', '<html><body>Revised 9:16</body></html>']);
  for (const [aspect, label] of [['1:1', '1x1'], ['9:16', '9x16']]) {
    assert.equal(readFileSync(join(asset, 'out', `${label}.mp4`), 'utf8'), `<html><body>Revised ${aspect}</body></html>`);
    assert.ok(parse(readFileSync(meta, 'utf8')).outputs.some((output: { file: string; aspect: string }) => output.file === `out/${label}.mp4` && output.aspect === aspect));
  }
  assert.equal(loadFeedback(f.project)[0].status, 'applied');
});

for (const tape of ['demo.tape', 'source/demo.tape']) {
  test(`asset feedback supplies ${tape} as context`, async () => {
    const f = fixture(0);
    writeFileSync(join(f.project, 'plan.yml'), stringify([{ platform: 'bluesky', type: 'text', angle: 'Useful', hooks: ['One', 'Two', 'Three'], assets: [{ id: 'motion', kind: 'video', brief: 'Motion' }] }]));
    mkdirSync(join(f.project, 'assets/motion/source'), { recursive: true });
    writeFileSync(join(f.project, 'assets/motion/asset.yml'), 'id: motion\nkind: video\nprovider: hyperframes\naiGenerated: false\noutputs: []\n');
    writeFileSync(join(f.project, 'assets/motion', tape), 'Type "hello"\n');
    f.io.run = async (_cmd, _args, opts) => {
      assert.equal(readFileSync(join(opts!.cwd!, 'assets/motion', tape), 'utf8'), 'Type "hello"\n');
      const meta = join(opts!.cwd!, 'assets/motion/asset.yml');
      writeFileSync(meta, `${readFileSync(meta, 'utf8')}description: Updated\n`);
      return '';
    };
    await createRevise(async () => 0)(['demo/launch', '--note', 'Update description', '--asset', 'motion'], f.io);
    assert.match(readFileSync(join(f.project, 'assets/motion/asset.yml'), 'utf8'), /description: Updated/);
    assert.equal(readFileSync(join(f.project, 'assets/motion', tape), 'utf8'), 'Type "hello"\n');
    assert.equal(loadFeedback(f.project)[0].status, 'applied');
  });
}

test('asset feedback can revise a tape source', async () => {
  const f = fixture(0);
  writeFileSync(join(f.project, 'plan.yml'), stringify([{ platform: 'bluesky', type: 'text', angle: 'Useful', hooks: ['One', 'Two', 'Three'], assets: [{ id: 'motion', kind: 'video', brief: 'Motion' }] }]));
  mkdirSync(join(f.project, 'assets/motion/source'), { recursive: true });
  writeFileSync(join(f.project, 'assets/motion/asset.yml'), 'id: motion\nkind: video\nprovider: hyperframes\naiGenerated: false\noutputs: []\n');
  const tape = 'assets/motion/source/demo.tape';
  writeFileSync(join(f.project, tape), 'original');
  f.io.run = async (_cmd, _args, opts) => { writeFileSync(join(opts!.cwd!, tape), 'changed'); return ''; };
  await createRevise(async () => {
    assert.equal(readFileSync(join(f.project, tape), 'utf8'), 'changed');
    return 0;
  })(['demo/launch', '--note', 'Revise motion', '--asset', 'motion'], f.io);
  assert.equal(loadFeedback(f.project)[0].status, 'applied');
});

test('automatic review revisions also receive existing tape context', async () => {
  const f = fixture(1);
  writeFileSync(join(f.project, 'plan.yml'), stringify([{ platform: 'bluesky', type: 'text', angle: 'Useful', hooks: ['One', 'Two', 'Three'], assets: [{ id: 'motion', kind: 'video', brief: 'Motion' }] }]));
  mkdirSync(join(f.project, 'assets/motion/source'), { recursive: true });
  writeFileSync(join(f.project, 'assets/motion/asset.yml'), 'id: motion\nkind: video\nprovider: hyperframes\naiGenerated: false\noutputs: []\n');
  writeFileSync(join(f.project, 'assets/motion/source/demo.tape'), 'Type "hello"\n');
  writeFileSync(join(f.project, 'posts/bluesky.md'), '---\nplatform: bluesky\nevidence: [E1]\nmedia:\n  - { asset: motion, file: assets/motion/out/video.mp4, kind: video, alt: Demo }\n---\nOriginal\n');
  let sawTape = false;
  f.io.run = async (_cmd, _args, opts) => {
    sawTape = readFileSync(join(opts!.cwd!, 'assets/motion/source/demo.tape'), 'utf8') === 'Type "hello"\n';
    throw new Error('stop after inspecting workspace');
  };
  await assert.rejects(revise(['demo/launch'], f.io), /stop after inspecting workspace/);
  assert.equal(sawTape, true);
});

test('stale feedback is rejected without blocking other feedback', async () => {
  const f = fixture(0);
  writeFileSync(join(f.project, 'reviews/bluesky.json'), JSON.stringify({ platform: 'bluesky', verdict: 'pass', gates: [] }));
  writeFileSync(join(f.project, 'feedback.yml'), stringify([{ id: 'old', target: { asset: 'removed' }, note: 'Old', at: new Date().toISOString(), status: 'pending' }]));
  addFeedback(f.project, { platform: 'bluesky' }, 'Current');
  let prompt = '';
  f.io.run = async (_cmd, args, opts) => {
    prompt = args.join('\n');
    writeFileSync(join(opts!.cwd!, 'posts/bluesky.md'), '---\nplatform: bluesky\nevidence: [E1]\nmedia: []\n---\nCurrent revision\n');
    return '';
  };
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
  f.io.run = async (_cmd, args, opts) => {
    const prompt = args.join('\n');
    prompts.push(prompt);
    if (prompt.includes('Adjust logo')) {
      const meta = join(opts!.cwd!, 'assets/logo/asset.yml');
      writeFileSync(meta, `${readFileSync(meta, 'utf8')}description: Revised\n`);
    } else {
      writeFileSync(join(opts!.cwd!, 'posts/bluesky.md'), '---\nplatform: bluesky\nevidence: [E1]\nmedia: []\n---\nRevised post\n');
    }
    return '';
  };
  await createRevise(async () => 0)(['demo/launch', '--feedback-only'], f.io);
  assert.equal(prompts.length, 2);
  assert.match(prompts[0], /Adjust logo/);
  assert.doesNotMatch(prompts[0], /Adjust post/);
  assert.match(prompts[1], /Adjust post/);
  assert.doesNotMatch(prompts[1], /Adjust logo/);
});
