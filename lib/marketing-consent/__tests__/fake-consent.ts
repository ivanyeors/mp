import type { AftercareFakeDb, RpcHandler } from "@/lib/aftercare/__tests__/fake-db";

/**
 * set_marketing_email as 20261020120000_marketing_consent.sql defines it, for
 * the in-memory client (`fakeAftercareDb`): the state, its provenance and one
 * event together; nothing when unchanged; only the moves each source may make.
 * supabase/tests/customer-migration/assert-07-marketing-consent.sql asserts the
 * real function against Postgres.
 */
export const setMarketingEmailRpc: RpcHandler = (args, db: AftercareFakeDb) => {
  const to = args.p_to as string;
  const source = args.p_source as string;
  if (to !== "subscribed" && to !== "unsubscribed") {
    return { data: null, error: { message: `A consent change subscribes or unsubscribes, not ${to}` } };
  }
  if (to === "subscribed" && source !== "account" && source !== "shopify_import") {
    return { data: null, error: { message: `Only the customer, or their Shopify consent, subscribes them (not ${source})` } };
  }
  const customer = (db.customers ?? []).find((c) => c.id === args.p_customer_id);
  if (!customer) return { data: null, error: { message: `Customer ${String(args.p_customer_id)} not found` } };

  const from = (customer.marketing_email as string | undefined) ?? "not_subscribed";
  if (from === to) return { data: false, error: null };
  if (source === "shopify_import" && from !== "not_subscribed") return { data: false, error: null };

  const at = new Date().toISOString();
  Object.assign(customer, { marketing_email: to, marketing_email_source: source, marketing_email_updated_at: at });
  (db.customer_consent_events ??= []).push({
    customer_id: args.p_customer_id,
    channel: "email",
    from_state: from,
    to_state: to,
    source,
    created_at: at,
  });
  return { data: true, error: null };
};
