import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { campaignDirectory, cancelJob, findJob, jobLog, listJobs } from '../src/jobs/runner.ts';

for (const layout of ['flat without brief', 'flat with brief', 'migrated'] as const) {
  test(`legacy job records remain accessible in ${layout}`, () => {
    const root = mkdtempSync(join(tmpdir(), 'bstudio-legacy-job-'));
    const child = spawn(process.execPath, ['-e', 'process.stdin.resume()'], { stdio: ['pipe', 'ignore', 'ignore'] });
    try {
      const campaign = join(root, 'projects', 'demo', ...(layout === 'migrated' ? ['campaigns', 'demo'] : []));
      const dir = join(campaign, 'logs', 'jobs');
      mkdirSync(dir, { recursive: true });
      if (layout === 'flat with brief') writeFileSync(join(campaign, 'brief.md'), '# Brief\n');
      const id = randomUUID(), now = new Date().toISOString();
      const started = execFileSync('ps', ['-o', 'lstart=', '-p', String(child.pid)], { encoding: 'utf8' }).trim();
      const record = { id, operation: 'brief', campaign: 'demo', state: 'running', createdAt: now, updatedAt: now, pid: child.pid, processStarted: started, command: 'bstudio brief demo' };
      writeFileSync(join(dir, `${id}.json`), JSON.stringify(record));
      writeFileSync(join(dir, `${id}.log`), 'legacy output\n');
      assert.deepEqual(listJobs(root).map(job => job.id), [id]);
      assert.equal(findJob(root, id).campaign, 'demo');
      assert.equal(jobLog(root, id), 'legacy output\n');
      assert.equal(cancelJob(root, id).cancelRequested, true);
      assert.equal(JSON.parse(readFileSync(join(dir, `${id}.json`), 'utf8')).cancelRequested, true);
    } finally {
      child.kill();
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test('campaign job paths reject projects with incomplete migration', () => {
  const root = mkdtempSync(join(tmpdir(), 'bstudio-legacy-job-'));
  try {
    const project = join(root, 'projects', 'demo');
    mkdirSync(join(project, 'campaigns', 'demo'), { recursive: true });
    writeFileSync(join(project, 'project.yml'), 'name: demo\ncreatedAt: now\n');
    for (const marker of ['brief.md', '.bstudio-migration.json']) {
      writeFileSync(join(project, marker), '');
      assert.throws(() => campaignDirectory(root, 'demo/demo'), /migration is incomplete/);
      assert.throws(() => campaignDirectory(root, 'demo/new', true), /migration is incomplete/);
      rmSync(join(project, marker));
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('legacy job discovery ignores symlinked job directories and logs', () => {
  const root = mkdtempSync(join(tmpdir(), 'bstudio-legacy-job-'));
  const outside = mkdtempSync(join(tmpdir(), 'bstudio-job-outside-'));
  try {
    const id = randomUUID(), now = new Date().toISOString();
    writeFileSync(join(outside, `${id}.json`), JSON.stringify({ id, state: 'succeeded', createdAt: now, updatedAt: now, command: 'test' }));
    mkdirSync(join(root, 'projects', 'demo', 'logs'), { recursive: true });
    symlinkSync(outside, join(root, 'projects', 'demo', 'logs', 'jobs'));
    assert.deepEqual(listJobs(root), []);
    rmSync(join(root, 'projects', 'demo', 'logs', 'jobs'));
    const dir = join(root, 'projects', 'demo', 'logs', 'jobs');
    mkdirSync(dir);
    writeFileSync(join(dir, `${id}.json`), readFileSync(join(outside, `${id}.json`)));
    writeFileSync(join(outside, `${id}.log`), 'secret');
    symlinkSync(join(outside, `${id}.log`), join(dir, `${id}.log`));
    assert.throws(() => jobLog(root, id), /Unsafe job log/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
