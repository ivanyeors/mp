/** Strip or reject filling lines on composed sellable and warehouse BOM writes (ADR 0003). */

import type { SupabaseClient } from "@supabase/supabase-js";

export type BomLineInput = { item_id: number; quantity: number };

export type LineWithCategory = { item_id: number; quantity: number; category: string };

/** Resolve item categories for BOM lines. */
export async function lookupItemCategories(
  admin: SupabaseClient,
  itemIds: number[],
): Promise<{ ok: true; byId: Map<number, string> } | { ok: false; error: string }> {
  if (itemIds.length === 0) return { ok: true, byId: new Map() };
  const { data, error } = await admin.from("items").select("id,category").in("id", itemIds);
  if (error) return { ok: false, error: error.message };
  const byId = new Map((data ?? []).map((r) => [Number(r.id), String(r.category)]));
  const missing = itemIds.filter((id) => !byId.has(id));
  if (missing.length) {
    return { ok: false, error: `Unknown item_id: ${missing.join(", ")}` };
  }
  return { ok: true, byId };
}

/** Drop filling-category lines before composed sellable / Apply upserts. Pure. */
export function stripFillingLines<T extends BomLineInput>(
  lines: T[],
  categoryByItemId: ReadonlyMap<number, string>,
): T[] {
  return lines.filter((l) => categoryByItemId.get(l.item_id) !== "filling");
}

/** Reject warehouse template saves that include fillings. Pure. */
export function rejectFillingLines(
  lines: Array<{ item_id: number; category: string }>,
): { ok: true } | { ok: false; error: string } {
  const fillingIds = lines.filter((l) => l.category === "filling").map((l) => l.item_id);
  if (fillingIds.length === 0) return { ok: true };
  return {
    ok: false,
    error: `Warehouse templates must not include filling items (rejected item_id: ${fillingIds.join(", ")})`,
  };
}
