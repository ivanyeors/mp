import { supabaseAdmin } from "@/lib/supabase/server";
import { CAMPAIGN_TEMPLATE_LABEL, isCampaignTemplate } from "@/lib/customer-migration/campaign";
import { MARKETING_GROUP } from "@/lib/crm/timeline/groups";
import { joinBatches, readStream } from "@/lib/crm/timeline/read";
import type { TimelineAdapter, TimelineEntry } from "@/lib/crm/timeline/types";

type SendRow = {
  id: string;
  template: string;
  wave: string;
  status: string;
  sent_at: string;
  bounced_at: string | null;
  complained_at: string | null;
  first_clicked_at?: string | null;
  clicks?: number | null;
  campaign?: { name: string | null } | { name: string | null }[] | null;
};

const COLUMNS =
  "id, template, wave, status, sent_at, bounced_at, complained_at, first_clicked_at, clicks, campaign:email_campaigns(name)";

const label = (s: Pick<SendRow, "template" | "campaign">) => {
  if (isCampaignTemplate(s.template)) return CAMPAIGN_TEMPLATE_LABEL[s.template];
  if (s.template.startsWith("campaign:")) {
    const name = (Array.isArray(s.campaign) ? s.campaign[0] : s.campaign)?.name;
    return name ? `“${name}”` : "an email campaign";
  }
  return s.template.replace(/_/g, " ");
};

const ref = (s: SendRow) => ({ type: "campaign_send", id: s.id });

export const campaignSendsAdapter: TimelineAdapter = {
  key: "campaign_sends",
  group: MARKETING_GROUP,
  kinds: ["campaign_email.sent", "campaign_email.bounced", "campaign_email.complained", "campaign_email.clicked"],
  permission: "customers",
  async load(customer, before, limit) {
    const rows = () => supabaseAdmin().from("customer_campaign_sends").select(COLUMNS).eq("customer_id", customer.id);
    const [sent, bounced, complained, clicked] = await Promise.all([
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
          summary: `Campaign email sent: ${label(s)} (wave ${s.wave})`,
          status: s.status,
        }),
      ),
      readStream<SendRow>(rows(), "bounced_at", before, limit, (s) => ({
        id: `campaign_email.bounced:${s.id}`,
        at: s.bounced_at!,
        kind: "campaign_email.bounced",
        ref: ref(s),
        summary: `Campaign email bounced: ${label(s)}. Left out of later waves`,
      })),
      readStream<SendRow>(rows(), "complained_at", before, limit, (s) => ({
        id: `campaign_email.complained:${s.id}`,
        at: s.complained_at!,
        kind: "campaign_email.complained",
        ref: ref(s),
        summary: `Marked as spam: ${label(s)}`,
      })),
      readStream<SendRow>(rows(), "first_clicked_at", before, limit, (s) => ({
        id: `campaign_email.clicked:${s.id}`,
        at: s.first_clicked_at!,
        kind: "campaign_email.clicked",
        ref: ref(s),
        summary: `Clicked ${label(s)}${(s.clicks ?? 0) > 1 ? ` (${s.clicks} clicks)` : ""}`,
      })),
    ]);
    return joinBatches([sent, bounced, complained, clicked]);
  },
};
