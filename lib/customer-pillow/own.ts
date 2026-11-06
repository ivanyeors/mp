import type { SupabaseClient } from "@supabase/supabase-js";

import { loadCustomerPillow, type PillowFittingAnswers } from "./load";
import type { CustomerPillowView, OwnPillowView } from "./view";

/**
 * The Customer's own pillow on their Profile (ADR 0042 k): what the Customer
 * page draws, once something says they bought it (`pillowOwnership`), copied
 * field by field so nothing Staff-only reaches the browser. Not the Staff
 * member who linked it, the match notices, the fitting's codes, or the
 * catalog of templates Change offers.
 */
export function ownPillowView(pillow: CustomerPillowView): OwnPillowView | null {
  if (!pillow.onProfile || pillow.source === "none") return null;
  return {
    source: pillow.source,
    size: pillow.size,
    name: pillow.template?.name ?? null,
    orderNumber: pillow.source === "order" ? (pillow.order?.orderNumber ?? null) : null,
    date:
      pillow.source === "order"
        ? (pillow.order?.paidAt ?? null)
        : pillow.source === "fitting"
          ? (pillow.fitting?.fittedAt ?? null)
          : null,
    placements: pillow.placements.map((p) => ({
      section: p.section,
      sub_section: p.sub_section,
      slot: p.slot,
      item_id: p.item_id,
      row_index: p.row_index ?? null,
      insert_order: p.insert_order ?? null,
      offset_x_mm: p.offset_x_mm ?? null,
      offset_y_mm: p.offset_y_mm ?? null,
    })),
    items: pillow.items.map((i) => ({ id: i.id, name: i.name, subtype: i.subtype, size: i.size, category: i.category })),
    colorOverrides: pillow.colorOverrides,
    dimensionOverrides: pillow.dimensionOverrides,
  };
}

/**
 * Read with the service role, by the Customer the session is linked to and
 * never by anything the request names. `fittings` are the Profile's own
 * (`listOwnFittings`), newest first. Null when nothing says they bought a
 * pillow, or there is nothing to draw; throws when the read fails.
 */
export async function loadOwnPillow(
  admin: SupabaseClient,
  customerId: string,
  fittings: readonly PillowFittingAnswers[],
): Promise<OwnPillowView | null> {
  const read = await loadCustomerPillow(admin, customerId, fittings);
  if (!read.ok) throw new Error(read.error);
  return ownPillowView(read.pillow);
}
