import { campaignSendLimits, getCampaignTransport, transactionalFromAddress } from "@/lib/email/campaign-transport";
import { getSupportInbox } from "@/lib/email/contact";
import { getSiteOrigin } from "@/lib/site-url";
import { supabaseAdmin } from "@/lib/supabase/server";
import { publicLinkRequest } from "./link-check";
import type { CampaignSenderSetup } from "./sender";

/**
 * The sender's setup from this deployment's environment, as the migration's
 * wave sender builds it from the machine it runs on: the campaign's own
 * Resend key and subdomain (CAMPAIGN_RESEND_API_KEY, CAMPAIGN_EMAIL_FROM,
 * CAMPAIGN_EMAIL_DOMAIN), never the order mailbox; the support inbox for
 * Reply-To; this site for every link; and UNSUBSCRIBE_SECRET to sign them.
 * The plan's send limit (CAMPAIGN_DAILY_SEND_LIMIT, CAMPAIGN_MONTHLY_SEND_LIMIT;
 * unset, Resend's free plan) and whether bounce reports can arrive
 * (CAMPAIGN_RESEND_WEBHOOK_SECRET) come from here too, and the email's links
 * are asked whether they answer through `publicRequest`, which reaches public
 * https hosts only (PRD-campaign-email-editor slice 11).
 */
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
