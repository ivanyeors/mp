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
 * dated the export day, as the event stores it.
 */

type EventRow = {
  id: number | string;
  to_state: string;
  source: string;
  created_at: string;
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
        .select("id, to_state, source, created_at")
        .eq("customer_id", customer.id),
      "created_at",
      before,
      limit,
      (e) => {
        if (e.to_state !== "subscribed" && e.to_state !== "unsubscribed") return null;
        const subscribed = e.to_state === "subscribed";
        const kind = subscribed ? "consent.subscribed" : "consent.unsubscribed";
        const what = subscribed ? "Subscribed to marketing email" : "Unsubscribed from marketing email";
        return {
          id: `${kind}:${e.id}`,
          at: e.created_at,
          kind,
          ref: { type: "customer_consent_event", id: String(e.id) },
          summary: isConsentSource(e.source) ? `${what} ${consentSourcePhrase(e.source)}` : what,
        };
      },
    );
  },
};
