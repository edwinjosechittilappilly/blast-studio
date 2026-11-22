import { fetchText } from "./fetch-text.ts";
import type { IO } from "./io.ts";
import type { ClaimStatus } from "./types.ts";

export type AddEvidence = (title: string, status: ClaimStatus | undefined, body: string, source?: string) => void;

export async function collectNotesAndUrls(io: IO, add: AddEvidence, notes: string[], urls: string[]): Promise<void> {
  for (const note of notes) add("Note", "claim", note);
  for (const url of urls) add("URL", "claim", await fetchText(url, io), url);
}

export async function collectRepository(io: IO, add: AddEvidence, repo: string): Promise<void> {
  const raw = repo === "local"
    ? await io.run("git", ["log", "-1", "--format=%H%n%s%n%b"], { cwd: io.cwd })
    : await io.run("gh", ["repo", "view", repo, "--json", "nameWithOwner,description,url"], { cwd: io.cwd });
  add("Repository", undefined, raw, repo);
  if (repo !== "local") {
    let readme: string | undefined;
    try {
      readme = await io.run("gh", ["api", `repos/${repo}/readme`, "-H", "Accept: application/vnd.github.raw"], { cwd: io.cwd });
    } catch (error) {
      if (!(error instanceof Error) || !/HTTP 404\b/.test(error.message)) throw error;
    }
    if (readme !== undefined) {
      const limit = 40_000;
      const chars = Array.from(readme);
      add("Repository README", undefined, chars.length > limit ? `${chars.slice(0, limit).join("")}\n\n[README truncated at ${limit} characters]` : readme, `https://github.com/${repo}#readme`);
    }
  }
}

export function evidenceSection(index: number, title: string, status: ClaimStatus | undefined, body: string, source?: string): string {
  const safeTitle = title.replace(/[\r\n]+/g, " ").trim();
  const longest = Math.max(2, ...Array.from(body.matchAll(/`+/g), (match) => match[0].length));
  const delimiter = "`".repeat(longest + 1);
  return `## [E${index}] ${safeTitle}\n\n${status ? `status: ${status}\n\n` : ""}${source ? `Source: ${source.replace(/[\r\n]+/g, " ")}\n\n` : ""}${delimiter}untrusted\n${body.trim()}\n${delimiter}\n`;
}
