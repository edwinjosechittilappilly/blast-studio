import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { confirm } from '../src/commands/accept.ts';
import { run as render } from '../src/commands/render.ts';
import { closeBrowser } from '../src/render/stills.ts';
import { sourceHash } from '../src/render/source-hash.ts';
import { fakeIO, tempStudio } from './helpers.ts';

after(async () => { await closeBrowser(); });

test('confirming rights and changing alt text do not make a rendered asset stale', { timeout: 20000 }, async () => {
  const root = tempStudio(), project = join(root, 'projects/demo/campaigns/launch');
  const asset = join(project, 'assets/card'), metadataPath = join(asset, 'asset.yml');
  mkdirSync(asset, { recursive: true });
  writeFileSync(join(project, 'plan.yml'), stringify([{ platform: 'x', type: 'image', angle: 'Explain', hooks: ['One', 'Two', 'Three'], assets: [{ id: 'card', kind: 'card', brief: 'Explain' }] }]));
  writeFileSync(metadataPath, stringify({ id: 'card', kind: 'card', provider: 'template', outputs: [], license: null, aiGenerated: false, size: { width: 160, height: 160 } }));
  writeFileSync(join(asset, 'source.html'), '<html><body>First</body></html>');
  const io = fakeIO({ cwd: root, env: { BSTUDIO_CONFIG: join(root, 'studio.yml'), BSTUDIO_HOME: root } });

  await render(['demo/launch'], io);
  const rendered = parse(readFileSync(metadataPath, 'utf8'));
  assert.ok(rendered.outputs.length > 0);
  const recorded = rendered.outputs[0].sourceHash;
  assert.match(recorded, /^[a-f0-9]{64}$/);
  assert.equal(sourceHash(asset), recorded);

  await confirm(['demo/launch', 'card', '--license', 'CC0'], io);
  assert.equal(parse(readFileSync(metadataPath, 'utf8')).license, 'CC0');
  assert.equal(sourceHash(asset), recorded);
  await confirm(['demo/launch', 'card', '--trademark-checked'], io);
  const confirmed = parse(readFileSync(metadataPath, 'utf8'));
  assert.equal(confirmed.trademarkChecked, true);
  assert.equal(sourceHash(asset), recorded);
  confirmed.alt = 'A card describing the update';
  writeFileSync(metadataPath, stringify(confirmed));
  assert.equal(sourceHash(asset), recorded);

  writeFileSync(join(asset, 'source.html'), '<html><body>Changed</body></html>');
  assert.notEqual(sourceHash(asset), recorded);
});
