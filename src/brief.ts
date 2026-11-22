import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BriefSection, ClaimStatus } from "./types.ts";

/** Parse evidence headings without treating headings inside Markdown fences as sections. */
export function parseBrief(text: string): BriefSection[] {
  const sections: BriefSection[] = [];
  let current: BriefSection | undefined;
  let lines: string[] = [];
  let fence: { char: string; length: number } | undefined;
  const finish = () => {
    if (!current) return;
    const body = lines.join("\n").trim();
    const match = body.match(/^status:\s*(shipped|planned|claim)\s*(?:\n|$)/i);
    if (match) current.status = match[1].toLowerCase() as ClaimStatus;
    current.body = match ? body.slice(match[0].length).trim() : body;
    sections.push(current);
  };
  for (const line of text.split(/\r?\n/)) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = { char: marker[1][0], length: marker[1].length };
      else if (marker[1][0] === fence.char && marker[1].length >= fence.length && /^\s*$/.test(line.slice(marker[0].length))) fence = undefined;
      if (current) lines.push(line);
      continue;
    }
    if (!fence) {
      const heading = line.match(/^##\s+\[(E\d+)\]\s+(.+?)\s*$/);
      if (heading) {
        finish();
        current = { anchor: heading[1], title: heading[2], body: "" };
        lines = [];
        continue;
      }
      if (/^##\s+/.test(line)) { finish(); current = undefined; lines = []; continue; }
    }
    if (current) lines.push(line);
  }
  finish();
  return sections;
}

export function readBrief(projectDir: string): BriefSection[] {
  return parseBrief(readFileSync(join(projectDir, "brief.md"), "utf8"));
}
