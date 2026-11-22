import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { parse } from "yaml";
import { parseBrief } from "../brief.ts";
import { campaignDir, loadConfig, projectRoot } from "../config.ts";
import { containedPath, parseCampaignRef } from "../campaigns.ts";
import { collectNotesAndUrls, collectRepository, evidenceSection } from "../evidence.ts";
import type { Command, IO } from "../io.ts";
import { UserError, type BriefSection, type ClaimStatus } from "../types.ts";

function existingPath(path: string): string {
  let cursor = path;
  const tail: string[] = [];
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) break;
    tail.unshift(cursor.slice(parent.length + (parent.endsWith("/") ? 0 : 1)));
    cursor = parent;
  }
  return join(realpathSync(cursor), ...tail);
}

function inGit(path: string): boolean {
  let cursor = existingPath(path);
  for (;;) {
    if (existsSync(join(cursor, ".git"))) return true;
    const parent = dirname(cursor);
    if (parent === cursor) return false;
    cursor = parent;
  }
}

function explicitlyConfigured(io: IO, file: string): boolean {
  if (io.env.BSTUDIO_HOME) return true;
  const data = parse(readFileSync(file, "utf8")) as { studio?: { root?: unknown } } | null;
  return typeof data?.studio?.root === "string" && data.studio.root.length > 0;
}


export const run: Command = async (args, io) => {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    idea: { type: "string" }, note: { type: "string", multiple: true }, url: { type: "string", multiple: true },
    pr: { type: "string" }, commit: { type: "string" }, repo: { type: "string" },
    "mb-brief": { type: "string" }, force: { type: "boolean" }, help: { type: "boolean", short: "h" },
  } });
  if (values.help) { io.out("usage: bstudio brief <project>/<campaign> [--idea text] [--note text] [--url URL] [--repo owner/repo] [--force]\nExample: bstudio brief acme/launch --idea 'Announcing launch'"); return 0; }
  if (positionals.length !== 1) throw new UserError("usage: bstudio brief <project>/<campaign> [--idea text] [--note text] [--url url] [--pr N --repo owner/repo] [--commit sha --repo owner/repo|local] [--mb-brief path] [--force]");
  if (values.pr && !/^\d+$/.test(values.pr)) throw new UserError("--pr must be a number");
  if ((values.pr || values.commit) && !values.repo) throw new UserError("--pr and --commit require --repo");
  if (values.repo && values.repo !== "local" && !/^[\w.-]+\/[\w.-]+$/.test(values.repo)) throw new UserError("--repo must be owner/repo or local");
  if (values.pr && values.repo === "local") throw new UserError("--pr requires a GitHub owner/repo");
  if (values.commit && !/^[0-9a-f]{4,64}$/i.test(values.commit)) throw new UserError("--commit must be a commit SHA");
  const config = loadConfig(io);
  const ref = parseCampaignRef(positionals[0]);
  const project = projectRoot(config, ref.project);
  const dir = campaignDir(config, ref);
  if (!existsSync(containedPath(project, "project.yml"))) throw new UserError(`Project ${ref.project} does not exist; run bstudio project new ${ref.project}`);
  const path = join(dir, "brief.md");
  if (inGit(dir) && !explicitlyConfigured(io, config.file)) throw new UserError("Project directory is inside a git repository; explicitly set studio.root or BSTUDIO_HOME to allow it");
  if (existsSync(path) && !values.force) throw new UserError(`${path} already exists; use --force to overwrite it`);
  const sections: string[] = [];
  const add = (title: string, status: ClaimStatus | undefined, body: string, source?: string) => {
    sections.push(evidenceSection(sections.length + 1, title, status, body, source));
  };
  const addImported = (section: BriefSection, file: string, untrustedSource = false) => {
    let body = section.body;
    const source = body.match(/^Source:[ \t]*(.+)[ \t]*(?:\r?\n|$)/i);
    if (source) body = body.slice(source[0].length).trim();
    const fenced = body.match(/^(`{3,}|~{3,})untrusted[ \t]*\r?\n([\s\S]*?)\r?\n\1[ \t]*$/);
    if (fenced) body = fenced[2];
    if (untrustedSource && source) body = `${source[0].trim()}\n\n${body}`;
    add(section.title, section.status, body, !untrustedSource && source?.[1].trim() || `${file} [${section.anchor}]`);
  };
  const shared = containedPath(project, "evidence", "sources.md");
  if (existsSync(shared)) {
    for (const section of parseBrief(readFileSync(shared, "utf8"))) addImported(section, shared);
  }
  if (values.idea) add("Idea", "claim", values.idea);
  await collectNotesAndUrls(io, add, values.note ?? [], values.url ?? []);
  if (values.pr) {
    const raw = await io.run("gh", ["pr", "view", values.pr, "--repo", values.repo!, "--json", "number,title,body,state,mergedAt,url"], { cwd: io.cwd });
    let pr: { title?: string; body?: string; state?: string; mergedAt?: string | null; url?: string };
    try { pr = JSON.parse(raw); } catch { throw new UserError("gh returned invalid PR JSON"); }
    const status: ClaimStatus = pr.mergedAt || pr.state?.toUpperCase() === "MERGED" ? "shipped" : "planned";
    add(`PR #${values.pr}`, status, `${pr.title ?? ""}\n\n${pr.body ?? ""}`, pr.url || `${values.repo}#${values.pr}`);
  }
  if (values.commit) {
    const raw = values.repo === "local"
      ? await io.run("git", ["show", "--format=fuller", "--stat", "--no-renames", values.commit, "--"], { cwd: io.cwd })
      : await io.run("gh", ["api", `repos/${values.repo}/commits/${values.commit}`], { cwd: io.cwd });
    add(`Commit ${values.commit}`, "shipped", raw, `${values.repo}@${values.commit}`);
  }
  if (values.repo && !values.pr && !values.commit) await collectRepository(io, add, values.repo);
  if (values["mb-brief"]) {
    const file = resolve(io.cwd, values["mb-brief"]);
    const imported = parseBrief(readFileSync(file, "utf8"));
    if (!imported.length) throw new UserError("Market Blaster brief has no evidence sections");
    for (const section of imported) addImported(section, file, true);
  }
  if (!sections.length) throw new UserError("Provide at least one brief input");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, `${sections.join("\n")}\n## Notes from the author\n\n<!-- Add context, caveats, and other details. -->\n`, { flag: values.force ? "w" : "wx" });
  io.out(`Wrote ${path} (${sections.length} evidence anchors)`);
  return 0;
};
