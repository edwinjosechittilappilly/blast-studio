import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, linkSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { containedPath, validateId } from "./campaigns.ts";
import { projectRoot } from "./config.ts";
import { revisionLockStatus } from "./revise-lock.ts";
import { processStarted, sameProcess } from "./jobs/process.ts";
import { UserError, type StudioConfig } from "./types.ts";

const JOURNAL = ".bstudio-migration.json";
const METADATA_STAGE = ".bstudio-project.yml.migration";
interface Journal { entries: string[]; createdAt: string }
function present(path: string): boolean {
  try { lstatSync(path); return true; } catch (err) { if ((err as NodeJS.ErrnoException).code === "ENOENT") return false; throw err; }
}

const STUDIO_LOCK = ".bstudio-studio.lock";
const sleep = new Int32Array(new SharedArrayBuffer(4));

function processInfo(pid: number): { state: string; started: string } | undefined {
  if (process.platform === "linux") {
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
      const fields = stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/);
      if (fields[0] && fields[19]) return { state: fields[0], started: `linux:${fields[19]}` };
    } catch { /* Fall back to ps if procfs is unavailable. */ }
  }
  try {
    const output = execFileSync("ps", ["-o", "stat=", "-o", "lstart=", "-p", String(pid)], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 1000 }).trim();
    const match = /^(\S+)\s+(.+)$/.exec(output);
    if (match) return { state: match[1], started: `ps:${match[2]}` };
  } catch { /* An unavailable probe must not make a live owner appear dead. */ }
  return undefined;
}


function studioOwnerAlive(owner: { pid?: number; processStarted?: string }): boolean {
  if (!Number.isSafeInteger(owner.pid) || owner.pid! <= 0) return false;
  const pid = owner.pid!;
  try { process.kill(pid, 0); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") return false; }
  const info = processInfo(pid);
  if (info?.state.startsWith("Z")) return false;
  if (typeof owner.processStarted !== "string" || !owner.processStarted || !info) return true;
  if (owner.processStarted.startsWith("linux:") !== info.started.startsWith("linux:")) return true;
  return info.started === owner.processStarted;
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
  if (sameProcess(lock.pid!, lock.processStarted)) return true;
  return Array.isArray(lock.childPids) && lock.childPids.some(pid => {
    const started = lock!.childStarted?.[pid];
    if (!started || !Number.isSafeInteger(pid) || pid <= 0) return false;
    const current = processStarted(pid);
    if (current && current !== started && !(current.startsWith("linux:") && !started.startsWith("linux:"))) return false;
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
  const started = processInfo(process.pid)?.started;
  if (!started) throw new UserError(`Cannot determine process start identity for studio lock ${path}`);
  const owner = { pid: process.pid, processStarted: started };
  writeFileSync(temp, JSON.stringify(owner), { flag: "wx", mode: 0o600 });
  const deadline = performance.now() + 60000;
  try {
    for (;;) {
      if (performance.now() >= deadline) {
        throw new UserError(`Timed out waiting for studio lock ${path}. Stop or exit all studio processes, verify no owner is still running, then manually remove the lock and its ${recovery} recovery directory if they remain.`);
      }
      try {
        try { linkSync(temp, path); }
        catch (error) {
          if (!["ENOTSUP", "EOPNOTSUPP", "EPERM", "ENOSYS"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
          writeFileSync(path, JSON.stringify(owner), { flag: "wx", mode: 0o600 });
        }
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
          writeFileSync(join(recovery, "owner"), JSON.stringify(owner));
          const identity = statSync(path);
          let lockOwner: { pid?: number; processStarted?: string } | undefined;
          try { lockOwner = JSON.parse(readFileSync(path, "utf8")); }
          catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; }
          const age = Date.now() - identity.mtimeMs;
          const validPid = Number.isSafeInteger(lockOwner?.pid) && lockOwner!.pid! > 0;
          if ((validPid && !studioOwnerAlive(lockOwner!)) || (!validPid && age > 30000)) {
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
            let recoveryOwner: { pid?: number; processStarted?: string } = {};
            try {
              const stored = readFileSync(join(recovery, "owner"), "utf8");
              const parsed = JSON.parse(stored);
              recoveryOwner = typeof parsed === "number" ? { pid: parsed } : parsed ?? {};
            } catch { /* Owner may have died before writing. */ }
            if (!studioOwnerAlive(recoveryOwner)) rmSync(recovery, { recursive: true, force: true });
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
