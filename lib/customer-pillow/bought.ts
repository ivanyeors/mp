import type { PillowPlacementRow } from "@/lib/spatial-fillings/core";
import { isStaffBuildSnapshot } from "@/lib/staff-orders/build-snapshot";
import { pillowSizeKey, type PillowSizeKey } from "./match";

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

export type BoughtPillow = {
  orderId: string;
  orderItemId: string;
  paidAt: string;
  size: PillowSizeKey | null;
  resultId: string | null;
  templateId: number | null;
  templateName: string | null;
  placements: PillowPlacementRow[];
};

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

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

export function placementRows(value: unknown): PillowPlacementRow[] {
  return (Array.isArray(value) ? value : []).map(placementRow).filter((r): r is PillowPlacementRow => r !== null);
}

export function snapshotPillowBuild(
  snapshot: unknown,
): { resultId: string | null; templateId: number | null; templateName: string | null; placements: PillowPlacementRow[] } | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const s = snapshot as Record<string, unknown>;
  const staffBuild = isStaffBuildSnapshot(snapshot);
  if (s.product_type !== "pillow" || (typeof s.result_id !== "string" && !staffBuild)) return null;
  return {
    resultId: typeof s.result_id === "string" ? s.result_id : null,
    templateId: num(s.filling_template_id),
    templateName: typeof s.filling_template_name === "string" && s.filling_template_name.trim() ? s.filling_template_name : null,
    placements: placementRows(s.filling_placements),
  };
}

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

export type PillowOwnership = "bought_here" | "linked" | "shopify_fitting";

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
