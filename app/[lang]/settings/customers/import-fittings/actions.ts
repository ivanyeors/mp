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

export async function previewFittingImportUndo(batchId: string): Promise<UndoResponse> {
  await assertAdmin("customer-import");
  if (typeof batchId !== "string" || !UUID.test(batchId)) return NO_BATCH;

  const { data, error } = await supabaseAdmin().rpc("preview_fitting_import_undo", { p_batch_id: batchId });
  const counts = readUndoCounts(data);
  if (error || !counts) return { ok: false, error: `Could not check the undo: ${error?.message ?? "no answer"}` };
  return { ok: true, counts };
}

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
