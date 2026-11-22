import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { parse } from "yaml";
import { containedPath } from "../campaigns.ts";
import type { StudioConfig } from "../types.ts";
import { UserError } from "../types.ts";

export interface LedgerMeta { projectSlug: string; provider: string; model: string; [key: string]: unknown }
export interface LedgerEntry { id: string; type: "reserved" | "settled" | "agent"; at: string; usd: number | null; projectSlug: string; provider: string; model: string; usage?: unknown; ms?: number; step?: string; succeeded?: boolean }
export function parseAgentOutput(raw: string): { text: string; usd: number | null; usage?: unknown } {
  try {
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === "object" && !Array.isArray(value) && ("total_cost_usd" in value || "cost_usd" in value || ("result" in value && "usage" in value))) {
      const wrapper = value as { result?: unknown; total_cost_usd?: unknown; cost_usd?: unknown; usage?: unknown };
      const cost = wrapper.total_cost_usd ?? wrapper.cost_usd;
      const usd = typeof cost === "number" && Number.isFinite(cost) && cost >= 0 ? cost : null;
      return { text: typeof wrapper.result === "string" ? wrapper.result : raw, usd, usage: wrapper.usage };
    }
  } catch { /* Plain agent output is not a wrapper. */ }
  return { text: raw, usd: null };
}
function entries(root: string): LedgerEntry[] {
  const file = join(root, "ledger.jsonl");
  if (!existsSync(file)) return [];
  const lines = readFileSync(file, "utf8").split("\n");
  return lines.filter(Boolean).map((line, index) => {
    try { return JSON.parse(line) as LedgerEntry; }
    catch { throw new UserError(`Invalid ledger line ${index + 1}; repair ${file} before continuing`); }
  });
}
/** Mean duration of completed historical agent runs for this workflow step. */
export function usualStepMs(root: string, step: string): number | undefined {
  const samples = entries(root).filter(e => e.type === "agent" && e.succeeded === true && e.step === step && typeof e.ms === "number" && Number.isFinite(e.ms) && e.ms >= 0);
  return samples.length ? samples.reduce((sum, e) => sum + e.ms!, 0) / samples.length : undefined;
}
function effective(root: string): LedgerEntry[] {
  const all = entries(root), settled = new Map(all.filter(e => e.type === "settled").map(e => [e.id, e]));
  return all.filter(e => e.type !== "settled").map(e => {
    const s = settled.get(e.id);
    return s ? { ...e, usd: s.usd, usage: s.usage } : e;
  });
}
export function monthToDate(root: string, now = new Date()): number {
  const month = now.toISOString().slice(0, 7);
  return effective(root).filter(e => e.at.slice(0, 7) === month).reduce((sum, e) => sum + (e.usd ?? 0), 0);
}
export function projectTotal(root: string, projectSlug: string): number {
  const [project, campaign, extra] = projectSlug.split("/");
  let legacy: string | undefined;
  if (project && project === campaign && extra === undefined && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(project)) {
    const file = containedPath(root, "projects", project, "project.yml");
    if (existsSync(file)) {
      const metadata: unknown = parse(readFileSync(file, "utf8"));
      if (metadata && typeof metadata === "object" && "migratedFrom" in metadata && metadata.migratedFrom === project) legacy = project;
    }
  }
  return effective(root).filter(e => e.projectSlug === projectSlug || (legacy !== undefined && e.projectSlug === legacy)).reduce((sum, e) => sum + (e.usd ?? 0), 0);
}
export function providerTotals(root: string, now = new Date()): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const e of effective(root)) if (e.at.slice(0, 7) === now.toISOString().slice(0, 7)) totals[e.provider] = (totals[e.provider] ?? 0) + (e.usd ?? 0);
  return totals;
}
export async function locked<T>(root: string, fn: () => T): Promise<T> {
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const path = join(root, "ledger.lock"), deadline = Date.now() + 10000;
  let fd: number;
  for (;;) {
    try { fd = openSync(path, "wx", 0o600); writeFileSync(fd, String(process.pid)); break; }
    catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      const recovery = `${path}.recovery`;
      try {
        mkdirSync(recovery);
        try {
          const pid = Number(readFileSync(path, "utf8"));
          let dead = false;
          if (pid > 0) {
            try { process.kill(pid, 0); }
            catch (e) { dead = (e as NodeJS.ErrnoException).code === "ESRCH"; }
          }
          if (dead || Date.now() - statSync(path).mtimeMs > 60000) {
            const stale = `${path}.stale-${randomUUID()}`;
            renameSync(path, stale);
            unlinkSync(stale);
          }
        } finally { rmdirSync(recovery); }
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "EEXIST") {
          try { if (Date.now() - statSync(recovery).mtimeMs > 60000) rmdirSync(recovery); }
          catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
        } else if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
      if (Date.now() >= deadline) throw new UserError("Timed out waiting for ledger lock");
      await delay(20);
    }
  }
  try { return fn(); } finally { closeSync(fd); unlinkSync(path); }
}
function append(root: string, entry: LedgerEntry): void { appendFileSync(join(root, "ledger.jsonl"), JSON.stringify(entry) + "\n", { mode: 0o600 }); }
export async function reserve(config: StudioConfig, upperBoundUsd: number, meta: LedgerMeta): Promise<string> {
  if (!Number.isFinite(upperBoundUsd) || upperBoundUsd <= 0) throw new UserError("Invalid reservation amount");
  return locked(config.root, () => {
    if (config.budget.monthlyUsd === 0 || monthToDate(config.root) + upperBoundUsd > config.budget.monthlyUsd + 1e-12) throw new UserError("Monthly budget exceeded or paid calls disabled");
    // A zero project cap means no additional project limit; the monthly cap still applies.
    if (config.budget.perProjectUsd > 0 && projectTotal(config.root, meta.projectSlug) + upperBoundUsd > config.budget.perProjectUsd + 1e-12) throw new UserError("Project budget exceeded");
    const id = randomUUID();
    append(config.root, { ...meta, id, type: "reserved", at: new Date().toISOString(), usd: upperBoundUsd });
    return id;
  });
}
export async function settle(root: string, id: string, actualUsd: number | null, usage?: unknown): Promise<void> {
  if (actualUsd !== null && (!Number.isFinite(actualUsd) || actualUsd < 0)) throw new UserError("Invalid settlement amount");
  await locked(root, () => {
    const all = entries(root), original = all.find(e => e.id === id && e.type === "reserved");
    if (!original || all.some(e => e.id === id && e.type === "settled")) throw new UserError("Unknown or already settled reservation");
    append(root, { ...original, type: "settled", at: new Date().toISOString(), usd: actualUsd, usage });
    if (actualUsd !== null && original.usd !== null && actualUsd > original.usd) console.warn(`Warning: settlement exceeded reservation by $${(actualUsd - original.usd).toFixed(6)} (reported $${actualUsd}, reserved $${original.usd})`);
  });
}

export async function reserveAgentRun(config: StudioConfig, run: { command: string; projectSlug: string; maxUsd: number }): Promise<string> {
  return reserve(config, run.maxUsd, { projectSlug: run.projectSlug, provider: "agent", model: run.command });
}
export async function settleAgentRun(config: StudioConfig, id: string, run: { usd: number; usage?: unknown }): Promise<void> {
  await settle(config.root, id, run.usd, run.usage);
}
export async function recordAgentRun(config: StudioConfig, run: { model: string; ms: number; usage?: unknown; usd: null; projectSlug?: string; provider?: string; step?: string; succeeded?: boolean }): Promise<void> {
  await locked(config.root, () => append(config.root, { id: randomUUID(), type: "agent", at: new Date().toISOString(), projectSlug: run.projectSlug ?? "", provider: run.provider ?? "agent", model: run.model, ms: run.ms, step: run.step, succeeded: run.succeeded, usage: run.usage, usd: null }));
}
