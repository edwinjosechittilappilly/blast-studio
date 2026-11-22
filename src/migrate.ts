import { randomUUID } from "node:crypto";
import { existsSync, linkSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { containedPath, validateId } from "./campaigns.ts";
import { campaignDir, projectRoot } from "./config.ts";
import { UserError, type StudioConfig } from "./types.ts";

const JOURNAL = ".bstudio-migration.json";
const METADATA_STAGE = ".bstudio-project.yml.migration";
interface Journal { entries: string[]; createdAt: string }
function present(path: string): boolean {
  try { lstatSync(path); return true; } catch (err) { if ((err as NodeJS.ErrnoException).code === "ENOENT") return false; throw err; }
}

export function migrateProjects(config: StudioConfig, notice: (message: string) => void): void {
  const projects = containedPath(config.root, "projects");
  if (!existsSync(projects)) return;
  for (const entry of readdirSync(projects, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = join(projects, entry.name);
    if (!present(join(candidate, JOURNAL)) && !present(join(candidate, "brief.md"))) continue;
    const root = projectRoot(config, validateId(entry.name));
    const journalPath = join(root, JOURNAL);
    const destination = campaignDir(config, { project: entry.name, campaign: entry.name });
    let journal: Journal;
    if (present(journalPath)) {
      try { journal = JSON.parse(readFileSync(journalPath, "utf8")) as Journal; }
      catch { throw new UserError(`Invalid migration journal ${journalPath}; restore it from backup before retrying`); }
      if (!journal || !Array.isArray(journal.entries) || typeof journal.createdAt !== "string" || journal.entries.some(name => typeof name !== "string" || !name || name === "." || name === ".." || name.includes("/") || name === JOURNAL || name === METADATA_STAGE || name === "campaigns" || name === "project.yml")) throw new UserError(`Invalid migration journal ${journalPath}`);
    } else {
      if (present(join(root, "project.yml"))) throw new UserError(`Migration conflict: ${join(root, "project.yml")} already exists; resolve it before retrying`);
      if (present(join(root, METADATA_STAGE))) throw new UserError(`Migration conflict: ${join(root, METADATA_STAGE)} already exists; resolve it before retrying`);
      journal = { entries: readdirSync(root).filter(name => name !== "campaigns"), createdAt: new Date().toISOString() };
      for (const name of journal.entries) {
        if (present(join(destination, name))) throw new UserError(`Migration conflict: ${join(root, name)} and ${join(destination, name)} both exist; resolve it before retrying`);
      }
      const stage = join(root, `.bstudio-journal-${randomUUID()}.tmp`);
      writeFileSync(stage, JSON.stringify(journal), { flag: "wx" });
      try { linkSync(stage, journalPath); } finally { unlinkSync(stage); }
    }
    for (const name of journal.entries) {
      const from = join(root, name), to = join(destination, name);
      const sourceExists = present(from), destExists = present(to);
      if (sourceExists && destExists) throw new UserError(`Migration conflict: ${from} and ${to} both exist; resolve it before retrying`);
      if (!sourceExists && !destExists) throw new UserError(`Migration cannot find ${from} or ${to}; restore it before retrying`);
    }
    mkdirSync(destination, { recursive: true });
    for (const name of journal.entries) {
      const from = join(root, name), to = join(destination, name);
      if (present(from)) {
        if (present(to)) throw new UserError(`Migration conflict: ${from} and ${to} both exist; resolve it before retrying`);
        renameSync(from, to);
      }
    }
    const metadataPath = join(root, "project.yml");
    if (present(metadataPath)) {
      const metadata = parse(readFileSync(metadataPath, "utf8")) as { name?: unknown; createdAt?: unknown } | null;
      if (metadata?.name !== entry.name || metadata?.createdAt !== journal.createdAt) throw new UserError(`Migration conflict: ${metadataPath} already exists; resolve it before retrying`);
    } else {
      const stage = join(root, METADATA_STAGE);
      if (present(stage) && !lstatSync(stage).isFile()) throw new UserError(`Migration conflict: unsafe staging file ${stage}`);
      writeFileSync(stage, stringify({ name: entry.name, createdAt: journal.createdAt, migratedFrom: entry.name }));
      linkSync(stage, metadataPath);
    }
    if (present(join(root, METADATA_STAGE))) unlinkSync(join(root, METADATA_STAGE));
    unlinkSync(journalPath);
    notice(`Migrated ${entry.name} to ${entry.name}/${entry.name}`);
  }
}
