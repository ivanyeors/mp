"use server";

import { assertAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { getWorkingAs } from "@/lib/staff/working-as";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { DateOrder } from "@/lib/fitting-import/google-form-csv";
import { existingFromMatches, lookupKeys, NO_EXISTING, normaliseRows, planRows, type IndexedRawRow, type PreviewMatchRow } from "@/lib/fitting-import/plan";
import { readPreviewChunk, type PreviewChunkResponse } from "@/lib/fitting-import/preview";
import {
  importRows,
  readApplyChunk,
  readFinishResult,
  readImportResult,
  readStartInput,
  skippedTotal,
  UNDO_CONFIRMATION,
  type ApplyChunkResponse,
  type ApplyRawRow,
  type BatchCounts,
  type FinishResponse,
  type StartImportInput,
} from "@/lib/fitting-import/apply";
import { readUndoCounts, type UndoCounts } from "@/lib/fitting-import/batches";

/**
 * Customers → Import fittings (ADR 0042).
 *
 * Every action checks `customer-import`, as the Shopify import does: the
 * import creates Customers, and Manager and Staff hold `customers`. The
 * browser sends rows, a chunk at a time; the file itself is never uploaded or
 * stored. Rows are re-read here from their raw cells, and the browser's own
 * reading is not trusted. No answer carries a customer's PII: the browser
 * already holds the rows, and looks each one up by its index.
 *
 * Writes go through SQL functions only, each one transaction, executable by
 * the service role alone (20261101100000_customer_fittings.sql). The one
 * insert here is the batch itself.
 */

/** Preview one chunk against live rows. Reads only: each row's outcome, never its contents. */
export async function previewFittingImport(rows: IndexedRawRow[], order: DateOrder): Promise<PreviewChunkResponse> {
  await assertAdmin("customer-import");

  const chunk = readPreviewChunk(rows, order);
  if (!chunk.ok) return chunk;

  const normalised = normaliseRows(chunk.rows, chunk.order);
  const { emails, phones, keys } = lookupKeys(normalised);
  let existing = NO_EXISTING;
  if (keys.length) {
    const { data, error } = await supabaseAdmin().rpc("fitting_import_preview_matches", {
      p_emails: emails,
      p_phones: phones,
      p_keys: keys,
    });
    if (error) return { ok: false, error: `Could not read existing customers: ${error.message}` };
    existing = existingFromMatches((data ?? []) as PreviewMatchRow[]);
  }
  return { ok: true, results: planRows(normalised, existing) };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_BATCH = { ok: false as const, error: "That import does not exist." };

export type StartImportResponse =
  | { ok: true; batch: { id: string; rowsDone: number; rowsTotal: number } }
  | { ok: false; error: string };

/**
 * Record a new batch: the file's name and SHA-256, its row count and date
 * order, with who ran it. A file that already has a batch that is not undone
 * cannot start another: an applied one is not imported twice, and a stopped
 * one is continued instead.
 */
export async function startFittingImport(input: StartImportInput): Promise<StartImportResponse> {
  const ctx = await assertAdmin("customer-import");

  const start = readStartInput(input);
  if (!start.ok) return start;

  const workingAs = await getWorkingAs(ctx.memberId);
  const { data, error } = await supabaseAdmin()
    .from("fitting_import_batches")
    .insert({ ...start.row, run_by_user_id: ctx.userId, run_by_profile_id: workingAs?.id ?? null })
    .select("id, rows_done, rows_total")
    .single();
  if (error?.code === "23505") {
    return { ok: false, error: "This file already has an import. Reload the page to continue or review it." };
  }
  if (error || !data) return { ok: false, error: `Could not start the import: ${error?.message ?? "no answer"}` };
  return { ok: true, batch: { id: data.id as string, rowsDone: data.rows_done as number, rowsTotal: data.rows_total as number } };
}

/**
 * Write one chunk of up to 100 rows, in file order from `startIndex`. Each
 * row is read with the batch's own date order, never the browser's. The SQL
 * function re-decides every row, adds the outcomes to the batch, and refuses
 * a chunk that does not start at the batch's `rows_done`.
 */
export async function applyFittingImportChunk(
  batchId: string,
  startIndex: number,
  rows: ApplyRawRow[],
): Promise<ApplyChunkResponse> {
  await assertAdmin("customer-import");
  if (typeof batchId !== "string" || !UUID.test(batchId)) return NO_BATCH;

  const chunk = readApplyChunk(rows, startIndex);
  if (!chunk.ok) return chunk;

  const db = supabaseAdmin();
  const { data: batch, error: readError } = await db
    .from("fitting_import_batches")
    .select("date_order")
    .eq("id", batchId)
    .maybeSingle();
  if (readError) return { ok: false, error: `Could not read the import: ${readError.message}` };
  if (!batch) return NO_BATCH;

  const { data, error } = await db.rpc("import_fitting_rows", {
    p_batch_id: batchId,
    p_start_index: chunk.startIndex,
    p_rows: importRows(chunk.rows, batch.date_order as DateOrder),
  });
  if (error) return { ok: false, error: `The import stopped: ${error.message}` };
  return readImportResult(data);
}

/** Counts only, never a customer's email or name, nor the file's name. */
const auditCounts = (c: BatchCounts, fittingRecords: number) => ({
  rows_total: c.rowsTotal,
  fitting_records: fittingRecords,
  customers_created: c.created,
  matched_email: c.matchedEmail,
  matched_phone: c.matchedPhone,
  already_imported: c.alreadyImported,
  skipped: skippedTotal(c.skipped),
  skipped_by_reason: c.skipped,
});

/**
 * Reconcile the batch and, when every row is accounted for, mark it applied
 * and record `fitting_import.apply`. A batch that does not reconcile stays
 * unapplied.
 */
export async function finishFittingImport(batchId: string): Promise<FinishResponse> {
  const ctx = await assertAdmin("customer-import");
  if (typeof batchId !== "string" || !UUID.test(batchId)) return NO_BATCH;

  const { data, error } = await supabaseAdmin().rpc("finish_fitting_import", { p_batch_id: batchId });
  if (error) return { ok: false, error: `Could not finish the import: ${error.message}` };
  const result = readFinishResult(data);
  if (result.ok && result.newlyApplied) {
    await recordAdminAction({
      actor: ctx,
      action: "fitting_import.apply",
      entityType: "fitting_import_batch",
      entityId: batchId,
      after: auditCounts(result.counts, result.fittingRecords),
    });
  }
  return result;
}

export type UndoResponse = { ok: true; counts: UndoCounts } | { ok: false; error: string };

/** What undoing the batch would remove and keep. Writes nothing. */
export async function previewFittingImportUndo(batchId: string): Promise<UndoResponse> {
  await assertAdmin("customer-import");
  if (typeof batchId !== "string" || !UUID.test(batchId)) return NO_BATCH;

  const { data, error } = await supabaseAdmin().rpc("preview_fitting_import_undo", { p_batch_id: batchId });
  const counts = readUndoCounts(data);
  if (error || !counts) return { ok: false, error: `Could not check the undo: ${error?.message ?? "no answer"}` };
  return { ok: true, counts };
}

/**
 * Undo the batch, after the operator typed UNDO: remove its Fitting records
 * and the Customers it created that nobody has signed in to or referenced
 * since, and record `fitting_import.undo` with the counts.
 */
export async function undoFittingImport(batchId: string, confirmation: string): Promise<UndoResponse> {
  const ctx = await assertAdmin("customer-import");
  if (typeof batchId !== "string" || !UUID.test(batchId)) return NO_BATCH;
  if (confirmation !== UNDO_CONFIRMATION) return { ok: false, error: `Type ${UNDO_CONFIRMATION} to confirm.` };

  const { data, error } = await supabaseAdmin().rpc("undo_fitting_import", { p_batch_id: batchId });
  const counts = readUndoCounts(data);
  if (error || !counts) return { ok: false, error: `Could not undo the import: ${error?.message ?? "no answer"}` };
  if ((data as { status?: unknown }).status === "undone") {
    await recordAdminAction({
      actor: ctx,
      action: "fitting_import.undo",
      entityType: "fitting_import_batch",
      entityId: batchId,
      after: {
        fittings_removed: counts.fittingsRemoved,
        customers_removed: counts.customersRemoved,
        customers_kept: counts.customersKept,
        kept_signed_in: counts.keptSignedIn,
        kept_referenced: counts.keptReferenced,
      },
    });
  }
  return { ok: true, counts };
}
