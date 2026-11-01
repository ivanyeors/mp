/**
 * Fitting imports as the Admin Panel lists them (ADR 0042 e). Pure: the page
 * reads `fitting_import_batches` on the server and hands these views to the
 * browser. A batch holds counts and who ran it, never a customer's email or
 * name.
 */
import { countsFrom, reconcile, type BatchCounts, type Reconciliation } from "./apply";
import type { DateOrder } from "./google-form-csv";

/** What an undo did, or would do (`preview_fitting_import_undo` / `undo_fitting_import`). */
export type UndoCounts = {
  fittingsRemoved: number;
  /** Created by the batch, never signed in to, referenced by nothing: deleted. */
  customersRemoved: number;
  customersKept: number;
  keptSignedIn: number;
  /** Bought, booked, noted, fitted in another import or otherwise referenced since. */
  keptReferenced: number;
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function readUndoCounts(v: unknown): UndoCounts | null {
  if (!v || typeof v !== "object") return null;
  const d = v as Record<string, unknown>;
  return {
    fittingsRemoved: num(d.fittings_removed),
    customersRemoved: num(d.customers_removed),
    customersKept: num(d.customers_kept),
    keptSignedIn: num(d.kept_signed_in),
    keptReferenced: num(d.kept_referenced),
  };
}

export type FittingBatchView = BatchCounts & {
  id: string;
  fileName: string;
  sha256: string;
  dateOrder: DateOrder;
  /** The Staff profile working at the device, else the Member's login, else null. */
  runBy: string | null;
  createdAt: string;
  appliedAt: string | null;
  rolledBackAt: string | null;
  undoCounts: UndoCounts | null;
};

export type BatchState = "applied" | "stopped" | "undone";

export function batchState(b: Pick<FittingBatchView, "appliedAt" | "rolledBackAt">): BatchState {
  if (b.rolledBackAt) return "undone";
  if (b.appliedAt) return "applied";
  return "stopped";
}

/** A stopped batch that has every row but did not reconcile: shown in red, never quietly accepted. */
export function batchMismatch(b: FittingBatchView): Reconciliation | null {
  if (batchState(b) !== "stopped") return null;
  const r = reconcile(b);
  return r.complete && !r.reconciles ? r : null;
}

/** The batch a picked file belongs to, by SHA-256, unless it was undone. */
export function batchForFile(history: readonly FittingBatchView[], sha256: string): FittingBatchView | null {
  return history.find((b) => b.sha256 === sha256 && batchState(b) !== "undone") ?? null;
}

/** One `fitting_import_batches` row, as the page selects it. */
export type FittingBatchRow = {
  id: string;
  file_name: string;
  file_sha256: string;
  date_order: DateOrder;
  rows_total: number;
  rows_done: number;
  created: number;
  matched_email: number;
  matched_phone: number;
  already_imported: number;
  skipped: Record<string, number> | null;
  run_by_user_id: string | null;
  run_by_profile_id: string | null;
  created_at: string;
  applied_at: string | null;
  rolled_back_at: string | null;
  undo_counts: unknown;
};

export const FITTING_BATCH_COLUMNS =
  "id, file_name, file_sha256, date_order, rows_total, rows_done, created, matched_email, matched_phone, already_imported, skipped, run_by_user_id, run_by_profile_id, created_at, applied_at, rolled_back_at, undo_counts";

export function toBatchView(
  row: FittingBatchRow,
  names: { profiles: ReadonlyMap<string, string>; members: ReadonlyMap<string, string> },
): FittingBatchView {
  const runBy =
    (row.run_by_profile_id && names.profiles.get(row.run_by_profile_id)) ||
    (row.run_by_user_id && names.members.get(row.run_by_user_id)) ||
    null;
  return {
    ...countsFrom(row as unknown as Record<string, unknown>),
    id: row.id,
    fileName: row.file_name,
    sha256: row.file_sha256,
    dateOrder: row.date_order,
    runBy,
    createdAt: row.created_at,
    appliedAt: row.applied_at,
    rolledBackAt: row.rolled_back_at,
    undoCounts: readUndoCounts(row.undo_counts),
  };
}
