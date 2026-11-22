import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PLATFORM_IDS } from "../src/types.ts";
import { knownValue, loadPack, loadPacks, loadSources } from "../src/packs.ts";

test("all platform packs validate and reference registry sources", () => {
  const packs = loadPacks();
  const sources = loadSources();
  const sourceIds = new Set(sources.map((source) => source.id));
  assert.equal(packs.size, 20);
  assert.deepEqual([...packs.keys()], [...PLATFORM_IDS]);
  assert.equal(sourceIds.size, sources.length);
  for (const source of sources) assert.ok(source.detector?.kind, source.id);
  for (const pack of packs.values()) {
    for (const source of pack.sources) assert.ok(sourceIds.has(source), `${pack.id}: ${source}`);
    if (pack.id !== "hn") {
      for (const criterion of ["hook", "audience-fit", "simplicity", "anti-slop", "platform-fit", "visual-quality", "value"]) {
        assert.ok(pack.rubric.some((item) => item.id === criterion), `${pack.id}: ${criterion}`);
      }
    }
    for (const item of [...pack.rubric, ...(pack.outlineRubric ?? [])]) {
      assert.doesNotMatch(item.id, /^platform-\d/);
      assert.ok(item.anchors?.["0"] && item.anchors["1"] && item.anchors["2"], `${pack.id}: ${item.id}`);
    }
    if (pack.ai === "outline") {
      assert.deepEqual(pack.outlineRubric?.map((item) => item.id), ["coverage", "evidence", "community-rules-checked"]);
    }
    const guidePath = fileURLToPath(new URL(`../platforms/${pack.id}/guide.md`, import.meta.url));
    const guide = readFileSync(guidePath, "utf8");
    const headings = ["Who reads it", "How distribution works", "Hooks", "Structure template", "Anti-patterns", "AI and disclosure", "Checklist", "Sources"];
    if (pack.id !== "hn") headings.push("Formats that work here");
    if (pack.id !== "hn" && pack.formats.some((format) => ["image", "carousel", "poster", "video", "diagram", "logo", "terminal-demo"].includes(format))) {
      headings.push("Visual and video recipes");
    }
    for (const heading of headings) assert.ok(guide.includes(`## ${heading}\n`), `${pack.id}: ${heading}`);
  }
  assert.equal(loadPack("hn").ai, "none");
  assert.equal(loadPack("dailydev").ai, "outline");
  assert.equal(loadPack("instagram").marketBlaster, null);
});

test("knownValue preserves sourced values and exposes unknown as undefined", () => {
  assert.equal(knownValue("unknown"), undefined);
  assert.equal(knownValue(undefined), undefined);
  assert.equal(knownValue({ value: 0, source: "example" }), 0);
});
