import { supabaseAdmin } from "@/lib/supabase/server";
import { readDefaultConsentCounts, type DefaultConsentCounts } from "@/lib/customer-migration/default-consent";

/**
 * Where the imported customers stand on marketing email, for the *Subscribe
 * imported customers* card (ADR 0037): the same function the card runs, with
 * no list and nothing written. Null when the read fails, so the card says so.
 */
export async function loadDefaultConsentCounts(): Promise<DefaultConsentCounts | null> {
  const { data, error } = await supabaseAdmin().rpc("subscribe_migrated_customers", {
    p_unsubscribed: [],
    p_apply: false,
  });
  if (error) return null;
  return readDefaultConsentCounts(data);
}
