import { reconcile, type BatchCounts, type Reconciliation } from "./apply";

export type UndoCounts = {
  removed: number;
  unlinked: number;
  kept: number;
  keptClaimed: number;
  keptReferenced: number;
};

export type ImportBatchView = BatchCounts & {
  id: string;
  fileName: string;
  sha256: string;
  withAddresses: boolean;
  exportedAt: string;
  runBy: string | null;
  createdAt: string;
  appliedAt: string | null;
  rolledBackAt: string | null;
  undoCounts: UndoCounts | null;
};

export type BatchState = "applied" | "stopped" | "undone";

export function batchState(b: Pick<ImportBatchView, "appliedAt" | "rolledBackAt">): BatchState {
  if (b.rolledBackAt) return "undone";
  if (b.appliedAt) return "applied";
  return "stopped";
}

export function batchMismatch(b: ImportBatchView): Reconciliation | null {
  if (batchState(b) !== "stopped") return null;
  const r = reconcile(b);
  return r.complete && !r.reconciles ? r : null;
}

export function batchForFile(history: readonly ImportBatchView[], sha256: string): ImportBatchView | null {
  return history.find((b) => b.sha256 === sha256 && batchState(b) !== "undone") ?? null;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function readUndoCounts(v: unknown): UndoCounts | null {
  if (!v || typeof v !== "object") return null;
  const d = v as Record<string, unknown>;
  return {
    removed: num(d.removed),
    unlinked: num(d.unlinked),
    kept: num(d.kept),
    keptClaimed: num(d.kept_claimed),
    keptReferenced: num(d.kept_referenced),
  };
}

export type ImportBatchRow = {
  id: string;
  file_name: string;
  file_sha256: string;
  rows_total: number;
  rows_done: number;
  with_addresses: boolean;
  exported_at: string;
  created: number;
  merged: number;
  already_imported: number;
  skipped: Record<string, number> | null;
  run_by_user_id: string | null;
  run_by_profile_id: string | null;
  created_at: string;
  applied_at: string | null;
  rolled_back_at: string | null;
  undo_counts: unknown;
};

export const IMPORT_BATCH_COLUMNS =
  "id, file_name, file_sha256, rows_total, rows_done, with_addresses, exported_at, created, merged, already_imported, skipped, run_by_user_id, run_by_profile_id, created_at, applied_at, rolled_back_at, undo_counts";

export function toBatchView(
  row: ImportBatchRow,
  names: { profiles: ReadonlyMap<string, string>; members: ReadonlyMap<string, string> },
): ImportBatchView {
  const runBy =
    (row.run_by_profile_id && names.profiles.get(row.run_by_profile_id)) ||
    (row.run_by_user_id && names.members.get(row.run_by_user_id)) ||
    null;
  return {
    id: row.id,
    fileName: row.file_name,
    sha256: row.file_sha256,
    rowsTotal: row.rows_total,
    rowsDone: row.rows_done,
    withAddresses: row.with_addresses,
    exportedAt: row.exported_at,
    created: row.created,
    merged: row.merged,
    alreadyImported: row.already_imported,
    skipped: (row.skipped ?? {}) as BatchCounts["skipped"],
    runBy,
    createdAt: row.created_at,
    appliedAt: row.applied_at,
    rolledBackAt: row.rolled_back_at,
    undoCounts: readUndoCounts(row.undo_counts),
  };
}
