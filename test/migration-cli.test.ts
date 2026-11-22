import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { main } from '../src/cli.ts';
import { fakeIO, tempStudio } from './helpers.ts';

test('migration errors warn without blocking unrelated projects and commands', async () => {
  const root = tempStudio({
    'projects/bad/brief.md': 'legacy',
    'projects/bad/project.yml': 'name: bad\ncreatedAt: 2026-01-01\n',
    'projects/bad/campaigns/bad/brief.md': 'destination',
    'projects/good/brief.md': 'legacy',
  });
  const io = fakeIO({ cwd: root, env: { HOME: root, BSTUDIO_HOME: root, BSTUDIO_CONFIG: join(root, 'studio.yml') } });
  assert.equal(await main(['project', 'list'], io), 0);
  assert.match(io.stderr.join('\n'), /migration.*bad/i);
  assert.ok(existsSync(join(root, 'projects/good/campaigns/good/brief.md')));
  assert.equal(await main(['brief', 'bad/bad', '--idea', 'test'], io), 1);
  assert.match(io.stderr.at(-1)!, /migration.*bad/i);
  assert.equal(await main(['project', 'list'], io), 0);
});
