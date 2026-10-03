/**
 * Staff re-configuration of a live Result.
 *
 * Until now a **Result** could only be configured on its way in: the customer
 * (or Staff, through an **Assist link**) answered the configurator, and Staff
 * confirmed size×tier and the filling mix on the Result detail page — once,
 * while the row was still `held`. After **Assign** the whole build froze, and
 * "the customer wants a Satin cover instead" had no move at all short of
 * cancelling the Result and making them configure again.
 *
 * Rather than grow a second editor inside the Admin Panel, Staff are sent back
 * to the configurator they already know — `/mp-config?result=<id>&edit=1` —
 * seeded from the Result. The pickers, the x-ray, the pricing preview and the
 * size-change recheck are the same components the customer used, so there is
 * exactly one place where a pillow is composed.
 *
 * What comes back is written by `POST /api/results/[id]/reconfigure`, which
 * reprices through `loadAssignedBuild` — the same function Accept charges from
 * — so an edit can never leave the stored `final_amount` describing the old
 * build.
 */

import { getAdminContext } from "@/lib/auth/admin";
import { roleHasPermission } from "@/lib/auth/permissions";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { PillowPlacementRow } from "@/lib/spatial-fillings/core";
import type { FillingItem } from "@/components/configurator/staff-assist-panel";

/** The two open states. Anything else has either not begun or already settled. */
const EDITABLE_STATUSES = ["held", "assigned"] as const;

export type StaffEditableRow = {
  status: string | null;
  order_id: string | null;
  product_type: string | null;
};

export type StaffEditableVerdict =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Whether a Result may still be re-configured. Pure, and shared by the page
 * loader and the write route so the button and the route cannot disagree about
 * what is editable.
 *
 * `held` and `assigned` are the open states (`lib/result-lifecycle`): nothing
 * has been captured, so repricing is free. `accepted` is deliberately excluded
 * — the customer is mid-payment, and a repriced build would move the number
 * under an open Stripe Checkout. An `order_id` means the money already landed
 * and the Order, not the Result, is where a change belongs.
 */
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
  // Mbolster composes through its own schema and its own configurator; this
  // route reopens the Mpillow one, so a bolster Result is left to the existing
  // Admin Panel assignment card rather than silently opened in the wrong editor.
  if ((row.product_type ?? "pillow") !== "pillow") {
    return { ok: false, reason: "Only Mpillow Results can be re-configured here" };
  }
  return { ok: true };
}

export type StaffEditPreference = { item_id: number; category: "cover" | "case" };

/** Everything the configurator needs to reopen a live Result as Staff. */
export type StaffEditResult = {
  id: string;
  status: "held" | "assigned";
  /** Assigned when Staff already confirmed one, else the engine's suggestion. */
  size: "XS" | "S" | "M" | "L" | "XL";
  tier: "basic" | "premium";
  measurements: Record<string, unknown>;
  email: string;
  phone: string;
  discoverySource: string;
  discoverySourceOther: string;
  /** Cover/case already on the Result — re-selected in the pickers, not defaulted. */
  preferences: StaffEditPreference[];
  addonItemIds: number[];
  /** Shipping method SLUG (the column's own shape); mapped to an id client-side. */
  shippingMethodSlug: string | null;
  shippingAddress: Record<string, unknown> | null;
  /** The Staff-composed mix, loaded straight into the x-ray editor. */
  placements: PillowPlacementRow[];
  /** Still-matching catalog template, so an untouched mix keeps its link. */
  fillingTemplateId: number | null;
  /** The placed Items — a neck support is not in the shop's filling list. */
  items: FillingItem[];
  currency: string;
  /** Card hold, when one was taken. The edit never moves it; Accept settles the delta. */
  authorizedAmount: number | null;
  finalAmount: number | null;
};

type PrefLine = { item_id: number; quantity: number; category: string };
type AddonLine = { item_id: number; quantity: number };

/**
 * `/mp-config?result=<id>&edit=1`. Returns null for anything the caller may not
 * re-configure, so the page falls through to the ordinary configurator and a
 * stale or forged link shows nothing about the Result.
 *
 * Staff-only, and narrowed to `results`: `viewer` carries read-only access and
 * must not reach an editor that rewrites a customer's build and its price.
 */
export async function loadStaffEditResult(
  id: string | undefined,
): Promise<StaffEditResult | null> {
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const staff = await getAdminContext();
  if (!staff || !roleHasPermission(staff.role, "results")) return null;

  const admin = supabaseAdmin();
  const { data: row } = await admin
    .from("mp_config_responses")
    .select(
      "id, status, source, product_type, order_id, data, suggested_size, suggested_tier, assigned_size, assigned_tier, filling_template_id, preference_lines, addon_lines, shipping_method, shipping_address, currency, authorized_amount, final_amount, customer_email, customer_phone, discovery_source, discovery_source_other",
    )
    .eq("id", id)
    .maybeSingle();
  if (!row) return null;
  if (!staffEditableResult(row).ok) return null;

  const size = (row.assigned_size ?? row.suggested_size) as StaffEditResult["size"] | null;
  const tier = (row.assigned_tier ?? row.suggested_tier) as StaffEditResult["tier"] | null;
  // Without a size×tier there is no Composed sellable to price or offer options
  // for; the Admin Panel's assignment card is where that first gets chosen.
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
  };
}
