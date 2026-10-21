import { supabaseAdmin } from "@/lib/supabase/server";
import { CAMPAIGN_TEMPLATE_LABEL, isCampaignTemplate } from "@/lib/customer-migration/campaign";
import { MARKETING_GROUP } from "@/lib/crm/timeline/groups";
import { joinBatches, readStream } from "@/lib/crm/timeline/read";
import type { TimelineAdapter, TimelineEntry } from "@/lib/crm/timeline/types";

/**
 * Campaign emails (migration slice 08; `customer_campaign_sends`) on the
 * Customer timeline, under the Marketing chip beside consent changes, gated
 * by `customers` like the rest of the Customer's own facts.
 *
 * Three dated facts, one stream each: the send the provider accepted
 * (`sent_at`; a send that failed or is still in flight reached nobody and is
 * not shown), and the webhook's bounce and complaint (`bounced_at`,
 * `complained_at`). The send's current status is its pill. The Claim link
 * the email carried is the claim-links source's entry, at its first click.
 */

type SendRow = {
  id: string;
  template: string;
  wave: string;
  status: string;
  sent_at: string;
  bounced_at: string | null;
  complained_at: string | null;
};

const COLUMNS = "id, template, wave, status, sent_at, bounced_at, complained_at";

const label = (template: string) =>
  isCampaignTemplate(template) ? CAMPAIGN_TEMPLATE_LABEL[template] : template.replace(/_/g, " ");

const ref = (s: SendRow) => ({ type: "campaign_send", id: s.id });

export const campaignSendsAdapter: TimelineAdapter = {
  key: "campaign_sends",
  group: MARKETING_GROUP,
  kinds: ["campaign_email.sent", "campaign_email.bounced", "campaign_email.complained"],
  permission: "customers",
  async load(customer, before, limit) {
    const rows = () => supabaseAdmin().from("customer_campaign_sends").select(COLUMNS).eq("customer_id", customer.id);
    const [sent, bounced, complained] = await Promise.all([
      readStream<SendRow>(
        rows().in("status", ["sent", "bounced", "complained"]),
        "sent_at",
        before,
        limit,
        (s): TimelineEntry => ({
          id: `campaign_email.sent:${s.id}`,
          at: s.sent_at,
          kind: "campaign_email.sent",
          ref: ref(s),
          summary: `Campaign email sent: ${label(s.template)} (wave ${s.wave})`,
          status: s.status,
        }),
      ),
      readStream<SendRow>(rows(), "bounced_at", before, limit, (s) => ({
        id: `campaign_email.bounced:${s.id}`,
        at: s.bounced_at!,
        kind: "campaign_email.bounced",
        ref: ref(s),
        summary: `Campaign email bounced: ${label(s.template)}. Left out of later waves`,
      })),
      readStream<SendRow>(rows(), "complained_at", before, limit, (s) => ({
        id: `campaign_email.complained:${s.id}`,
        at: s.complained_at!,
        kind: "campaign_email.complained",
        ref: ref(s),
        summary: `Marked as spam: ${label(s.template)}`,
      })),
    ]);
    return joinBatches([sent, bounced, complained]);
  },
};
