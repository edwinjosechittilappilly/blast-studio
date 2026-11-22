import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { listProjects, validateId, writeProject } from "../campaigns.ts";
import { loadConfig, projectRoot } from "../config.ts";
import { collectNotesAndUrls, collectRepository, evidenceSection } from "../evidence.ts";
import type { Command } from "../io.ts";
import { UserError, type ClaimStatus } from "../types.ts";

const usage = "usage: bstudio project new <project> [--repo owner/repo] [--url URL]... [--note text]... | bstudio project list";
export const run: Command = async (args, io) => {
  const [action, ...rest] = args;
  if (action === "--help" || action === "-h" || action === "help") { io.out(usage); return 0; }
  if (action === "list") {
    if (rest.length) throw new UserError(usage);
    const projects = listProjects(loadConfig(io));
    io.out("PROJECT\tCAMPAIGNS\tLAST UPDATED");
    for (const project of projects) io.out(`${project.project}\t${project.campaigns}\t${project.updatedAt.toISOString()}`);
    return 0;
  }
  if (action !== "new") throw new UserError(usage);
  const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: {
    repo: { type: "string" }, url: { type: "string", multiple: true }, note: { type: "string", multiple: true }, help: { type: "boolean" },
  } });
  if (values.help) { io.out(usage); return 0; }
  if (positionals.length !== 1) throw new UserError(usage);
  const id = validateId(positionals[0]);
  if (values.repo && !/^[\w.-]+\/[\w.-]+$/.test(values.repo)) throw new UserError("--repo must be owner/repo");
  const config = loadConfig(io);
  const dir = projectRoot(config, id);
  if (existsSync(dir)) throw new UserError(`Project already exists: ${dir}`);
  const sections: string[] = [];
  const add = (title: string, status: ClaimStatus | undefined, body: string, source?: string) => { sections.push(evidenceSection(sections.length + 1, title, status, body, source)); };
  await collectNotesAndUrls(io, add, values.note ?? [], values.url ?? []);
  if (values.repo) await collectRepository(io, add, values.repo);
  mkdirSync(dirname(dir), { recursive: true });
  mkdirSync(dir, { recursive: false });
  writeProject(config, id, { name: id, createdAt: new Date().toISOString(), ...(values.repo ? { links: { repository: `https://github.com/${values.repo}` } } : {}) }, "wx");
  mkdirSync(join(dir, "evidence"));
  if (sections.length) writeFileSync(join(dir, "evidence", "sources.md"), sections.join("\n"), { flag: "wx" });
  mkdirSync(join(dir, "campaigns"));
  io.out(`Created project ${id}`);
  return 0;
};
