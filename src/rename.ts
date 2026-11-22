import { randomUUID } from "node:crypto";
import { linkSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { parseDocument } from "yaml";
import { locked } from "./budget/ledger.ts";
import { parseCampaignRef, readProject, validateId } from "./campaigns.ts";
import { campaignDir, projectRoot } from "./config.ts";
import { assertNoActiveLocks, withStudioLock } from "./migrate.ts";
import { UserError, type StudioConfig } from "./types.ts";

interface Change { path: string; before: string; after: string; mode: number }

interface RenameJournal { source: string; destination: string; changes: Change[] }
const JOURNAL = ".bstudio-rename.json";
function present(path: string): boolean {
  try { lstatSync(path); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
}

function directory(path: string, description: string): void {
  if (!present(path)) throw new UserError(`${description} not found: ${path}`);
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new UserError(`Unsafe ${description.toLowerCase()}: ${path}`);
}

function projectMetadata(config: StudioConfig, project: string) {
  const path = join(projectRoot(config, project), "project.yml");
  if (!present(path) || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw new UserError(`Project metadata not found or unsafe: ${path}`);
  return readProject(config, project);
}

function fileChange(path: string, update: (contents: string) => string): Change | undefined {
  if (!present(path)) return undefined;
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new UserError(`Unsafe file: ${path}`);
  const before = readFileSync(path, "utf8"), after = update(before);
  return before === after ? undefined : { path, before, after, mode: stat.mode & 0o777 };
}

function updateFile(path: string, content: string, mode: number): void {
  const stage = join(dirname(path), `.bstudio-rename-${randomUUID()}.tmp`);
  try { writeFileSync(stage, content, { flag: "wx", mode }); renameSync(stage, path); }
  finally { if (present(stage)) unlinkSync(stage); }
}

function metadataChange(path: string, name: string | undefined, clearLegacy: boolean): Change | undefined {
  return fileChange(path, contents => {
    const doc = parseDocument(contents);
    if (doc.errors.length || !doc.contents || typeof doc.toJS() !== "object" || Array.isArray(doc.toJS())) throw new UserError(`Invalid project metadata: ${path}`);
    if (name !== undefined) doc.set("name", name);
    if (clearLegacy) doc.delete("migratedFrom");
    return String(doc);
  });
}

function ledgerChange(root: string, translate: (value: string) => string): Change | undefined {
  const path = join(root, "ledger.jsonl");
  return fileChange(path, contents => contents.split("\n").map((line, index) => {
    if (!line) return line;
    let entry: unknown;
    try { entry = JSON.parse(line); } catch { throw new UserError(`Invalid ledger line ${index + 1}; repair ${path} before continuing`); }
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new UserError(`Invalid ledger line ${index + 1}; repair ${path} before continuing`);
    const record = entry as Record<string, unknown>;
    if (typeof record.projectSlug !== "string") return line;
    const next = translate(record.projectSlug);
    if (next === record.projectSlug) return line;
    record.projectSlug = next;
    return JSON.stringify(record);
  }).join("\n"));
}

// Only visit actual job stores, never symlinks or arbitrary JSON inside campaigns.
function jobDirectories(root: string): string[] {
  const result: string[] = [];
  const add = (base: string) => {
    const logs = join(base, "logs"), jobs = join(logs, "jobs");
    if (!present(logs) || !lstatSync(logs).isDirectory() || lstatSync(logs).isSymbolicLink()) return;
    if (present(jobs) && lstatSync(jobs).isDirectory() && !lstatSync(jobs).isSymbolicLink()) result.push(jobs);
  };
  add(root);
  const projects = join(root, "projects");
  if (!present(projects) || !lstatSync(projects).isDirectory() || lstatSync(projects).isSymbolicLink()) return result;
  for (const p of readdirSync(projects, { withFileTypes: true })) {
    if (!p.isDirectory()) continue;
    const project = join(projects, p.name); add(project);
    const campaigns = join(project, "campaigns");
    if (!present(campaigns) || !lstatSync(campaigns).isDirectory() || lstatSync(campaigns).isSymbolicLink()) continue;
    for (const c of readdirSync(campaigns, { withFileTypes: true })) if (c.isDirectory()) add(join(campaigns, c.name));
  }
  return result;
}

function jobChanges(root: string, sourceDir: string, translate: (value: string, inSource: boolean) => string): Change[] {
  const changes: Change[] = [];
  for (const dir of jobDirectories(root)) {
    const rel = relative(sourceDir, dir), inSource = rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !rel.startsWith(sep));
    for (const name of readdirSync(dir)) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json$/.test(name)) continue;
      const path = join(dir, name);
      const change = fileChange(path, contents => {
        let record: unknown;
        try { record = JSON.parse(contents); } catch { throw new UserError(`Invalid job record: ${path}`); }
        if (!record || typeof record !== "object" || Array.isArray(record)) throw new UserError(`Invalid job record: ${path}`);
        const job = record as Record<string, unknown>;
        if (typeof job.campaign !== "string") return contents;
        const next = translate(job.campaign, inSource);
        if (next === job.campaign) return contents;
        if (job.state === "running" || job.state === "queued") throw new UserError(`Cannot rename while job ${name.slice(0, -5)} is active`);
        job.campaign = next;
        return JSON.stringify(job) + "\n";
      });
      if (change) changes.push(change);
    }
  }
  return changes;
}
function inside(base: string, path: string): boolean {
  const rel = relative(base, path);
  return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function journalPath(root: string): string { return join(root, "projects", JOURNAL); }

function finishRename(root: string, journal: RenameJournal): void {
  const base = resolve(root), projects = join(base, "projects");
  if (!journal || typeof journal.source !== "string" || typeof journal.destination !== "string" || !Array.isArray(journal.changes)) throw new UserError("Invalid rename journal");
  const { source, destination, changes } = journal;
  const sourceParts = relative(projects, source).split(sep), destParts = relative(projects, destination).split(sep);
  const validParts = (parts: string[]) => (parts.length === 1 || (parts.length === 3 && parts[1] === "campaigns")) && parts.every((part, index) => index === 1 && parts.length === 3 ? true : /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(part));
  if (!inside(projects, source) || !inside(projects, destination) || !validParts(sourceParts) || !validParts(destParts) || sourceParts.length !== destParts.length || source === destination) throw new UserError("Invalid rename journal paths");
  for (const change of changes) {
    if (!change || typeof change.path !== "string" || typeof change.before !== "string" || typeof change.after !== "string" || !Number.isInteger(change.mode) || change.mode < 0 || change.mode > 0o777) throw new UserError("Invalid rename journal change");
  }
  for (const path of [source, destination, ...changes.flatMap(change => [change.path, inside(source, change.path) ? join(destination, relative(source, change.path)) : change.path])]) {
    if (typeof path !== "string" || !isAbsolute(path) || !inside(base, path)) throw new UserError("Invalid rename journal paths");
    let current = base;
    for (const part of relative(base, path).split(sep)) {
      current = join(current, part);
      if (!present(current)) break;
      if (lstatSync(current).isSymbolicLink()) throw new UserError(`Unsafe rename journal path: ${current}`);
    }
  }
  if (sourceParts.length === 3) {
    assertNoActiveLocks(join(projects, sourceParts[0]));
    assertNoActiveLocks(join(projects, destParts[0]));
  }
  const sourceExists = present(source), destinationExists = present(destination);
  if (sourceExists) {
    assertNoActiveLocks(source);
    if (sourceParts.length === 1) for (const campaign of projectCampaigns(source)) assertNoActiveLocks(campaign);
    directory(source, "Rename source");
    if (destinationExists) {
      directory(destination, "Rename destination");
      if (readdirSync(destination).length) throw new UserError(`Cannot recover rename: destination is not empty: ${destination}`);
    } else {
      mkdirSync(destination);
    }
    renameSync(source, destination);
  } else if (!destinationExists) {
    throw new UserError(`Cannot recover rename: neither ${source} nor ${destination} exists`);
  } else {
    directory(destination, "Rename destination");
    assertNoActiveLocks(destination);
    if (destParts.length === 1) for (const campaign of projectCampaigns(destination)) assertNoActiveLocks(campaign);
  }
  const pending = changes.map(change => ({ change, path: inside(source, change.path) ? join(destination, relative(source, change.path)) : change.path }));
  for (const { change, path } of pending) {
    if (!present(path) || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw new UserError(`Cannot recover rename: unsafe or missing file ${path}`);
    const current = readFileSync(path, "utf8");
    if (current !== change.before && current !== change.after) throw new UserError(`Cannot recover rename: ${path} changed; restore or reconcile it before retrying`);
  }
  for (const { change, path } of pending) if (readFileSync(path, "utf8") !== change.after) updateFile(path, change.after, change.mode);
  unlinkSync(journalPath(root));
}

export async function recoverRenames(config: StudioConfig, warn: (message: string) => void): Promise<Map<string, Error>> {
  const failures = new Map<string, Error>(), path = journalPath(config.root);
  if (!present(path)) return failures;
  try { await locked(config.root, () => withStudioLock(config.root, () => {
    try { recoverLocked(config.root); }
    catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      let projects: string[] = [];
      try {
        const journal = JSON.parse(readFileSync(path, "utf8")) as RenameJournal;
        const base = resolve(config.root, "projects");
        projects = [journal.source, journal.destination].map(dir => {
          if (typeof dir !== "string" || !isAbsolute(dir) || !inside(base, dir)) throw new Error("Invalid journal path");
          const parts = relative(base, dir).split(sep);
          if (!(parts.length === 1 || (parts.length === 3 && parts[1] === "campaigns"))) throw new Error("Invalid journal path");
          validateId(parts[0]);
          if (parts.length === 3) validateId(parts[2]);
          return parts[0];
        });
      } catch { projects = ["*"]; }
      for (const project of projects) failures.set(project, error);
      warn(`Rename recovery failed (${path}): ${error.message}`);
    }
  })); } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    failures.set("*", error);
    warn(`Rename recovery failed (${path}): ${error.message}`);
  }
  return failures;
}

function recoverLocked(root: string): void {
  const path = journalPath(root);
  if (!present(path)) return;
  if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw new UserError(`Unsafe rename journal: ${path}`);
  let journal: RenameJournal;
  try { journal = JSON.parse(readFileSync(path, "utf8")) as RenameJournal; }
  catch { throw new UserError(`Invalid rename journal: ${path}`); }
  finishRename(root, journal);
}

function move(root: string, source: string, destination: string, changes: Change[]): void {
  const path = journalPath(root), stage = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(stage, JSON.stringify({ source, destination, changes }), { flag: "wx", mode: 0o600 });
    linkSync(stage, path);
  } finally { if (present(stage)) unlinkSync(stage); }
  try { mkdirSync(destination); }
  catch (error) {
    unlinkSync(path);
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new UserError(`Destination already exists: ${destination}`);
    throw error;
  }
  finishRename(root, { source, destination, changes });
}

function projectCampaigns(path: string): string[] {
  const campaigns = join(path, "campaigns");
  directory(campaigns, "Campaign directory");
  const entries = readdirSync(campaigns, { withFileTypes: true });
  if (entries.some(entry => entry.isSymbolicLink())) throw new UserError(`Unsafe campaign directory: ${campaigns}`);
  return entries.filter(entry => entry.isDirectory()).map(entry => join(campaigns, entry.name));
}

export async function renameProject(config: StudioConfig, from: string, to: string): Promise<void> {
  validateId(from); validateId(to);
  await locked(config.root, () => withStudioLock(config.root, () => {
    recoverLocked(config.root);
    const source = projectRoot(config, from), destination = projectRoot(config, to);
    directory(join(config.root, "projects"), "Projects directory");
    directory(source, "Project");
    if (present(destination)) throw new UserError(`Destination already exists: ${destination}`);
    const metadata = projectMetadata(config, from);
    assertNoActiveLocks(source);
    for (const campaign of projectCampaigns(source)) assertNoActiveLocks(campaign);
    const legacy = metadata.migratedFrom === from ? from : undefined;
    const translate = (value: string) => value.startsWith(`${from}/`) ? `${to}/${value.slice(from.length + 1)}` : value === legacy ? `${to}/${from}` : value;
    const changes = [metadataChange(join(source, "project.yml"), to, Boolean(legacy)), ledgerChange(config.root, translate), ...jobChanges(config.root, source, (value, inSource) => value === legacy && !inSource ? value : translate(value))].filter((change): change is Change => Boolean(change));
    move(config.root, source, destination, changes);
  }));
}

export async function renameCampaign(config: StudioConfig, from: string, to: string): Promise<void> {
  const oldRef = parseCampaignRef(from), newRef = parseCampaignRef(to);
  await locked(config.root, () => withStudioLock(config.root, () => {
    recoverLocked(config.root);
    const oldProject = projectRoot(config, oldRef.project), newProject = projectRoot(config, newRef.project);
    directory(join(config.root, "projects"), "Projects directory");
    directory(oldProject, "Project"); directory(newProject, "Destination project");
    const metadata = projectMetadata(config, oldRef.project); projectMetadata(config, newRef.project);
    directory(join(oldProject, "campaigns"), "Campaign directory"); directory(join(newProject, "campaigns"), "Destination campaign directory");
    const source = campaignDir(config, oldRef), destination = campaignDir(config, newRef);
    directory(source, "Campaign");
    if (present(destination)) throw new UserError(`Destination already exists: ${destination}`);
    assertNoActiveLocks(oldProject); assertNoActiveLocks(newProject); assertNoActiveLocks(source);
    const legacy = oldRef.project === oldRef.campaign && metadata.migratedFrom === oldRef.project ? oldRef.project : undefined;
    const translate = (value: string) => value === from || value === legacy ? to : value;
    const changes = [legacy ? metadataChange(join(oldProject, "project.yml"), undefined, true) : undefined, ledgerChange(config.root, translate), ...jobChanges(config.root, source, (value, inSource) => value === legacy && !inSource ? value : translate(value))].filter((change): change is Change => Boolean(change));
    move(config.root, source, destination, changes);
  }));
}
