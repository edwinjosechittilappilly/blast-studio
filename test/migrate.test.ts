import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";
import { main } from "../src/cli.ts";
import { projectTotal } from "../src/budget/ledger.ts";
import { loadConfig } from "../src/config.ts";
import { assertNoActiveLocks, migrateProjects, withStudioLock } from "../src/migrate.ts";
import { fakeIO, tempStudio } from "./helpers.ts";

function setup(files: Record<string, string>) {
  const root = tempStudio(files);
  const config = loadConfig(fakeIO({ cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: join(root, "studio.yml") } }));
  const notices: string[] = [];
  return { root, config, notices, run: () => migrateProjects(config, message => notices.push(message)) };
}

test("migration preserves unknown files and is idempotent", () => {
  const { root, run, notices } = setup({ "projects/demo/brief.md": "brief", "projects/demo/assets/a.txt": "asset", "projects/demo/mystery.xyz": "unknown" });
  run(); run();
  const campaign = join(root, "projects/demo/campaigns/demo");
  assert.equal(readFileSync(join(campaign, "brief.md"), "utf8"), "brief");
  assert.equal(readFileSync(join(campaign, "mystery.xyz"), "utf8"), "unknown");
  assert.equal(readFileSync(join(campaign, "assets/a.txt"), "utf8"), "asset");
  assert.equal(notices.length, 1);
  assert.equal(existsSync(join(root, "projects/demo/.bstudio-migration.json")), false);
});

test("migration resumes after an interruption even after brief moved", () => {
  const { root, run } = setup({ "projects/demo/brief.md": "brief", "projects/demo/unknown": "other" });
  const project = join(root, "projects/demo"), destination = join(project, "campaigns/demo");
  mkdirSync(destination, { recursive: true });
  writeFileSync(join(project, ".bstudio-migration.json"), JSON.stringify({ entries: ["brief.md", "unknown"], createdAt: "2026-01-01T00:00:00.000Z" }));
  renameSync(join(project, "brief.md"), join(destination, "brief.md"));
  run();
  assert.equal(readFileSync(join(destination, "unknown"), "utf8"), "other");
  assert.equal(readFileSync(join(destination, "brief.md"), "utf8"), "brief");
});

test("migration resumes a journal that captured a vanished temporary file", () => {
  const { root, run } = setup({ "projects/demo/brief.md": "brief" });
  const project = join(root, "projects/demo");
  writeFileSync(join(project, ".bstudio-migration.json"), JSON.stringify({
    entries: ["brief.md", ".bstudio-journal-abandoned.tmp"], createdAt: "2026-01-01T00:00:00.000Z",
  }));
  assert.equal(run().size, 0);
  assert.equal(readFileSync(join(project, "campaigns/demo/brief.md"), "utf8"), "brief");
});

test("migration recovers an interrupted metadata write", () => {
  const { root, run } = setup({ "projects/demo/brief.md": "brief" });
  const project = join(root, "projects/demo"), destination = join(project, "campaigns/demo");
  mkdirSync(destination, { recursive: true });
  writeFileSync(join(project, ".bstudio-migration.json"), JSON.stringify({ entries: ["brief.md"], createdAt: "2026-01-01T00:00:00.000Z" }));
  renameSync(join(project, "brief.md"), join(destination, "brief.md"));
  writeFileSync(join(project, ".bstudio-project.yml.migration"), "partially written");
  run();
  assert.match(readFileSync(join(project, "project.yml"), "utf8"), /name: demo/);
  assert.equal(existsSync(join(project, ".bstudio-project.yml.migration")), false);
});

test("migration refuses conflicts without overwriting either version", () => {
  const { root, run } = setup({ "projects/demo/brief.md": "source", "projects/demo/campaigns/demo/brief.md": "destination" });
  assert.match(run().get("demo")?.message ?? "", /Migration conflict/);
  assert.equal(readFileSync(join(root, "projects/demo/brief.md"), "utf8"), "source");
  assert.equal(readFileSync(join(root, "projects/demo/campaigns/demo/brief.md"), "utf8"), "destination");
});

test("an interrupted migration preserves both sides of a later conflict", () => {
  const { root, run } = setup({ "projects/demo/brief.md": "source", "projects/demo/campaigns/demo/brief.md": "destination" });
  const dir = join(root, "projects/demo");
  writeFileSync(join(dir, ".bstudio-migration.json"), JSON.stringify({ entries: ["brief.md"], createdAt: "2026-01-01T00:00:00.000Z" }));
  assert.match(run().get("demo")?.message ?? "", /Migration conflict/);
  assert.equal(readFileSync(join(dir, "brief.md"), "utf8"), "source");
  assert.equal(readFileSync(join(dir, "campaigns/demo/brief.md"), "utf8"), "destination");
  assert.ok(existsSync(join(dir, ".bstudio-migration.json")));
});

test("CLI startup migrates before project listing", async () => {
  const { root } = setup({ "projects/demo/brief.md": "brief" });
  const io = fakeIO({ cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: join(root, "studio.yml") } });
  assert.equal(await main(["project", "list"], io), 0);
  assert.match(io.stderr.join("\n"), /Migrated demo to demo\/demo/);
  assert.doesNotMatch(io.stdout.join("\n"), /Migrated/);
  assert.match(io.stdout.join("\n"), /demo\s+1/);
});

test("CLI permits unrelated commands while blocking a project with a migration conflict", async () => {
  const { root } = setup({
    "projects/a/brief.md": "source",
    "projects/a/campaigns/a/brief.md": "destination",
    "projects/b/brief.md": "good",
  });
  const options = { cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: join(root, "studio.yml") } };
  const list = fakeIO(options);
  assert.equal(await main(["project", "list"], list), 0);
  assert.match(list.stderr.join("\n"), /migration.*projects\/a/i);
  assert.match(list.stdout.join("\n"), /b\s+1/);
  const history = fakeIO(options);
  assert.equal(await main(["history", "a/a"], history), 1);
  assert.match(history.stderr.join("\n"), /migration.*projects\/a/i);
});

test("migrated campaign retains historical ledger attribution", () => {
  const { root, run } = setup({
    "projects/demo/brief.md": "brief",
    "ledger.jsonl": JSON.stringify({ id: "old", type: "agent", at: "2026-01-01", usd: 3, projectSlug: "demo", provider: "agent", model: "test" }) + "\n",
  });
  run();
  assert.equal(projectTotal(root, "demo/demo"), 3);
  assert.equal(projectTotal(root, "demo/other"), 0);
});

test("migration reports a failed project and continues with other projects", () => {
  const { root, run, notices } = setup({
    "projects/a/brief.md": "source",
    "projects/a/campaigns/a/brief.md": "destination",
    "projects/b/brief.md": "good",
  });
  const failures = run();
  assert.deepEqual([...failures.keys()], ["a"]);
  assert.match(failures.get("a")!.message, /migration.*projects\/a/i);
  assert.match(notices.join("\n"), /migration.*projects\/a/i);
  assert.equal(readFileSync(join(root, "projects/b/campaigns/b/brief.md"), "utf8"), "good");
  assert.equal(readFileSync(join(root, "projects/a/brief.md"), "utf8"), "source");
});

test("migration skips projects with unresolved rename recovery", () => {
  const { root, config } = setup({ "projects/a/brief.md": "a", "projects/b/brief.md": "b" });
  assert.equal(migrateProjects(config, () => {}, new Set(["*"])).size, 0);
  assert.equal(existsSync(join(root, "projects/b/brief.md")), true);
  assert.equal(migrateProjects(config, () => {}, new Set(["a"])).size, 0);
  assert.equal(readFileSync(join(root, "projects/a/brief.md"), "utf8"), "a");
  assert.equal(readFileSync(join(root, "projects/b/campaigns/b/brief.md"), "utf8"), "b");
});

test("migration warns about invalid and symlinked candidates without following them", () => {
  const { root, run, notices } = setup({
    "projects/Old_Stuff/brief.md": "old",
    "projects/good/brief.md": "good",
    "external/brief.md": "external",
  });
  symlinkSync(join(root, "external"), join(root, "projects/link"));
  assert.equal(run().size, 0);
  assert.match(notices.join("\n"), /migration.*projects\/Old_Stuff/i);
  assert.match(notices.join("\n"), /migration.*projects\/link/i);
  assert.equal(readFileSync(join(root, "external/brief.md"), "utf8"), "external");
  assert.equal(readFileSync(join(root, "projects/good/campaigns/good/brief.md"), "utf8"), "good");
});

test("migration excludes abandoned migration staging files from its snapshot", () => {
  const { root, run } = setup({
    "projects/demo/brief.md": "brief",
    "projects/demo/.bstudio-journal-abandoned.tmp": "partial",
    "projects/demo/.bstudio-project.yml.migration": "partial",
  });
  assert.equal(run().size, 0);
  assert.equal(existsSync(join(root, "projects/demo/campaigns/demo/.bstudio-journal-abandoned.tmp")), false);
  assert.equal(existsSync(join(root, "projects/demo/campaigns/demo/.bstudio-project.yml.migration")), false);
  assert.equal(existsSync(join(root, "projects/demo/.bstudio-project.yml.migration")), false);
  assert.equal(readFileSync(join(root, "projects/demo/campaigns/demo/brief.md"), "utf8"), "brief");
});

test("live job and revision locks prevent migration while unrelated projects continue", () => {
  for (const [name, content] of [
    [".bstudio-job.lock", JSON.stringify({ id: "running", pid: process.pid })],
    [".revise.lock", String(process.pid)],
  ]) {
    const { root, run } = setup({ "projects/a/brief.md": "source", "projects/b/brief.md": "other" });
    writeFileSync(join(root, "projects/a", name), content);
    const failures = run();
    assert.match(failures.get("a")?.message ?? "", /stop running jobs first/i);
    assert.equal(failures.size, 1);
    assert.equal(readFileSync(join(root, "projects/a/brief.md"), "utf8"), "source");
    assert.equal(readFileSync(join(root, "projects/b/campaigns/b/brief.md"), "utf8"), "other");
    assert.throws(() => assertNoActiveLocks(join(root, "projects/a")), /stop running jobs first/i);
  }
});

test("dead job and revision locks do not prevent migration", () => {
  for (const [name, content] of [
    [".bstudio-job.lock", JSON.stringify({ id: "finished", pid: 2147483647 })],
    [".revise.lock", "2147483647"],
  ]) {
    const { root, run } = setup({ "projects/demo/brief.md": "brief" });
    writeFileSync(join(root, "projects/demo", name), content);
    assert.equal(run().size, 0);
    assert.equal(readFileSync(join(root, "projects/demo/campaigns/demo/brief.md"), "utf8"), "brief");
  }
});

test("studio lock recovers a dead owner", () => {
  const { root } = setup({ "projects/demo/brief.md": "brief" });
  writeFileSync(join(root, "projects/.bstudio-studio.lock"), JSON.stringify({ pid: 2147483647 }));
  assert.equal(withStudioLock(root, () => "acquired"), "acquired");
  assert.equal(existsSync(join(root, "projects/.bstudio-studio.lock")), false);
});

test("studio lock recovers a reused PID without disturbing the current process", () => {
  const { root } = setup({ "projects/demo/brief.md": "brief" });
  const path = join(root, "projects/.bstudio-studio.lock");
  const owner = withStudioLock(root, () => JSON.parse(readFileSync(path, "utf8")));
  writeFileSync(path, JSON.stringify({ ...owner, processStarted: `${owner.processStarted}-old` }));
  assert.equal(withStudioLock(root, () => "acquired"), "acquired");
  assert.equal(existsSync(path), false);
});

test("studio lock times out without removing a live holder", t => {
  const { root } = setup({ "projects/demo/brief.md": "brief" });
  const path = join(root, "projects/.bstudio-studio.lock");
  withStudioLock(root, () => {
    const owner = readFileSync(path, "utf8");
    assert.equal(JSON.parse(owner).pid, process.pid);
    assert.equal(typeof JSON.parse(owner).processStarted, "string");
    let now = 0;
    t.mock.method(performance, "now", () => { now += 30000; return now; });
    assert.throws(() => withStudioLock(root, () => assert.fail("live lock was acquired")), error => {
      assert.match(String(error), /timed out/i);
      assert.ok(String(error).includes(path));
      assert.match(String(error), /stop|exit/i);
      assert.match(String(error), /manually|remove/i);
      return true;
    });
    assert.equal(readFileSync(path, "utf8"), owner);
  });
});

test("studio lock is released when its operation fails", () => {
  const { root } = setup({ "projects/demo/brief.md": "brief" });
  assert.throws(() => withStudioLock(root, () => { throw new Error("operation failed"); }), /operation failed/);
  assert.equal(withStudioLock(root, () => "reacquired"), "reacquired");
});

test("four simultaneous processes migrate successfully", async () => {
  const { root } = setup({
    "projects/a/brief.md": "a",
    "projects/a/unknown": "unknown",
    "projects/b/brief.md": "b",
  });
  const migrate = new URL("../src/migrate.ts", import.meta.url).href;
  const config = new URL("../src/config.ts", import.meta.url).href;
  const helpers = new URL("./helpers.ts", import.meta.url).href;
  const script = `
    import { migrateProjects } from ${JSON.stringify(migrate)};
    import { loadConfig } from ${JSON.stringify(config)};
    import { fakeIO } from ${JSON.stringify(helpers)};
    const root = process.argv[1];
    const config = loadConfig(fakeIO({ cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: root + "/studio.yml" } }));
    const failures = migrateProjects(config, message => console.error(message));
    if (failures.size) { for (const error of failures.values()) console.error(error); process.exitCode = 1; }
  `;
  const results = await Promise.all(Array.from({ length: 4 }, () => {
    const { promise, resolve, reject } = Promise.withResolvers<{ code: number | null; output: string }>();
    const child = spawn(process.execPath, ["--input-type=module", "-e", script, root]);
    let output = "";
    child.stdout.on("data", chunk => { output += chunk; });
    child.stderr.on("data", chunk => { output += chunk; });
    child.on("error", reject);
    child.on("close", code => resolve({ code, output }));
    return promise;
  }));
  for (const result of results) assert.equal(result.code, 0, result.output);
  assert.equal(readFileSync(join(root, "projects/a/campaigns/a/unknown"), "utf8"), "unknown");
  assert.equal(readFileSync(join(root, "projects/b/campaigns/b/brief.md"), "utf8"), "b");
  assert.deepEqual(readdirSync(join(root, "projects/a/campaigns/a")).sort(), ["brief.md", "unknown"]);
});
