import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { main } from "../src/cli.ts";
import { projectTotal } from "../src/budget/ledger.ts";
import { loadConfig } from "../src/config.ts";
import { migrateProjects } from "../src/migrate.ts";
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
  assert.throws(run, /Migration conflict/);
  assert.equal(readFileSync(join(root, "projects/demo/brief.md"), "utf8"), "source");
  assert.equal(readFileSync(join(root, "projects/demo/campaigns/demo/brief.md"), "utf8"), "destination");
});

test("an interrupted migration preserves both sides of a later conflict", () => {
  const { root, run } = setup({ "projects/demo/brief.md": "source", "projects/demo/campaigns/demo/brief.md": "destination" });
  const dir = join(root, "projects/demo");
  writeFileSync(join(dir, ".bstudio-migration.json"), JSON.stringify({ entries: ["brief.md"], createdAt: "2026-01-01T00:00:00.000Z" }));
  assert.throws(run, /Migration conflict/);
  assert.equal(readFileSync(join(dir, "brief.md"), "utf8"), "source");
  assert.equal(readFileSync(join(dir, "campaigns/demo/brief.md"), "utf8"), "destination");
  assert.ok(existsSync(join(dir, ".bstudio-migration.json")));
});

test("CLI startup migrates before project listing", async () => {
  const { root } = setup({ "projects/demo/brief.md": "brief" });
  const io = fakeIO({ cwd: root, env: { BSTUDIO_HOME: root, BSTUDIO_CONFIG: join(root, "studio.yml") } });
  assert.equal(await main(["project", "list"], io), 0);
  assert.match(io.text(), /Migrated demo to demo\/demo/);
  assert.match(io.text(), /demo\s+1/);
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
