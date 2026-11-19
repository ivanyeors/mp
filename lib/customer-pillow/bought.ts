import type { PillowPlacementRow } from "@/lib/spatial-fillings/core";
import { pillowSizeKey, type PillowSizeKey } from "./match";

/**
 * The pillows a Customer bought here, and whether anything says they bought
 * one at all (ADR 0042 k). Pure, so the Customer page and the Profile read one
 * rule.
 */

/** A counted Order's pillow line, as `customer_purchase_lines` lists it. */
export type PillowPurchaseLine = {
  order_id: string;
  order_item_id: string;
  paid_at: string | null;
  size: string | null;
};

export type PillowOrderItem = {
  id: string;
  quantity: number | string | null;
  returned_quantity: number | string | null;
  customization_snapshot: unknown;
};

/** A pillow bought here that they still have. */
export type BoughtPillow = {
  orderId: string;
  orderItemId: string;
  paidAt: string;
  size: PillowSizeKey | null;
  /** The Result the line was built from; null for a line from no Result. */
  resultId: string | null;
  /** The Filling Template the build was made from at Accept; null for a custom mix. */
  templateId: number | null;
  templateName: string | null;
  /** The build frozen on the line at Accept: empty for a line from before spatial builds, or not from a Result. */
  placements: PillowPlacementRow[];
};

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** One pillow cell row of a snapshot's `filling_placements`; a bolster slot row or anything malformed is null. */
function placementRow(value: unknown): PillowPlacementRow | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  const slot = num(r.slot);
  const itemId = num(r.item_id);
  if (typeof r.section !== "string" || typeof r.sub_section !== "string" || slot === null || itemId === null) return null;
  const opt = (v: unknown) => (v === undefined || v === null ? null : num(v));
  return {
    section: r.section,
    sub_section: r.sub_section,
    slot,
    item_id: itemId,
    row_index: opt(r.row_index),
    insert_order: opt(r.insert_order),
    offset_x_mm: opt(r.offset_x_mm),
    offset_y_mm: opt(r.offset_y_mm),
  };
}

/**
 * Pillow placement rows out of stored JSON: an order line's frozen build, or a
 * Re-adjustment's mix on the Staff link (ADR 0042 l). Anything that is not a
 * pillow cell row is dropped.
 */
export function placementRows(value: unknown): PillowPlacementRow[] {
  return (Array.isArray(value) ? value : []).map(placementRow).filter((r): r is PillowPlacementRow => r !== null);
}

/** The pillow build an order line froze at Accept (`ResultOrderBuildSnapshot`), or null when it holds none. */
export function snapshotPillowBuild(
  snapshot: unknown,
): { resultId: string; templateId: number | null; templateName: string | null; placements: PillowPlacementRow[] } | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const s = snapshot as Record<string, unknown>;
  if (s.product_type !== "pillow" || typeof s.result_id !== "string") return null;
  return {
    resultId: s.result_id,
    templateId: num(s.filling_template_id),
    templateName: typeof s.filling_template_name === "string" && s.filling_template_name.trim() ? s.filling_template_name : null,
    placements: placementRows(s.filling_placements),
  };
}

/**
 * The pillows bought here that they still have (some unit not returned),
 * latest first. A line whose Order the view counts but whose item is missing
 * is left out: nothing says what they kept.
 */
export function boughtPillows(lines: readonly PillowPurchaseLine[], items: readonly PillowOrderItem[]): BoughtPillow[] {
  const byId = new Map(items.map((i) => [String(i.id), i]));
  return lines
    .flatMap((line) => {
      const item = byId.get(String(line.order_item_id));
      if (!item || !line.paid_at) return [];
      const units = (num(item.quantity) ?? 0) - (num(item.returned_quantity) ?? 0);
      if (units <= 0) return [];
      const build = snapshotPillowBuild(item.customization_snapshot);
      return [
        {
          orderId: String(line.order_id),
          orderItemId: String(line.order_item_id),
          paidAt: line.paid_at,
          size: pillowSizeKey(line.size),
          resultId: build?.resultId ?? null,
          templateId: build?.templateId ?? null,
          templateName: build?.templateName ?? null,
          placements: build?.placements ?? [],
        },
      ];
    })
    .sort((a, b) =>
      a.paidAt === b.paidAt ? (a.orderItemId < b.orderItemId ? 1 : -1) : Date.parse(b.paidAt) - Date.parse(a.paidAt),
    );
}

/** What says a Customer has a pillow, the strongest first. */
export type PillowOwnership = "bought_here" | "linked" | "shopify_fitting";

/**
 * Why their Profile may show their pillow (ADR 0042 k, owner 2026-11-05), or
 * null when nothing says they bought one: a pillow bought here they still
 * have, a Staff link (Staff record the pillow they have), or, from before this
 * platform, a Fitting record and at least one Shopify order. The Shopify
 * export counts orders and spend but not what was in them; a fitting with an
 * order is read as the in-store purchase it almost always was.
 */
export function pillowOwnership(facts: {
  boughtHere: boolean;
  linked: boolean;
  shopifyOrders: number | null;
  fittings: number;
}): PillowOwnership | null {
  if (facts.boughtHere) return "bought_here";
  if (facts.linked) return "linked";
  if ((facts.shopifyOrders ?? 0) > 0 && facts.fittings > 0) return "shopify_fitting";
  return null;
}
