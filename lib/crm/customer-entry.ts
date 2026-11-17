/**
 * How a Customer found us, for their page: the Entry source of their first
 * Visit (machine-captured), the Visit behind their first Order, and beside
 * them, never merged, the **Discovery source** they gave on a Result.
 *
 * Server-only. A Discovery source comes off a Result, so it is read only for
 * a viewer who may see Results (ADR 0028 (b)).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCustomerEntry, type CustomerEntry } from "@/lib/analytics/journey/first-touch";
import { getDiscoverySourceCatalog, resolveDiscoverySourceLabel } from "@/lib/discovery-source";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";

export type CustomerEntryView = CustomerEntry & {
  /** Their own answer to "how did you hear about us", from their earliest Result that has one. */
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
      // What they said is a bonus: failing to read it must not hide what we recorded.
      may.results ? readDiscoverySource(db, customer.id).catch(() => null) : Promise.resolve(null),
    ]);
    return { ok: true, view: { ...entry, told } };
  } catch {
    return { ok: false };
  }
}
