import type { SupabaseClient } from "@supabase/supabase-js";

import { linkCustomerToAuthUser } from "@/lib/auth/customer-identity";
import { getAuthUser } from "@/lib/auth/user";
import { listOwnFittings } from "@/lib/fitting-import/records";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Customer } from "@/lib/types/ecommerce";

import { loadCustomerPillow, type PillowFittingAnswers } from "./load";
import type { CustomerPillowView, OwnPillowView } from "./view";

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
          : pillow.link?.readjusted
            ? pillow.link.linkedAt
            : null,
    readjusted: pillow.source === "linked" && pillow.link?.readjusted === true,
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

export async function loadOwnPillow(
  admin: SupabaseClient,
  customerId: string,
  fittings: readonly PillowFittingAnswers[],
): Promise<OwnPillowView | null> {
  const read = await loadCustomerPillow(admin, customerId, fittings);
  if (!read.ok) throw new Error(read.error);
  return ownPillowView(read.pillow);
}

export async function loadSignedInPillowOwner(customer: Customer | null): Promise<{ name: string } | null> {
  if (!customer) return null;
  try {
    const read = await loadCustomerPillow(supabaseAdmin(), customer.id, await listOwnFittings(customer.id));
    if (!read.ok || read.pillow.ownership === null) return null;
    return { name: [customer.first_name, customer.last_name].filter(Boolean).join(" ") };
  } catch {
    return null;
  }
}

export async function loadSignedInCustomer(): Promise<Customer | null> {
  try {
    const user = await getAuthUser();
    return user?.email ? await linkCustomerToAuthUser(user) : null;
  } catch {
    return null;
  }
}
