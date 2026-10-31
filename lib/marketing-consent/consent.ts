/**
 * Marketing consent: the reads, and the one write path
 * (PRD-shopify-customer-migration slice 07). Server only, through the service
 * role: `customer_consent_events` is server-only, and `set_marketing_email()`
 * is not executable by the customer's own key.
 *
 * Five callers change consent, and each names its source:
 *  - the customer, from their Profile, the Customer resolved from the session
 *    (app/[lang]/account/actions.ts), `account`, either way;
 *  - the box at checkout, ticked by default (app/api/shop/checkout),
 *    `checkout`, subscribe only, and only someone nobody has asked;
 *  - the one-click unsubscribe link (app/api/email/unsubscribe), `unsubscribe_link`;
 *  - Staff, when the customer asks them to stop
 *    (app/api/shop/customers/[id]/marketing-consent), `support`, unsubscribe only;
 *  - slice 08's complaint webhook, `complaint`.
 * The Shopify import applies `shopify_import` inside its own SQL function, and
 * `subscribe_migrated_customers()` applies `import_default` and
 * `shopify_unsubscribed` (Customers → Import from Shopify; ADR 0037).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isConsentSource,
  marketingEmailState,
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
  },
): Promise<SetMarketingEmailResult> {
  const { data, error } = await admin.rpc("set_marketing_email", {
    p_customer_id: input.customerId,
    p_to: input.to,
    p_source: input.source,
  });
  if (error) return { ok: false, error: error.message, notFound: /not found/i.test(error.message) };
  return { ok: true, changed: data === true };
}

/**
 * The checkout box (ADR 0037), ticked by default. Ticked, it subscribes a
 * Customer nobody has asked, and nobody else: the SQL skips anyone who
 * unsubscribed or chose already. Unticked, it changes nothing. It never stops
 * a checkout: a failure is logged and the order goes on.
 */
export async function recordCheckoutConsent(
  admin: SupabaseClient,
  customerId: string,
  ticked: boolean,
): Promise<void> {
  if (!ticked) return;
  try {
    const res = await setMarketingEmail(admin, { customerId, to: "subscribed", source: "checkout" });
    if (!res.ok) console.error("[checkout] marketing consent not recorded:", res.error);
  } catch (e) {
    console.error("[checkout] marketing consent not recorded:", e instanceof Error ? e.message : e);
  }
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

type EventRow = { from_state: string; to_state: string; source: string; created_at: string };

function toEvent(row: EventRow): ConsentEvent | null {
  if (!isConsentSource(row.source)) return null;
  return {
    fromState: marketingEmailState(row.from_state),
    toState: marketingEmailState(row.to_state),
    source: row.source,
    createdAt: row.created_at,
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
    .select("from_state, to_state, source, created_at")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (eventsError) throw new Error(eventsError.message);

  return {
    state: marketingEmailState(customer.marketing_email),
    source: isConsentSource(customer.marketing_email_source) ? customer.marketing_email_source : null,
    updatedAt: (customer.marketing_email_updated_at as string | null) ?? null,
    history: ((events ?? []) as EventRow[]).map(toEvent).filter((e): e is ConsentEvent => e !== null),
  };
}
