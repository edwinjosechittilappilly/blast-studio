import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, readFileSync, readlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { main } from "../src/cli.ts";
import { loadConfig, projectDir, writeConfigField } from "../src/config.ts";
import { loadEnv } from "../src/env.ts";
import { installSkills } from "../src/commands/install-skills.ts";
import { fakeIO, tempStudio } from "./helpers.ts";

test("init writes private defaults once and resolves overrides independently of cwd", async () => {
  const home = tempStudio();
  const cwd = join(home, "elsewhere"); mkdirSync(cwd);
  const file = join(home, "settings", "studio.yml"), root = join(home, "my-studio");
  const io = fakeIO({ cwd, env: { HOME: home, BSTUDIO_CONFIG: file, BSTUDIO_HOME: root } });
  assert.equal(await main(["init"], io), 0);
  const config = loadConfig(io);
  assert.equal(config.root, root);
  assert.deepEqual(config.platforms, ["devto", "linkedin", "x", "bluesky", "mastodon", "hn", "reddit", "github-discussion"]);
  assert.deepEqual(config.budget, { monthlyUsd: 0, perProjectUsd: 0 });
  assert.equal(config.providers.allowUpload, false);
  assert.deepEqual(config.reviewer.command, ["omp", "-p", "--model", "@review"]);
  assert.ok(existsSync(join(root, "projects")));
  assert.equal(projectDir(config, "launch-1"), join(root, "projects", "launch-1"));
  assert.throws(() => projectDir(config, "../escape"));
  const before = readFileSync(file, "utf8");
  assert.equal(await main(["init"], io), 0);
  assert.equal(readFileSync(file, "utf8"), before);
  writeConfigField(config, ["budget", "monthlyUsd"], 42);
  assert.match(readFileSync(file, "utf8"), /# Zero disables paid calls/);
  assert.equal(loadConfig(io).budget.monthlyUsd, 42);
  const defaultIo = fakeIO({ cwd, env: { HOME: home, BSTUDIO_CONFIG: file } });
  assert.equal(loadConfig(defaultIo).root, join(home, "BlastStudio"));
});

test("environment prefers shell to file to injected Keychain", () => {
  const root = tempStudio({ ".env": "GEMINI_API_KEY=file\nOPENAI_API_KEY=\n" });
  const env = loadEnv(root, { GEMINI_API_KEY: "shell" }, (key) => key === "OPENAI_API_KEY" ? "keychain" : undefined);
  assert.equal(env.GEMINI_API_KEY, "shell");
  assert.equal(env.OPENAI_API_KEY, "keychain");
});

test("doctor reports tool status without leaking keys and fails on required failures", async () => {
  const home = tempStudio();
  const calls: string[] = [];
  const io = fakeIO({ cwd: home, env: { HOME: home, BSTUDIO_CONFIG: join(home, "studio.yml"), GEMINI_API_KEY: "secret" },
    run: async (cmd, args) => { calls.push(`${cmd} ${args.join(" ")}`); return cmd === "omp" ? "false" : "v1"; } });
  assert.equal(await main(["doctor"], io), 0);
  assert.match(io.text(), /GEMINI_API_KEY: present/);
  assert.doesNotMatch(io.text(), /secret/);
  assert.match(io.text(), /Budget: \$0\/month/);
  assert.ok(calls.some((call) => call.startsWith("ffmpeg -version")));
  const missing = fakeIO({ cwd: home, env: { HOME: home, BSTUDIO_CONFIG: join(home, "studio.yml") }, run: async () => { throw new Error("missing"); } });
  assert.equal(await main(["doctor"], missing), 1);
  assert.match(missing.text(), /npx playwright install chromium/);
});

test("install-skills links shipped skills idempotently and protects real directories", async () => {
  const home = tempStudio();
  const io = fakeIO({ cwd: home, env: { HOME: home }, run: async () => "" });
  const source = join(home, "source");
  mkdirSync(join(source, "studio-writer"), { recursive: true });
  mkdirSync(join(source, "not-a-skill"), { recursive: true });
  writeFileSync(join(source, "studio-writer", "SKILL.md"), "test");
  assert.equal(await installSkills([], io, source), 0);
  assert.equal(readlinkSync(join(home, ".agents", "skills", "studio-writer")), join(source, "studio-writer"));
  assert.equal(readlinkSync(join(home, ".claude", "skills", "studio-writer")), join(source, "studio-writer"));
  assert.equal(existsSync(join(home, ".agents", "skills", "not-a-skill")), false);
  assert.equal(await installSkills([], io, source), 0);
  const other = tempStudio();
  mkdirSync(join(other, ".claude", "skills", "studio-writer"), { recursive: true });
  writeFileSync(join(other, ".claude", "skills", "studio-writer", "keep"), "mine");
  assert.equal(await installSkills([], fakeIO({ cwd: other, env: { HOME: other } }), source), 1);
  assert.equal(readFileSync(join(other, ".claude", "skills", "studio-writer", "keep"), "utf8"), "mine");
  const empty = fakeIO({ cwd: home, env: { HOME: home } });
  assert.equal(await installSkills([], empty, join(home, "missing")), 0);
  assert.match(empty.text(), /no skills found/);
  const calls: string[][] = [];
  const withHyperframes = fakeIO({ cwd: home, env: { HOME: home }, run: async (cmd, args) => { calls.push([cmd, ...args]); return ""; } });
  assert.equal(await main(["install-skills", "--with-hyperframes"], withHyperframes), 0);
  assert.deepEqual(calls, [["npx", "--yes", "skills@1.9.0", "add", "heygen-com/hyperframes"]]);
});
