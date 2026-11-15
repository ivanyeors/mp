/**
 * Marketing consent: the reads, and the one write path
 * (PRD-shopify-customer-migration slice 07). Server only, through the service
 * role: `customer_consent_events` is server-only, and `set_marketing_email()`
 * is not executable by the customer's own key.
 *
 * These callers change consent, and each names its source:
 *  - the customer, from their Profile, the Customer resolved from the session
 *    (app/[lang]/account/actions.ts), `account`, either way;
 *  - the boxes where people give their email, ticked by default (ADR 0039),
 *    subscribe only, and only someone nobody has asked: at checkout
 *    (app/api/shop/checkout) `checkout`; wherever a customisation takes an
 *    email (lib/crm/customisation-customer.ts: the first question, *Save
 *    without purchasing*, the hold, and Staff on a Result's Customer panel)
 *    `customisation`; on booking an appointment
 *    (app/api/appointments/book, app/api/readjustments/book and /checkout)
 *    `appointment`;
 *  - the one-click unsubscribe link (app/api/email/unsubscribe), `unsubscribe_link`;
 *  - Staff, when the customer asks them to stop
 *    (app/api/shop/customers/[id]/marketing-consent), `support`, unsubscribe only;
 *  - slice 08's complaint webhook, `complaint`.
 * The Shopify import applies `shopify_import` inside its own SQL function, and
 * `subscribe_migrated_customers()` applies `import_default` and
 * `shopify_unsubscribed` (Customers → Import from Shopify; ADR 0039).
 */

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

/** How many changes the Customer page lists. */
const HISTORY_LIMIT = 50;

export type SetMarketingEmailResult =
  | { ok: true; changed: boolean }
  | { ok: false; error: string; notFound?: boolean };

/**
 * Subscribe or unsubscribe. Writes the state, its provenance and exactly one
 * event together, and nothing when the state is already that
 * (`changed: false`), so every caller is idempotent. The function refuses a
 * move the source may not make, such as Staff subscribing someone.
 */
export async function setMarketingEmail(
  admin: SupabaseClient,
  input: {
    customerId: string;
    to: Exclude<MarketingEmailState, "not_subscribed">;
    source: Exclude<ConsentSource, "shopify_import" | "import_default" | "shopify_unsubscribed">;
    /**
     * The campaign send behind it (PRD-campaign-audiences slice 08): from a
     * verified unsubscribe link. Kept on the event only when the send is this
     * Customer's own.
     */
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

/**
 * A box where people give their email (ADR 0039), ticked by default. Ticked,
 * it subscribes a Customer nobody has asked, and nobody else: the SQL skips
 * anyone who unsubscribed or chose already. Unticked, it changes nothing. It
 * never stops the sale, the hold or the booking: a failure is logged and the
 * request goes on.
 */
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

/** The checkout box: its Order already has its Customer. */
export function recordCheckoutConsent(admin: SupabaseClient, customerId: string, ticked: boolean): Promise<void> {
  return recordBoxConsent(admin, customerId, ticked, "checkout");
}

/**
 * A box on a form that takes an email but makes no Customer of its own (a
 * guest's booking; a customisation makes its Customer either way, through
 * lib/crm/customisation-customer.ts, ADR 0051). Ticked, it finds the
 * Customer by the email typed, or creates one, then records as
 * `recordBoxConsent` does. The email is always the one typed on the form, so
 * on a Staff member's device it is the shopper's, never the Staff login's.
 * Unticked, it neither looks up nor creates anyone.
 */
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

/** A Customer's state, or null when there is no such Customer. */
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

/** The Customer page's consent card. Null when there is no such Customer. */
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
  // PRD-crm-retention-loop slice 11: why they unsubscribed, beside the unsubscribe it answers.
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
