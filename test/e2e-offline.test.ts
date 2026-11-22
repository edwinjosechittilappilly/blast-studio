import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { strFromU8, unzipSync } from 'fflate';
import { stringify } from 'yaml';
import { run as brief } from '../src/commands/brief.ts';
import { run as plan } from '../src/commands/plan.ts';
import { run as make } from '../src/commands/make.ts';
import { run as render } from '../src/commands/render.ts';
import { run as review } from '../src/commands/review.ts';
import { run as accept } from '../src/commands/accept.ts';
import { run as exportCommand } from '../src/commands/export.ts';
import { loadPosts } from '../src/posts.ts';
import { reviewHash } from '../src/review-hash.ts';
import { fakeIO, tempStudio } from './helpers.ts';

test('slow: offline idea becomes a reviewed campaign with a still and manual handoff', { timeout: 60_000 }, async () => {
  const root = tempStudio({ 'studio.yml': 'brand: {name: Demo}\nplatforms: [bluesky, instagram]\nreviewer: {command: null}\n', 'projects/demo/project.yml': 'name: Demo\ncreatedAt: 2025-01-01T00:00:00Z\n' });
  const project = join(root, 'projects/demo/campaigns/launch'); let calls = 0;
  const io = fakeIO({ cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: join(root, 'studio.yml') }, run: async (_cmd, _args, opts) => {
    calls++; const dir = opts!.cwd!;
    if (calls === 1) {
      writeFileSync(join(dir, 'plan.yml'), stringify(['bluesky', 'instagram'].map(platform => ({ platform, type: 'image', angle: 'A useful idea', hooks: ['First', 'Second', 'Third'], assets: [{ id: 'card', kind: 'card', brief: 'A useful idea' }] }))));
    } else {
      assert.equal(calls, 2);
      mkdirSync(join(dir, 'posts'), { recursive: true }); mkdirSync(join(dir, 'assets/card'), { recursive: true });
      for (const platform of ['bluesky', 'instagram']) writeFileSync(join(dir, `posts/${platform}.md`), `---\nplatform: ${platform}\ntitle: A useful idea\nevidence: [E1]\nmedia:\n  - asset: card\n    file: assets/card/out/image.png\n    alt: A useful idea\n    kind: image\n---\nA useful idea.\n`);
      writeFileSync(join(dir, 'assets/card/asset.yml'), stringify({ id: 'card', kind: 'card', provider: 'template', outputs: [], license: 'OFL', aiGenerated: false, size: { width: 400, height: 400 } }));
      writeFileSync(join(dir, 'assets/card/source.html'), '<html><body style="margin:40px;background:white;color:black;font:32px sans-serif"><p>A useful idea</p></body></html>');
    }
    return '';
  } });
  assert.equal(await brief(['demo/launch', '--idea', 'A useful idea.'], io), 0);
  assert.equal(await plan(['demo/launch'], io), 0);
  assert.equal(await make(['demo/launch'], io), 0);
  assert.equal(await render(['demo/launch'], io), 0);
  assert.equal(await review(['demo/launch'], io), 0);
  assert.equal(calls, 2);
  for (const path of ['brief.md', 'plan.yml', 'posts/bluesky.md', 'assets/card/source.html', 'assets/card/out/image.png', 'review.md']) assert.ok(existsSync(join(project, path)), path);
  const posts = loadPosts(project);
  for (const platform of ['bluesky', 'instagram'] as const) {
    const result = JSON.parse(readFileSync(join(project, `reviews/${platform}.json`), 'utf8'));
    assert.ok(result.gates.length >= 6);
    assert.ok(result.gates.every((gate: { pass: boolean }) => gate.pass), JSON.stringify(result.gates));
    const post = posts.get(platform)!;
    assert.equal(result.postHash, reviewHash({ ...post, media: post.media.map(m => ({ path: m.file, alt: m.alt })) }));
    assert.equal(await accept(['demo/launch', platform, '--reason', 'Reviewed offline'], io), 0);
  }
  assert.equal(await exportCommand(['demo/launch'], io), 0);
  const entries = unzipSync(readFileSync(join(project, 'export/launch.campaign.zip')));
  assert.ok(entries['handoff/instagram/post.md']); assert.ok(entries['handoff/instagram/README.md']);
  const manifest: { manual: { platform: string }[]; destinations: { review: { reviewHash: string } }[] } = JSON.parse(strFromU8(entries['campaign.json']));
  const ajv = new Ajv2020({ allErrors: true });
  ajv.addFormat('date-time', { type: 'string', validate: (s: string) => Number.isFinite(Date.parse(s)) });
  const validate = ajv.compile<typeof manifest>(JSON.parse(readFileSync(new URL('../schemas/campaign.v2.json', import.meta.url), 'utf8')));
  assert.ok(validate(manifest), ajv.errorsText(validate.errors));
  assert.equal(manifest.manual[0].platform, 'instagram');
  assert.equal(manifest.destinations[0].review.reviewHash, JSON.parse(readFileSync(join(project, 'reviews/bluesky.json'), 'utf8')).postHash);
});
