import assert from "node:assert/strict";
import { mkdirSync, readFileSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parseBrief } from "../src/brief.ts";
import { listProjects, parseCampaignRef, readProject, writeProject } from "../src/campaigns.ts";
import { campaignDir, loadConfig } from "../src/config.ts";
import { run as project } from "../src/commands/project.ts";
import { run as brief } from "../src/commands/brief.ts";
import { run as status } from "../src/commands/status.ts";
import { run as library } from "../src/commands/library.ts";
import { run as budget } from "../src/commands/budget.ts";
import { loadLibrary } from "../src/library.ts";
import { fakeIO, tempStudio } from "./helpers.ts";

function setup() {
  const root = tempStudio();
  const io = fakeIO({ cwd: root, env: { HOME: root, BSTUDIO_HOME: root, BSTUDIO_CONFIG: join(root, "studio.yml") },
    run: async (_cmd, args) => args[0] === "api" ? "Shared README" : '{"nameWithOwner":"org/repo"}',
    fetch: async () => new Response("URL evidence", { headers: { "content-type": "text/plain" } }),
  });
  return { root, io, config: loadConfig(io) };
}

test("campaign addresses validate each component and reject escaping symlinks", () => {
  const { root, config } = setup();
  assert.deepEqual(parseCampaignRef("acme/launch"), { project: "acme", campaign: "launch" });
  for (const address of ["acme", "a/b/c", "../x", "Acme/x", "a//b", "a/-b"]) assert.throws(() => parseCampaignRef(address));
  mkdirSync(join(root, "projects"));
  const outside = tempStudio();
  symlinkSync(outside, join(root, "projects", "acme"));
  assert.throws(() => campaignDir(config, "acme/launch"), /escapes/);
  mkdirSync(join(root, "projects", "safe"));
  symlinkSync(outside, join(root, "projects", "safe", "campaigns"));
  assert.throws(() => campaignDir(config, "safe/launch"), /escapes/);
});


test("project metadata preserves overrides and rejects invalid links", () => {
  const { root, config } = setup();
  writeProject(config, "brand", { name: "Brand", createdAt: "2026-01-01", brand: { voice: ["clear"] }, links: { home: "https://example.com" } }, "wx");
  assert.deepEqual(readProject(config, "brand").brand, { voice: ["clear"] });
  assert.deepEqual(readProject(config, "brand").links, { home: "https://example.com" });
  writeFileSync(join(root, "projects/brand/project.yml"), "name: Brand\ncreatedAt: 2026-01-01\nlinks: {home: 123}\n");
  assert.throws(() => readProject(config, "brand"), /Invalid project links/);
});
test("project commands persist metadata and share fetched evidence across campaigns", async () => {
  const { root, io, config } = setup();
  await project(["new", "acme", "--repo=org/repo", "--note", "Shared note", "--url", "https://example.com/"], io);
  await project(["new", "other"], io);
  assert.equal(readProject(config, "acme").links?.repository, "https://github.com/org/repo");
  await brief(["acme/launch", "--note", "Campaign note"], io);
  await brief(["acme/followup"], io);
  const text = readFileSync(join(root, "projects/acme/campaigns/launch/brief.md"), "utf8");
  assert.match(text, /Shared README/);
  assert.match(text, /Shared note/);
  assert.match(text, /Campaign note/);
  assert.match(text, /https:\/\/example.com/);
  assert.match(text, /\[E5\]/);
  assert.deepEqual(listProjects(config).map(p => [p.project, p.campaigns]), [["acme", 2], ["other", 0]]);
  await project(["list"], io);
  assert.match(io.text(), /acme\s+2/);
  await assert.rejects(project(["new", "acme"], io), /already exists/);
});

test("forcing a brief does not duplicate shared repository and URL evidence", async () => {
  const { root, io } = setup();
  await project(["new", "acme", "--repo", "org/repo", "--url", "https://example.com/"], io);
  await brief(["acme/launch", "--idea", "Initial idea"], io);
  await brief(["acme/launch", "--force", "--repo", "org/repo", "--url", "https://example.com/", "--url", "https://example.org/", "--note", "Campaign note"], io);
  const text = readFileSync(join(root, "projects/acme/campaigns/launch/brief.md"), "utf8");
  assert.deepEqual(
    parseBrief(text).map(section => section.title),
    ["URL", "Repository", "Repository README", "Note", "URL"],
  );
  assert.match(text, /Source: https:\/\/example\.org\//);
  assert.match(text, /Campaign note/);
});

test("shared evidence retains provenance, status and one outer untrusted fence", async () => {
  const { root, io } = setup();
  await project(["new", "acme"], io);
  const evidence = join(root, "projects/acme/evidence");
  mkdirSync(evidence, { recursive: true });
  writeFileSync(join(evidence, "sources.md"), "## [E7] Origin\n\nstatus: shipped\n\nSource: https://example.com/origin\n\n````untrusted\nEvidence with ``` code\n````\n");
  await brief(["acme/launch"], io);
  const text = readFileSync(join(root, "projects/acme/campaigns/launch/brief.md"), "utf8");
  assert.match(text, /status: shipped\n\nSource: https:\/\/example\.com\/origin\n\n````untrusted\nEvidence with ``` code\n````/);
  assert.equal((text.match(/untrusted/g) ?? []).length, 1);
  assert.doesNotMatch(text, /sources\.md/);
  await brief(["-h"], io);
  assert.match(io.text(), /usage: bstudio brief/);
});

test("project listing counts valid campaigns and ignores deep snapshot mtimes", () => {
  const { root, config } = setup();
  writeProject(config, "acme", { name: "Acme", createdAt: "2026-01-01" });
  const campaign = join(root, "projects/acme/campaigns/launch");
  mkdirSync(join(campaign, "history/snapshot"), { recursive: true });
  mkdirSync(join(root, "projects/acme/campaigns/Bad_Name"), { recursive: true });
  writeFileSync(join(campaign, "brief.md"), "brief");
  const old = new Date("2020-01-01T00:00:00Z"), newest = new Date("2021-01-01T00:00:00Z"), deep = new Date("2030-01-01T00:00:00Z");
  writeFileSync(join(campaign, "history/snapshot/file"), "snapshot");
  for (const path of [join(root, "projects/acme"), join(root, "projects/acme/project.yml"), join(root, "projects/acme/campaigns"), campaign, join(campaign, "history")]) utimesSync(path, old, old);
  utimesSync(join(campaign, "brief.md"), newest, newest);
  utimesSync(join(campaign, "history/snapshot/file"), deep, deep);
  assert.deepEqual(listProjects(config).map(p => [p.campaigns, p.updatedAt.toISOString()]), [[1, newest.toISOString()]]);
});

test("status and library group campaigns by project and budget labels campaign cap", async () => {
  const { io } = setup();
  for (const name of ["zeta", "alpha"]) {
    await project(["new", name], io);
    await brief([`${name}/launch`, "--idea", name], io);
  }
  io.stdout.length = 0;
  await status([], io);
  assert.ok(io.text().indexOf("Project: alpha") < io.text().indexOf("Project: zeta"));
  io.stdout.length = 0;
  await library([], io);
  assert.match(io.text(), /^PROJECT\tCAMPAIGN\t/m);
  assert.match(io.text(), /alpha\tlaunch/);
  assert.ok(io.text().indexOf("alpha\tlaunch") < io.text().indexOf("zeta\tlaunch"));
  io.stdout.length = 0;
  await budget(["show"], io);
  assert.match(io.text(), /Per-campaign cap:/);
});

test("library skips incomplete migrations while direct campaign access reports them", () => {
  const { root, config } = setup();
  for (const name of ["healthy", "legacy", "journal"]) {
    mkdirSync(join(root, "projects", name, "campaigns", "launch"), { recursive: true });
  }
  writeFileSync(join(root, "projects/legacy/brief.md"), "legacy");
  writeFileSync(join(root, "projects/journal/.bstudio-migration.json"), "{}");
  assert.deepEqual(loadLibrary(config).map(entry => entry.slug), ["healthy/launch"]);
  for (const name of ["legacy", "journal"]) assert.throws(() => campaignDir(config, `${name}/launch`), /migration is incomplete/);
});
