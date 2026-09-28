import { supabaseAdmin } from "@/lib/supabase/server";
import { requireResultAccess } from "@/lib/results/access";
import { secretMatches } from "@/lib/auth/secret";
import { needsCustomerFinish } from "@/lib/results/needs-customer-finish";
import type { PillowPlacementRow } from "@/lib/spatial-fillings/core";
import type { FillingItem } from "@/components/configurator/staff-assist-panel";

/** Everything the finish page needs to reopen an assigned build (ADR 0017). */
export type ResumeFinish = {
  id: string;
  /** Echoed to the finish and accept routes; null when access came from a signed-in match. */
  token: string | null;
  measurements: Record<string, unknown>;
  size: "XS" | "S" | "M" | "L" | "XL";
  tier: "basic" | "premium";
  email: string;
  phone: string;
  discoverySource: string;
  discoverySourceOther: string;
  /** The Staff-composed fillings, shown read-only in the x-ray. */
  placements: PillowPlacementRow[];
  /** The placed Items — the shop's filling list has no neck support to label, color or charge. */
  items: FillingItem[];
};

/**
 * `/mp-config?result=<id>&token=<t>`. Returns null for anything that is not
 * an assigned, unfinished, pillow Assisted customisation the caller may open.
 * The page then renders the ordinary configurator, so a stale or forged link
 * shows nothing about the Result.
 */
export async function loadResumeFinish(
  id: string | undefined,
  token: string | undefined,
): Promise<ResumeFinish | null> {
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const admin = supabaseAdmin();
  const { data: row } = await admin
    .from("mp_config_responses")
    .select(
      "id, status, source, product_type, shipping_address, data, assigned_size, assigned_tier, customer_email, customer_phone, discovery_source, discovery_source_other, access_token, customer_id, order_id",
    )
    .eq("id", id)
    .maybeSingle();
  if (!row || row.status !== "assigned" || !needsCustomerFinish(row)) return null;
  if ((row.product_type ?? "pillow") !== "pillow" || !row.assigned_size || !row.assigned_tier) {
    return null;
  }
  const access = await requireResultAccess(row, token ?? null);
  if (!access.ok) return null;

  const { data: placements } = await admin
    .from("result_filling_placements")
    .select("section, sub_section, slot, item_id, row_index, offset_x_mm, offset_y_mm")
    .eq("result_id", id)
    .order("slot");

  const placedIds = [...new Set((placements ?? []).map((p) => p.item_id as number))];
  const { data: items } = placedIds.length
    ? await admin
        .from("items")
        .select("id, name, subtype, size, category, item_prices(msrp)")
        .in("id", placedIds)
    : { data: [] };

  return {
    id: row.id,
    token: token && secretMatches(row.access_token ?? undefined, token) ? token : null,
    measurements: (row.data ?? {}) as Record<string, unknown>,
    size: row.assigned_size as ResumeFinish["size"],
    tier: row.assigned_tier as ResumeFinish["tier"],
    email: row.customer_email ?? "",
    phone: row.customer_phone ?? "",
    discoverySource: row.discovery_source ?? "",
    discoverySourceOther: row.discovery_source_other ?? "",
    placements: (placements ?? []) as PillowPlacementRow[],
    items: (items ?? []).map(({ item_prices, ...item }) => ({
      ...item,
      msrp: (Array.isArray(item_prices) ? item_prices[0] : item_prices)?.msrp ?? null,
    })),
  };
}
