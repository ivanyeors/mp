import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCustomerEntry, type CustomerEntry } from "@/lib/analytics/journey/first-touch";
import { getDiscoverySourceCatalog, resolveDiscoverySourceLabel } from "@/lib/discovery-source";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";

export type CustomerEntryView = CustomerEntry & {
  told: string | null;
};

export type CustomerEntryResult = { ok: true; view: CustomerEntryView } | { ok: false };

async function readDiscoverySource(db: SupabaseClient, customerId: string): Promise<string | null> {
  const { data, error } = await db
    .from("mp_config_responses")
    .select("discovery_source, discovery_source_other")
    .eq("customer_id", customerId)
    .not("discovery_source", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.discovery_source) return null;
  const other = (data.discovery_source_other as string | null)?.trim();
  if (other) return other;
  return resolveDiscoverySourceLabel(await getDiscoverySourceCatalog(), data.discovery_source as string, DEFAULT_LOCALE);
}

export async function readCustomerEntry(
  db: SupabaseClient,
  customer: { id: string; email?: string | null },
  may: { results: boolean },
): Promise<CustomerEntryResult> {
  try {
    const [entry, told] = await Promise.all([
      loadCustomerEntry(db, { customerId: customer.id, email: customer.email }),
      may.results ? readDiscoverySource(db, customer.id).catch(() => null) : Promise.resolve(null),
    ]);
    return { ok: true, view: { ...entry, told } };
  } catch {
    return { ok: false };
  }
}
