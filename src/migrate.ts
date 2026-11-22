import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, linkSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { containedPath, validateId } from "./campaigns.ts";
import { projectRoot } from "./config.ts";
import { revisionLockStatus } from "./revise-lock.ts";
import { UserError, type StudioConfig } from "./types.ts";

const JOURNAL = ".bstudio-migration.json";
const METADATA_STAGE = ".bstudio-project.yml.migration";
interface Journal { entries: string[]; createdAt: string }
function present(path: string): boolean {
  try { lstatSync(path); return true; } catch (err) { if ((err as NodeJS.ErrnoException).code === "ENOENT") return false; throw err; }
}

const STUDIO_LOCK = ".bstudio-studio.lock";
const sleep = new Int32Array(new SharedArrayBuffer(4));

function processAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  if (process.platform === "linux") {
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
      if (stat.slice(stat.lastIndexOf(")") + 2).startsWith("Z ")) return false;
    } catch { /* Fall back to the OS probe. */ }
  }
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code !== "ESRCH"; }
}

function processStarted(pid: number): string | undefined {
  try { return execFileSync("ps", ["-o", "lstart=", "-p", String(pid)], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || undefined; }
  catch { return undefined; }
}

function jobLockAlive(path: string): boolean {
  let lock: { pid?: number; processStarted?: string; childPids?: number[]; childStarted?: Record<string, string> } | undefined;
  try { lock = JSON.parse(readFileSync(path, "utf8")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    try { return Date.now() - statSync(path).mtimeMs < 30000; }
    catch (err) { if ((err as NodeJS.ErrnoException).code === "ENOENT") return false; throw err; }
  }
  if (!lock || !Number.isInteger(lock.pid) || lock.pid! <= 0) return true;
  if (processAlive(lock.pid!) && (!lock.processStarted || processStarted(lock.pid!) === lock.processStarted)) return true;
  return Array.isArray(lock.childPids) && lock.childPids.some(pid => {
    const started = lock!.childStarted?.[pid];
    if (!started || !Number.isSafeInteger(pid) || pid <= 0) return false;
    const current = processStarted(pid);
    if (current && current !== started) return false;
    try { process.kill(process.platform === "win32" ? pid : -pid, 0); return true; }
    catch (error) { return (error as NodeJS.ErrnoException).code !== "ESRCH"; }
  });
}

/** Reject moves while an old or current process can still write to this directory. */
export function assertNoActiveLocks(dir: string): void {
  const job = join(dir, ".bstudio-job.lock");
  if (jobLockAlive(job) || revisionLockStatus(dir) === "running") {
    throw new UserError(`Cannot move ${dir}; stop running jobs first`);
  }
}

/** Serialize studio-wide moves across processes; dead lock owners are recoverable. */
export function withStudioLock<T>(root: string, fn: () => T): T {
  const projects = containedPath(root, "projects");
  mkdirSync(projects, { recursive: true });
  const path = join(projects, STUDIO_LOCK);
  const temp = join(projects, `${STUDIO_LOCK}-${randomUUID()}.tmp`);
  const recovery = `${path}.recovery`;
  writeFileSync(temp, JSON.stringify({ pid: process.pid }), { flag: "wx", mode: 0o600 });
  try {
    for (;;) {
      try {
        linkSync(temp, path);
        // A recovering process may have observed the previous owner.
        if (present(recovery)) { unlinkSync(path); Atomics.wait(sleep, 0, 0, 20); continue; }
        break;
      }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      try {
        mkdirSync(recovery);
        try {
          writeFileSync(join(recovery, "owner"), String(process.pid));
          const identity = statSync(path);
          let owner: { pid?: number } | undefined;
          try { owner = JSON.parse(readFileSync(path, "utf8")); }
          catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; }
          const age = Date.now() - identity.mtimeMs;
          const validPid = Number.isSafeInteger(owner?.pid) && owner!.pid! > 0;
          if ((validPid && !processAlive(owner!.pid!)) || (!validPid && age > 30000)) {
            const current = statSync(path);
            if (current.dev === identity.dev && current.ino === identity.ino) unlinkSync(path);
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        } finally { rmSync(recovery, { recursive: true, force: true }); }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        try {
          const age = Date.now() - statSync(recovery).mtimeMs;
          if (age > 30000) {
            let pid = 0;
            try { pid = Number(readFileSync(join(recovery, "owner"), "utf8")); } catch { /* Owner may have died before writing. */ }
            if (!processAlive(pid)) rmSync(recovery, { recursive: true, force: true });
          }
        } catch (err) { if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err; }
      }
      Atomics.wait(sleep, 0, 0, 20);
    }
    try { return fn(); }
    finally { unlinkSync(path); }
  } finally { unlinkSync(temp); }
}

export function migrateProjects(config: StudioConfig, notice: (message: string) => void, skip?: ReadonlySet<string>): Map<string, Error> {
  const failures = new Map<string, Error>();
  const projects = containedPath(config.root, "projects");
  if (skip?.has("*") || !existsSync(projects)) return failures;
  return withStudioLock(config.root, () => {
    for (const entry of readdirSync(projects, { withFileTypes: true })) {
      if (skip?.has(entry.name)) continue;
      const candidate = join(projects, entry.name);
      if (entry.isSymbolicLink()) {
        notice(`Migration skipped symlink ${candidate}`);
        continue;
      }
      if (!entry.isDirectory()) continue;
      try {
        if (!present(join(candidate, JOURNAL)) && !present(join(candidate, "brief.md"))) continue;
        try { validateId(entry.name); }
        catch {
          notice(`Migration skipped invalid project name at ${candidate}`);
          continue;
        }
        migrateProject(config, entry.name);
        notice(`Migrated ${entry.name} to ${entry.name}/${entry.name}`);
      } catch (error) {
        const failure = new UserError(`Migration failed for ${candidate}: ${error instanceof Error ? error.message : String(error)}`);
        failures.set(entry.name, failure);
        notice(failure.message);
      }
    }
    return failures;
  });
}

function migrateProject(config: StudioConfig, name: string): void {
  const root = projectRoot(config, name);
  assertNoActiveLocks(root);
  const journalPath = join(root, JOURNAL);
  const destination = containedPath(root, "campaigns", name);
  let journal: Journal;
  if (present(journalPath)) {
    try { journal = JSON.parse(readFileSync(journalPath, "utf8")) as Journal; }
    catch { throw new UserError(`Invalid migration journal ${journalPath}; restore it from backup before retrying`); }
    if (!journal || !Array.isArray(journal.entries) || typeof journal.createdAt !== "string" || journal.entries.some(name => typeof name !== "string" || !name || name === "." || name === ".." || name.includes("/") || name === JOURNAL || name === METADATA_STAGE || name === "campaigns" || name === "project.yml")) throw new UserError(`Invalid migration journal ${journalPath}`);
    journal.entries = journal.entries.filter(name => !/^\.bstudio-journal-.*\.tmp$/.test(name));
  } else {
    if (present(join(root, "project.yml"))) throw new UserError(`Migration conflict: ${join(root, "project.yml")} already exists; resolve it before retrying`);
    if (present(join(root, METADATA_STAGE)) && !lstatSync(join(root, METADATA_STAGE)).isFile()) throw new UserError(`Migration conflict: unsafe staging file ${join(root, METADATA_STAGE)}`);
    journal = { entries: readdirSync(root).filter(name => name !== "campaigns" && name !== METADATA_STAGE && !/^\.bstudio-journal-.*\.tmp$/.test(name)), createdAt: new Date().toISOString() };
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
    if (metadata?.name !== name || metadata?.createdAt !== journal.createdAt) throw new UserError(`Migration conflict: ${metadataPath} already exists; resolve it before retrying`);
  } else {
    const stage = join(root, METADATA_STAGE);
    if (present(stage) && !lstatSync(stage).isFile()) throw new UserError(`Migration conflict: unsafe staging file ${stage}`);
    writeFileSync(stage, stringify({ name, createdAt: journal.createdAt, migratedFrom: name }));
    linkSync(stage, metadataPath);
  }
  if (present(join(root, METADATA_STAGE))) unlinkSync(join(root, METADATA_STAGE));
  unlinkSync(journalPath);
}
