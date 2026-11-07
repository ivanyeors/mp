import { listCustomerFittings } from "@/lib/fitting-import/records";
import { supabaseAdmin } from "@/lib/supabase/server";
import { loadCustomerPillow } from "./load";

/**
 * The pillow as the Customer page draws it, read again after a change: the
 * fittings too, so the match is current. Server-only; the pillow routes answer
 * a link, an unlink or a Re-adjustment with it.
 */
export async function reloadCustomerPillow(customerId: string) {
  const fittings = await listCustomerFittings(customerId).catch(() => []);
  return loadCustomerPillow(supabaseAdmin(), customerId, fittings);
}
