import type { AftercareFakeDb, RpcHandler } from "@/lib/aftercare/__tests__/fake-db";

const SUBSCRIBERS = ["account", "shopify_import", "import_default", "checkout", "customisation", "appointment", "sign_in", "newsletter", "explore_claim"];
const ONLY_NOBODY_ASKED = ["shopify_import", "import_default", "checkout", "customisation", "appointment", "sign_in", "newsletter", "explore_claim"];

export const setMarketingEmailRpc: RpcHandler = (args, db: AftercareFakeDb) => {
  const to = args.p_to as string;
  const source = args.p_source as string;
  if (to !== "subscribed" && to !== "unsubscribed") {
    return { data: null, error: { message: `A consent change subscribes or unsubscribes, not ${to}` } };
  }
  if (to === "subscribed" && !SUBSCRIBERS.includes(source)) {
    return { data: null, error: { message: `Only the customer, the import or a box they left ticked subscribes them (not ${source})` } };
  }
  if (to === "unsubscribed" && ONLY_NOBODY_ASKED.includes(source)) {
    return { data: null, error: { message: `The source ${source} never unsubscribes anyone` } };
  }
  const customer = (db.customers ?? []).find((c) => c.id === args.p_customer_id);
  if (!customer) return { data: null, error: { message: `Customer ${String(args.p_customer_id)} not found` } };

  const from = (customer.marketing_email as string | undefined) ?? "not_subscribed";
  if (from === to) return { data: false, error: null };
  if (ONLY_NOBODY_ASKED.includes(source) && from !== "not_subscribed") return { data: false, error: null };
  if (source === "shopify_unsubscribed" && customer.marketing_email_source === "account") return { data: false, error: null };

  const at = new Date().toISOString();
  const sends = ((db as Record<string, unknown>).customer_campaign_sends ?? []) as { id: string; customer_id: string }[];
  const sendId = typeof args.p_campaign_send_id === "string" ? args.p_campaign_send_id : null;
  const campaignSendId = sendId && sends.some((x) => x.id === sendId && x.customer_id === args.p_customer_id) ? sendId : null;
  Object.assign(customer, { marketing_email: to, marketing_email_source: source, marketing_email_updated_at: at });
  (db.customer_consent_events ??= []).push({
    customer_id: args.p_customer_id,
    channel: "email",
    from_state: from,
    to_state: to,
    source,
    created_at: at,
    campaign_send_id: campaignSendId,
  });
  return { data: true, error: null };
};
