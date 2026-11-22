import { test } from "node:test";
import assert from "node:assert/strict";
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
    for (const criterion of ["hook", "audience-fit", "simplicity", "anti-slop", "platform-fit", "visual-quality", "value"]) {
      assert.ok(pack.rubric.some((item) => item.id === criterion), `${pack.id}: ${criterion}`);
    }
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
