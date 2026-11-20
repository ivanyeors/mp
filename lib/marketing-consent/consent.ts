import type { SupabaseClient } from "@supabase/supabase-js";
import { readReasonsForEvents, type CustomerUnsubscribeReason } from "./unsubscribe-reasons-server";
import { findOrCreateCustomer } from "@/lib/ecommerce/customers";
import {
  isConsentSource,
  marketingEmailState,
  type ConsentBoxSource,
  type ConsentEvent,
  type ConsentSource,
  type MarketingConsentView,
  type MarketingEmailState,
} from "./state";

const HISTORY_LIMIT = 50;

export type SetMarketingEmailResult =
  | { ok: true; changed: boolean }
  | { ok: false; error: string; notFound?: boolean };

export async function setMarketingEmail(
  admin: SupabaseClient,
  input: {
    customerId: string;
    to: Exclude<MarketingEmailState, "not_subscribed">;
    source: Exclude<ConsentSource, "shopify_import" | "import_default" | "shopify_unsubscribed">;
    campaignSendId?: string | null;
  },
): Promise<SetMarketingEmailResult> {
  const { data, error } = await admin.rpc("set_marketing_email", {
    p_customer_id: input.customerId,
    p_to: input.to,
    p_source: input.source,
    ...(input.campaignSendId ? { p_campaign_send_id: input.campaignSendId } : {}),
  });
  if (error) return { ok: false, error: error.message, notFound: /not found/i.test(error.message) };
  return { ok: true, changed: data === true };
}

export async function recordBoxConsent(
  admin: SupabaseClient,
  customerId: string,
  ticked: boolean,
  source: ConsentBoxSource,
): Promise<void> {
  if (!ticked) return;
  try {
    const res = await setMarketingEmail(admin, { customerId, to: "subscribed", source });
    if (!res.ok) console.error(`[${source}] marketing consent not recorded:`, res.error);
  } catch (e) {
    console.error(`[${source}] marketing consent not recorded:`, e instanceof Error ? e.message : e);
  }
}

export function recordCheckoutConsent(admin: SupabaseClient, customerId: string, ticked: boolean): Promise<void> {
  return recordBoxConsent(admin, customerId, ticked, "checkout");
}

export async function recordBoxConsentByEmail(
  admin: SupabaseClient,
  email: string,
  ticked: boolean,
  source: Exclude<ConsentBoxSource, "checkout">,
  customerIdFor: (email: string) => Promise<string> = async (e) => (await findOrCreateCustomer(e)).id,
): Promise<void> {
  if (!ticked) return;
  let customerId: string;
  try {
    customerId = await customerIdFor(email);
  } catch (e) {
    console.error(`[${source}] marketing consent not recorded:`, e instanceof Error ? e.message : e);
    return;
  }
  await recordBoxConsent(admin, customerId, true, source);
}

export async function readMarketingEmailState(
  admin: SupabaseClient,
  customerId: string,
): Promise<MarketingEmailState | null> {
  const { data, error } = await admin
    .from("customers")
    .select("id, marketing_email")
    .eq("id", customerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return marketingEmailState(data.marketing_email);
}

type EventRow = { id: number; from_state: string; to_state: string; source: string; created_at: string };

function toEvent(row: EventRow, reasons: ReadonlyMap<number, CustomerUnsubscribeReason>): ConsentEvent | null {
  if (!isConsentSource(row.source)) return null;
  const reason = reasons.get(Number(row.id));
  return {
    fromState: marketingEmailState(row.from_state),
    toState: marketingEmailState(row.to_state),
    source: row.source,
    createdAt: row.created_at,
    ...(reason ? { reason: { reason: reason.reason, text: reason.text } } : {}),
  };
}

export async function readMarketingConsentView(
  admin: SupabaseClient,
  customerId: string,
): Promise<MarketingConsentView | null> {
  const { data: customer, error } = await admin
    .from("customers")
    .select("id, marketing_email, marketing_email_source, marketing_email_updated_at")
    .eq("id", customerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!customer) return null;

  const { data: events, error: eventsError } = await admin
    .from("customer_consent_events")
    .select("id, from_state, to_state, source, created_at")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (eventsError) throw new Error(eventsError.message);
  const rows = (events ?? []) as EventRow[];
  const reasons = await readReasonsForEvents(
    admin,
    rows.filter((r) => r.to_state === "unsubscribed").map((r) => Number(r.id)),
  );

  return {
    state: marketingEmailState(customer.marketing_email),
    source: isConsentSource(customer.marketing_email_source) ? customer.marketing_email_source : null,
    updatedAt: (customer.marketing_email_updated_at as string | null) ?? null,
    history: rows.map((row) => toEvent(row, reasons)).filter((e): e is ConsentEvent => e !== null),
  };
}
