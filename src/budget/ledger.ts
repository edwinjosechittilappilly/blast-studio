import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { StudioConfig } from "../types.ts";
import { UserError } from "../types.ts";

export interface LedgerMeta { projectSlug: string; provider: string; model: string; [key: string]: unknown }
export interface LedgerEntry { id: string; type: "reserved" | "settled" | "agent"; at: string; usd: number | null; projectSlug: string; provider: string; model: string; usage?: unknown; ms?: number }
function entries(root: string): LedgerEntry[] {
  const file = join(root, "ledger.jsonl");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as LedgerEntry);
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
  return effective(root).filter(e => e.projectSlug === projectSlug).reduce((sum, e) => sum + (e.usd ?? 0), 0);
}
export function providerTotals(root: string, now = new Date()): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const e of effective(root)) if (e.at.slice(0, 7) === now.toISOString().slice(0, 7)) totals[e.provider] = (totals[e.provider] ?? 0) + (e.usd ?? 0);
  return totals;
}
async function locked<T>(root: string, fn: () => T): Promise<T> {
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const path = join(root, "ledger.lock"), deadline = Date.now() + 10000;
  let fd: number;
  for (;;) {
    try { fd = openSync(path, "wx", 0o600); writeFileSync(fd, String(process.pid)); break; }
    catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      try { const pid = Number(readFileSync(path, "utf8")); if (pid > 0) { try { process.kill(pid, 0); } catch (e) { if ((e as NodeJS.ErrnoException).code === "ESRCH") unlinkSync(path); } } } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
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
  });
}
export async function recordAgentRun(config: StudioConfig, run: { model: string; ms: number; usage?: unknown; usd: null; projectSlug?: string; provider?: string }): Promise<void> {
  await locked(config.root, () => append(config.root, { id: randomUUID(), type: "agent", at: new Date().toISOString(), projectSlug: run.projectSlug ?? "", provider: run.provider ?? "agent", model: run.model, ms: run.ms, usage: run.usage, usd: null }));
}
