import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { loadConfig } from '../src/config.ts';
import { monthToDate } from '../src/budget/ledger.ts';
import { runReviewer } from '../src/review/reviewer.ts';
import { fakeIO, tempStudio } from './helpers.ts';

test('API reviewer parses a billed JSON wrapper', async () => {
  const root = tempStudio();
  const result = JSON.stringify({ scores: [{ criterion: 'a', score: 2, evidence: 'quote', fix: 'none' }] });
  const io = fakeIO({ cwd: root, env: { BSTUDIO_CONFIG: join(root, 'studio.yml'), BSTUDIO_HOME: root }, run: async () => JSON.stringify({ result, total_cost_usd: 0.2, usage: { tokens: 3 } }) });
  const config = loadConfig(io); config.budget.monthlyUsd = 1;
  config.reviewer = { command: ['fake'], timeoutSeconds: 1, billing: 'api', maxUsdPerRun: 0.5 };
  const scores = await runReviewer({ config, io, post: { platform: 'x', path: 'x.md', body: 'A clear update.', media: [], evidence: [] }, rubric: [{ id: 'a', question: 'a' }], brief: '' });
  assert.equal(scores[0].score, 2);
  assert.equal(monthToDate(root), 0.2);
});
