import assert from "node:assert/strict";
import { mkdirSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { listProjects, parseCampaignRef, readProject } from "../src/campaigns.ts";
import { campaignDir, loadConfig } from "../src/config.ts";
import { run as project } from "../src/commands/project.ts";
import { run as brief } from "../src/commands/brief.ts";
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
