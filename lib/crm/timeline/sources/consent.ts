import { supabaseAdmin } from "@/lib/supabase/server";
import { MARKETING_GROUP } from "@/lib/crm/timeline/groups";
import { readStream } from "@/lib/crm/timeline/read";
import type { TimelineAdapter } from "@/lib/crm/timeline/types";
import { consentSourcePhrase, isConsentSource } from "@/lib/marketing-consent/state";

/**
 * Marketing consent changes (migration slice 07) on the Customer timeline
 * (`customers`, like the Marketing email card): every row of the append-only
 * `customer_consent_events`, which `set_marketing_email()` writes with the
 * state. Each says which way it moved and what moved it. A Shopify one is
 * dated the export day, as the event stores it. One from a campaign email's
 * unsubscribe link, or a spam report on it, names the campaign
 * (`campaign_send_id`, PRD-campaign-audiences slice 08).
 */

type One<T> = T | T[] | null | undefined;
const one = <T,>(v: One<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

type EventRow = {
  id: number | string;
  to_state: string;
  source: string;
  created_at: string;
  campaign_send?: One<{ campaign?: One<{ name: string | null }> }>;
};

/** The campaign an event names, in quotes, or null. */
const campaignOf = (e: EventRow): string | null => {
  const name = one(one(e.campaign_send)?.campaign)?.name;
  return name ? `“${name}”` : null;
};

export const consentAdapter: TimelineAdapter = {
  key: "consent",
  group: MARKETING_GROUP,
  kinds: ["consent.subscribed", "consent.unsubscribed"],
  permission: "customers",
  load(customer, before, limit) {
    return readStream<EventRow>(
      supabaseAdmin()
        .from("customer_consent_events")
        .select("id, to_state, source, created_at, campaign_send:customer_campaign_sends(campaign:email_campaigns(name))")
        .eq("customer_id", customer.id),
      "created_at",
      before,
      limit,
      (e) => {
        if (e.to_state !== "subscribed" && e.to_state !== "unsubscribed") return null;
        const subscribed = e.to_state === "subscribed";
        const kind = subscribed ? "consent.subscribed" : "consent.unsubscribed";
        const what = subscribed ? "Subscribed to marketing email" : "Unsubscribed from marketing email";
        // Slice 08: the campaign whose link, or whose spam report, it was.
        const campaign = subscribed ? null : campaignOf(e);
        const named =
          campaign && e.source === "unsubscribe_link"
            ? `${what} by the unsubscribe link in ${campaign}`
            : campaign && e.source === "complaint"
              ? `${what} by a spam complaint about ${campaign}`
              : null;
        return {
          id: `${kind}:${e.id}`,
          at: e.created_at,
          kind,
          ref: { type: "customer_consent_event", id: String(e.id) },
          summary: named ?? (isConsentSource(e.source) ? `${what} ${consentSourcePhrase(e.source)}` : what),
        };
      },
    );
  },
};
