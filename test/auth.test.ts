import assert from "node:assert/strict";
import { test } from "node:test";
import { run } from "../src/commands/auth.ts";
import { UserError } from "../src/types.ts";
import { fakeIO, tempStudio } from "./helpers.ts";

test("unknown keys report the known built-in and configured keys", async () => {
  const root = tempStudio({ "studio.yml": "agent:\n  passEnv: [CUSTOM_TOKEN]\n" });
  const io = fakeIO({ cwd: root, env: { BSTUDIO_CONFIG: "studio.yml", BSTUDIO_HOME: root } });
  await assert.rejects(run(["set", "UNKNOWN"], io), (err: Error) => {
    assert.ok(err instanceof UserError);
    assert.match(err.message, /GEMINI_API_KEY/);
    assert.match(err.message, /OPENAI_API_KEY/);
    assert.match(err.message, /CUSTOM_TOKEN/);
    return true;
  });
});

test("set accepts passEnv names and writes hex through security stdin", async () => {
  const root = tempStudio({ "studio.yml": "agent:\n  passEnv: [CUSTOM_TOKEN]\n" });
  const io = fakeIO({ cwd: root, env: { BSTUDIO_CONFIG: "studio.yml", BSTUDIO_HOME: root } });
  let args: string[] = [], input = "";
  await run(["set", "CUSTOM_TOKEN", "--stdin"], io, {
    platform: "darwin", input: async (piped) => { assert.equal(piped, true); return "very-secret"; },
    runner: (argv, data) => { args = argv; input = data ?? ""; return ""; },
  });
  assert.deepEqual(args, ["-i"]);
  assert.match(input, /-X 766572792d736563726574/);
  assert.doesNotMatch(args.join(" ") + io.text(), /very-secret/);
});

test("list reports precedence and never displays values", async () => {
  const root = tempStudio({ "studio.yml": "agent:\n  passEnv: [CUSTOM_TOKEN, MISSING_TOKEN]\n", ".env": "GEMINI_API_KEY=file-secret\nOPENAI_API_KEY=file-secret\n" });
  const io = fakeIO({ cwd: root, env: { BSTUDIO_CONFIG: "studio.yml", BSTUDIO_HOME: root, GEMINI_API_KEY: "shell-secret" }, keychain: (key) => key === "CUSTOM_TOKEN" ? "keychain-secret" : undefined });
  await run(["list"], io);
  assert.match(io.text(), /GEMINI_API_KEY: shell/);
  assert.match(io.text(), /OPENAI_API_KEY: \.env/);
  assert.match(io.text(), /CUSTOM_TOKEN: keychain/);
  assert.match(io.text(), /MISSING_TOKEN: unset/);
  assert.doesNotMatch(io.text(), /shell-secret|file-secret|keychain-secret/);
});

test("set on other platforms suggests .env before reading input", async () => {
  const root = tempStudio();
  const io = fakeIO({ cwd: root, env: { BSTUDIO_CONFIG: "studio.yml", BSTUDIO_HOME: root } });
  await assert.rejects(run(["set", "OPENAI_API_KEY"], io, { platform: "linux", input: async () => { throw new Error("must not read"); } }), /\.env/);
});

test("keychain errors never expose credentials", async () => {
  const root = tempStudio();
  const io = fakeIO({ cwd: root, env: { BSTUDIO_CONFIG: "studio.yml", BSTUDIO_HOME: root } });
  await assert.rejects(run(["set", "GEMINI_API_KEY", "--stdin"], io, {
    platform: "darwin", input: async () => "secret-value", runner: () => { throw new Error("secret-value"); },
  }), (err: Error) => !err.message.includes("secret-value"));
});
