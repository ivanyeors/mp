import { getAdminContext } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { PillowPlacementRow } from "@/lib/spatial-fillings/core";
import type { FillingItem } from "@/components/configurator/staff-assist-panel";
import { resultCouponOf, type ResultCoupon } from "@/lib/results/discount";

const EDITABLE_STATUSES = ["held", "assigned"] as const;

export type StaffEditableRow = {
  status: string | null;
  order_id: string | null;
  product_type: string | null;
};

export type StaffEditableVerdict =
  | { ok: true }
  | { ok: false; reason: string };

export function staffEditableResult(row: StaffEditableRow): StaffEditableVerdict {
  if (row.order_id) {
    return { ok: false, reason: "This Result is already an Order — change it there" };
  }
  if (!row.status || !EDITABLE_STATUSES.includes(row.status as (typeof EDITABLE_STATUSES)[number])) {
    return {
      ok: false,
      reason: `Cannot re-configure a Result that is ${row.status ?? "still a draft"}`,
    };
  }
  if ((row.product_type ?? "pillow") !== "pillow") {
    return { ok: false, reason: "Only Mpillow Results can be re-configured here" };
  }
  return { ok: true };
}

export type StaffEditPreference = { item_id: number; category: "cover" | "case" };

export type StaffEditResult = {
  id: string;
  status: "held" | "assigned";
  size: "XS" | "S" | "M" | "L" | "XL";
  tier: "basic" | "premium";
  measurements: Record<string, unknown>;
  email: string;
  phone: string;
  discoverySource: string;
  discoverySourceOther: string;
  preferences: StaffEditPreference[];
  addonItemIds: number[];
  shippingMethodSlug: string | null;
  shippingAddress: Record<string, unknown> | null;
  placements: PillowPlacementRow[];
  fillingTemplateId: number | null;
  items: FillingItem[];
  currency: string;
  authorizedAmount: number | null;
  finalAmount: number | null;
  coupon: ResultCoupon | null;
};

type PrefLine = { item_id: number; quantity: number; category: string };
type AddonLine = { item_id: number; quantity: number };

export async function loadStaffEditResult(
  id: string | undefined,
): Promise<StaffEditResult | null> {
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const staff = await getAdminContext();
  if (!staff || !hasPermission(staff, "results")) return null;

  const admin = supabaseAdmin();
  const { data: row } = await admin
    .from("mp_config_responses")
    .select(
      "id, status, source, product_type, order_id, data, suggested_size, suggested_tier, assigned_size, assigned_tier, filling_template_id, preference_lines, addon_lines, shipping_method, shipping_address, currency, authorized_amount, final_amount, customer_email, customer_phone, discovery_source, discovery_source_other, coupon_code, coupon_terms",
    )
    .eq("id", id)
    .maybeSingle();
  if (!row) return null;
  if (!staffEditableResult(row).ok) return null;

  const size = (row.assigned_size ?? row.suggested_size) as StaffEditResult["size"] | null;
  const tier = (row.assigned_tier ?? row.suggested_tier) as StaffEditResult["tier"] | null;
  if (!size || !tier) return null;

  const { data: placements } = await admin
    .from("result_filling_placements")
    .select("section, sub_section, slot, item_id, row_index, insert_order, offset_x_mm, offset_y_mm")
    .eq("result_id", id)
    .order("slot");

  const placedIds = [...new Set((placements ?? []).map((p) => p.item_id as number))];
  const { data: items } = placedIds.length
    ? await admin
        .from("items")
        .select("id, name, subtype, size, category, item_prices(msrp)")
        .in("id", placedIds)
    : { data: [] };

  const preferenceLines = (row.preference_lines ?? []) as PrefLine[];
  const addonLines = (row.addon_lines ?? []) as AddonLine[];

  return {
    id: row.id as string,
    status: row.status as "held" | "assigned",
    size,
    tier,
    measurements: (row.data ?? {}) as Record<string, unknown>,
    email: row.customer_email ?? "",
    phone: row.customer_phone ?? "",
    discoverySource: row.discovery_source ?? "",
    discoverySourceOther: row.discovery_source_other ?? "",
    preferences: preferenceLines
      .filter((l) => l.category === "cover" || l.category === "case")
      .map((l) => ({ item_id: l.item_id, category: l.category as "cover" | "case" })),
    addonItemIds: addonLines.map((l) => l.item_id),
    shippingMethodSlug: row.shipping_method ?? null,
    shippingAddress: (row.shipping_address ?? null) as Record<string, unknown> | null,
    placements: (placements ?? []) as PillowPlacementRow[],
    fillingTemplateId:
      row.filling_template_id != null ? Number(row.filling_template_id) : null,
    items: (items ?? []).map(({ item_prices, ...item }) => ({
      ...item,
      msrp: (Array.isArray(item_prices) ? item_prices[0] : item_prices)?.msrp ?? null,
    })),
    currency: row.currency ?? "SGD",
    authorizedAmount: row.authorized_amount != null ? Number(row.authorized_amount) : null,
    finalAmount: row.final_amount != null ? Number(row.final_amount) : null,
    coupon: resultCouponOf(row.coupon_code, row.coupon_terms),
  };
}
