import { campaignSendLimits, getCampaignTransport, transactionalFromAddress } from "@/lib/email/campaign-transport";
import { getSupportInbox } from "@/lib/email/contact";
import { getSiteOrigin } from "@/lib/site-url";
import { supabaseAdmin } from "@/lib/supabase/server";
import { publicLinkRequest } from "./link-check";
import type { CampaignSenderSetup } from "./sender";

export function campaignSenderSetup(): CampaignSenderSetup {
  return {
    admin: supabaseAdmin(),
    transport: getCampaignTransport(),
    campaignFrom: process.env.CAMPAIGN_EMAIL_FROM,
    campaignDomain: process.env.CAMPAIGN_EMAIL_DOMAIN,
    orderFrom: transactionalFromAddress(),
    replyTo: getSupportInbox(),
    origin: getSiteOrigin(),
    unsubscribeSecret: process.env.UNSUBSCRIBE_SECRET || undefined,
    sendLimits: () => campaignSendLimits(),
    reportsConfigured: Boolean(process.env.CAMPAIGN_RESEND_WEBHOOK_SECRET?.trim()),
    linkRequest: publicLinkRequest,
  };
}
