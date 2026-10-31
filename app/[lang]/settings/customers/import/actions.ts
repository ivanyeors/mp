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

/**
 * Customers → Import from Shopify (PRD-shopify-customer-migration, slices 02
 * and 03; ADR 0029).
 *
 * Every action checks `customer-import`, never `customers`, which Manager and
 * Staff also hold; `customer-import` requires `customers-edit`. The browser
 * sends rows, a chunk at a time; the file itself is never uploaded or stored.
 * Rows are re-read here from their raw cells, and the browser's own reading
 * is not trusted. No answer carries a customer's PII: the browser already
 * holds the rows, and looks each one up by its index.
 *
 * Writes go through SQL functions only, each one transaction, executable by
 * the service role alone (20261020110000_customer_import_apply.sql). The one
 * insert here is the Import batch itself.
 */

/**
 * Preview one chunk against live rows (slice 02). Reads only: it answers each
 * row with its outcome and repairs.
 */
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

/**
 * Record a new Import batch: the file's name and SHA-256, its row count, the
 * export's date and whether addresses come in, with who ran it. A file that
 * already has a batch that is not undone cannot start another: an applied one
 * is not imported twice, and a stopped one is continued instead.
 */
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

/**
 * Write one chunk of up to 100 rows, in file order from `startIndex`. The SQL
 * function re-decides every row against the rows as they are now, adds the
 * outcomes to the batch, and refuses a chunk that does not start at the
 * batch's `rows_done`.
 */
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

/** Counts only, never a customer's email or name, nor the file's name. */
const auditCounts = (c: BatchCounts) => ({
  rows_total: c.rowsTotal,
  created: c.created,
  merged: c.merged,
  already_imported: c.alreadyImported,
  skipped: skippedTotal(c.skipped),
  skipped_by_reason: c.skipped,
});

/**
 * Reconcile the batch and, when every row is accounted for, mark it applied
 * and record `customer_import.apply`. A batch that does not reconcile stays
 * unapplied.
 */
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

/** What undoing the batch would remove, unlink and keep. Writes nothing. */
export async function previewShopifyImportUndo(batchId: string): Promise<UndoResponse> {
  await assertAdmin("customer-import");
  if (typeof batchId !== "string" || !UUID.test(batchId)) return NO_BATCH;

  const { data, error } = await supabaseAdmin().rpc("preview_shopify_import_undo", { p_batch_id: batchId });
  const counts = readUndoCounts(data);
  if (error || !counts) return { ok: false, error: `Could not check the undo: ${error?.message ?? "no answer"}` };
  return { ok: true, counts };
}

/**
 * Undo the batch, after the operator typed UNDO: remove the Customers it
 * created that nobody has claimed or referenced since, unlink the ones it
 * merged into, and record `customer_import.undo` with the counts.
 */
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

/**
 * What subscribing the imported customers would do, given Shopify's
 * unsubscribed list (ADR 0037). Writes nothing. An empty list is the owner
 * saying nobody unsubscribed in Shopify; the page asks them to say so.
 */
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

/**
 * Unsubscribe everyone on Shopify's unsubscribed list, then subscribe every
 * other imported customer nobody has asked, as `import_default`, in one
 * transaction, and record `customer_consent.import_default` with the counts.
 * Run again after a later import: it changes only who is new.
 */
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
