"use server";

import { assertAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { getWorkingAs } from "@/lib/staff/working-as";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  existingFromMatches,
  lookupKeys,
  NO_EXISTING,
  normaliseRows,
  planRows,
  type IndexedRawRow,
  type PreviewMatchRow,
} from "@/lib/customer-migration/plan";
import { readPreviewChunk, type PreviewChunkResponse } from "@/lib/customer-migration/preview";
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
} from "@/lib/customer-migration/apply";
import { readUndoCounts, type UndoCounts } from "@/lib/customer-migration/batches";
import {
  readDefaultConsentCounts,
  readEmailList,
  type DefaultConsentCounts,
} from "@/lib/customer-migration/default-consent";

export async function previewShopifyImport(rows: IndexedRawRow[]): Promise<PreviewChunkResponse> {
  await assertAdmin("customer-import");

  const chunk = readPreviewChunk(rows);
  if (!chunk.ok) return chunk;

  const normalised = normaliseRows(chunk.rows);
  const { emails, shopifyIds } = lookupKeys(normalised);
  let existing = NO_EXISTING;
  if (emails.length || shopifyIds.length) {
    const { data, error } = await supabaseAdmin().rpc("customer_import_preview_matches", {
      p_emails: emails,
      p_shopify_ids: shopifyIds,
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

export async function startShopifyImport(input: StartImportInput): Promise<StartImportResponse> {
  const ctx = await assertAdmin("customer-import");

  const start = readStartInput(input, new Date().toISOString().slice(0, 10));
  if (!start.ok) return start;

  const workingAs = await getWorkingAs(ctx.memberId);
  const { data, error } = await supabaseAdmin()
    .from("customer_import_batches")
    .insert({
      ...start.row,
      source: "shopify_customers_csv",
      run_by_user_id: ctx.userId,
      run_by_profile_id: workingAs?.id ?? null,
    })
    .select("id, rows_done, rows_total")
    .single();
  if (error?.code === "23505") {
    return { ok: false, error: "This file already has an import. Reload the page to continue or review it." };
  }
  if (error || !data) return { ok: false, error: `Could not start the import: ${error?.message ?? "no answer"}` };
  return { ok: true, batch: { id: data.id as string, rowsDone: data.rows_done as number, rowsTotal: data.rows_total as number } };
}

export async function applyShopifyImportChunk(
  batchId: string,
  startIndex: number,
  rows: ApplyRawRow[],
): Promise<ApplyChunkResponse> {
  await assertAdmin("customer-import");
  if (typeof batchId !== "string" || !UUID.test(batchId)) return NO_BATCH;

  const chunk = readApplyChunk(rows, startIndex);
  if (!chunk.ok) return chunk;

  const { data, error } = await supabaseAdmin().rpc("import_shopify_customers", {
    p_batch_id: batchId,
    p_start_index: chunk.startIndex,
    p_rows: importRows(chunk.rows),
  });
  if (error) return { ok: false, error: `The import stopped: ${error.message}` };
  return readImportResult(data);
}

const auditCounts = (c: BatchCounts) => ({
  rows_total: c.rowsTotal,
  created: c.created,
  merged: c.merged,
  already_imported: c.alreadyImported,
  skipped: skippedTotal(c.skipped),
  skipped_by_reason: c.skipped,
});

export async function finishShopifyImport(batchId: string): Promise<FinishResponse> {
  const ctx = await assertAdmin("customer-import");
  if (typeof batchId !== "string" || !UUID.test(batchId)) return NO_BATCH;

  const { data, error } = await supabaseAdmin().rpc("finish_shopify_import", { p_batch_id: batchId });
  if (error) return { ok: false, error: `Could not finish the import: ${error.message}` };
  const result = readFinishResult(data);
  if (result.ok && result.newlyApplied) {
    await recordAdminAction({
      actor: ctx,
      action: "customer_import.apply",
      entityType: "customer_import_batch",
      entityId: batchId,
      after: auditCounts(result.counts),
    });
  }
  return result;
}

export type UndoResponse = { ok: true; counts: UndoCounts } | { ok: false; error: string };

export async function previewShopifyImportUndo(batchId: string): Promise<UndoResponse> {
  await assertAdmin("customer-import");
  if (typeof batchId !== "string" || !UUID.test(batchId)) return NO_BATCH;

  const { data, error } = await supabaseAdmin().rpc("preview_shopify_import_undo", { p_batch_id: batchId });
  const counts = readUndoCounts(data);
  if (error || !counts) return { ok: false, error: `Could not check the undo: ${error?.message ?? "no answer"}` };
  return { ok: true, counts };
}

export async function undoShopifyImport(batchId: string, confirmation: string): Promise<UndoResponse> {
  const ctx = await assertAdmin("customer-import");
  if (typeof batchId !== "string" || !UUID.test(batchId)) return NO_BATCH;
  if (confirmation !== UNDO_CONFIRMATION) return { ok: false, error: `Type ${UNDO_CONFIRMATION} to confirm.` };

  const { data, error } = await supabaseAdmin().rpc("undo_shopify_import", { p_batch_id: batchId });
  const counts = readUndoCounts(data);
  if (error || !counts) return { ok: false, error: `Could not undo the import: ${error?.message ?? "no answer"}` };
  if ((data as { status?: unknown }).status === "undone") {
    await recordAdminAction({
      actor: ctx,
      action: "customer_import.undo",
      entityType: "customer_import_batch",
      entityId: batchId,
      after: {
        removed: counts.removed,
        unlinked: counts.unlinked,
        kept: counts.kept,
        kept_claimed: counts.keptClaimed,
        kept_referenced: counts.keptReferenced,
      },
    });
  }
  return { ok: true, counts };
}

export type DefaultConsentResponse = { ok: true; counts: DefaultConsentCounts } | { ok: false; error: string };

export async function previewDefaultConsent(emails: string[]): Promise<DefaultConsentResponse> {
  await assertAdmin("customer-import");
  const list = readEmailList(emails);
  if (!list.ok) return list;

  const { data, error } = await supabaseAdmin().rpc("subscribe_migrated_customers", {
    p_unsubscribed: list.emails,
    p_apply: false,
  });
  const counts = readDefaultConsentCounts(data);
  if (error || !counts) return { ok: false, error: `Could not count the imported customers: ${error?.message ?? "no answer"}` };
  return { ok: true, counts };
}

export async function subscribeImportedByDefault(emails: string[]): Promise<DefaultConsentResponse> {
  const ctx = await assertAdmin("customer-import");
  const list = readEmailList(emails);
  if (!list.ok) return list;

  const { data, error } = await supabaseAdmin().rpc("subscribe_migrated_customers", {
    p_unsubscribed: list.emails,
    p_apply: true,
  });
  const counts = readDefaultConsentCounts(data);
  if (error || !counts) return { ok: false, error: `Could not subscribe the imported customers: ${error?.message ?? "no answer"}` };
  await recordAdminAction({
    actor: ctx,
    action: "customer_consent.import_default",
    entityType: "customer_import",
    after: {
      subscribed: counts.subscribed ?? 0,
      unsubscribed: counts.unsubscribed ?? 0,
      imported: counts.imported,
      listed: counts.listed,
    },
  });
  return { ok: true, counts };
}
