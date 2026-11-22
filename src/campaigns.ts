import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { parse, stringify } from "yaml";
import { UserError, type StudioConfig } from "./types.ts";

export interface CampaignRef { project: string; campaign: string }
export interface ProjectMetadata {
  name: string;
  createdAt: string;
  brand?: Record<string, unknown>;
  links?: Record<string, string>;
  migratedFrom?: string;
}

export function validateId(id: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new UserError(`Invalid slug "${id}": use lowercase letters, numbers and single hyphens`);
  return id;
}

export function parseCampaignRef(address: string): CampaignRef {
  const parts = address.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new UserError("Campaign address must be <project>/<campaign>");
  return { project: validateId(parts[0]), campaign: validateId(parts[1]) };
}

export function compositeSlug(ref: CampaignRef): string {
  return `${validateId(ref.project)}--${validateId(ref.campaign)}`;
}

export function campaignAddressForDir(config: StudioConfig, dir: string): string {
  const parts = relative(resolve(config.root, "projects"), resolve(dir)).split(process.platform === "win32" ? "\\" : "/");
  if (parts.length !== 3 || parts[1] !== "campaigns" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(parts[0]) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(parts[2])) return "";
  return `${parts[0]}/${parts[2]}`;
}

// Resolve existing ancestors too, so a symlink cannot escape the studio or project.
export function containedPath(root: string, ...parts: string[]): string {
  const base = resolve(root);
  const path = resolve(base, ...parts);
  const canonical = (p: string): string => {
    const tail: string[] = [];
    while (!existsSync(p)) {
      try { lstatSync(p); throw new UserError(`Cannot resolve path ${p}`); } catch (err) { if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err; }
      const parent = dirname(p);
      if (parent === p) throw new UserError(`Cannot resolve path ${p}`);
      tail.unshift(p.slice(parent.length + (parent.endsWith("/") ? 0 : 1)));
      p = parent;
    }
    return resolve(realpathSync(p), ...tail);
  };
  const rel = relative(canonical(base), canonical(path));
  if (rel === ".." || rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(rel)) throw new UserError(`Path escapes studio root: ${path}`);
  return path;
}

export function readProject(config: StudioConfig, project: string): ProjectMetadata {
  const path = containedPath(config.root, "projects", validateId(project), "project.yml");
  const data: unknown = parse(readFileSync(path, "utf8"));
  if (!data || typeof data !== "object" || !("name" in data) || typeof data.name !== "string" || !("createdAt" in data) || typeof data.createdAt !== "string") throw new UserError(`Invalid project metadata: ${path}`);
  const record = data as Record<string, unknown>;
  if (record.brand !== undefined && (!record.brand || typeof record.brand !== "object" || Array.isArray(record.brand))) throw new UserError(`Invalid project brand: ${path}`);
  if (record.links !== undefined && (!record.links || typeof record.links !== "object" || Array.isArray(record.links) || Object.values(record.links).some(value => typeof value !== "string"))) throw new UserError(`Invalid project links: ${path}`);
  if (record.migratedFrom !== undefined && typeof record.migratedFrom !== "string") throw new UserError(`Invalid project migration metadata: ${path}`);
  return data as ProjectMetadata;
}

export function writeProject(config: StudioConfig, project: string, metadata: ProjectMetadata, flag: "w" | "wx" = "w"): void {
  const dir = containedPath(config.root, "projects", validateId(project));
  mkdirSync(dir, { recursive: true });
  writeFileSync(containedPath(config.root, "projects", project, "project.yml"), stringify(metadata), { flag });
}

function lastUpdated(path: string): number {
  const stat = lstatSync(path);
  if (!stat.isDirectory()) return stat.mtimeMs;
  return readdirSync(path).reduce((latest, name) => Math.max(latest, lstatSync(join(path, name)).mtimeMs), stat.mtimeMs);
}

export function listProjects(config: StudioConfig): { project: string; campaigns: number; updatedAt: Date }[] {
  const root = containedPath(config.root, "projects");
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory() && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(e.name)).flatMap(e => {
    const dir = containedPath(config.root, "projects", e.name);
    const metadata = containedPath(config.root, "projects", e.name, "project.yml");
    if (!existsSync(metadata)) return [];
    const campaigns = containedPath(config.root, "projects", e.name, "campaigns");
    const entries = existsSync(campaigns) ? readdirSync(campaigns, { withFileTypes: true }).filter(c => c.isDirectory() && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c.name)) : [];
    const updated = entries.reduce((latest, entry) => Math.max(latest, lastUpdated(join(campaigns, entry.name))), lastUpdated(dir));
    return [{ project: e.name, campaigns: entries.length, updatedAt: new Date(updated) }];
  }).sort((a, b) => a.project.localeCompare(b.project));
}
