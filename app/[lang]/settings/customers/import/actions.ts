"use server";

import { assertAdmin } from "@/lib/auth/admin";
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

/**
 * Preview one chunk of a Shopify customer export against live rows
 * (PRD-shopify-customer-migration, slice 02). Reads only: it writes nothing,
 * stores no file, and answers each row with its outcome and repairs, never
 * the row's PII. The browser already holds the row.
 *
 * Every chunk is checked against `customer-import`, never `customers`, which
 * Manager and Staff also hold. The rows are re-read here from their raw cells;
 * the browser's own reading is not trusted.
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
