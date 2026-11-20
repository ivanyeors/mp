import { supabaseAdmin } from "@/lib/supabase/server";
import { readDefaultConsentCounts, type DefaultConsentCounts } from "@/lib/customer-migration/default-consent";

export async function loadDefaultConsentCounts(): Promise<DefaultConsentCounts | null> {
  const { data, error } = await supabaseAdmin().rpc("subscribe_migrated_customers", {
    p_unsubscribed: [],
    p_apply: false,
  });
  if (error) return null;
  return readDefaultConsentCounts(data);
}
