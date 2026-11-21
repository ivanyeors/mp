import { listCustomerFittings } from "@/lib/fitting-import/records";
import { supabaseAdmin } from "@/lib/supabase/server";
import { loadCustomerPillow } from "./load";

export async function reloadCustomerPillow(customerId: string) {
  const fittings = await listCustomerFittings(customerId).catch(() => []);
  return loadCustomerPillow(supabaseAdmin(), customerId, fittings);
}
