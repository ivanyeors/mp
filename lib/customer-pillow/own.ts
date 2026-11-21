import type { SupabaseClient } from "@supabase/supabase-js";

import { linkCustomerToAuthUser } from "@/lib/auth/customer-identity";
import { getAuthUser } from "@/lib/auth/user";
import { listOwnFittings } from "@/lib/fitting-import/records";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Customer } from "@/lib/types/ecommerce";

import { loadCustomerPillow, type PillowFittingAnswers } from "./load";
import { ownPillowView, type OwnPillowView } from "./view";

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
