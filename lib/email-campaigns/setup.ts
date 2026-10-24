import { getCampaignTransport, transactionalFromAddress } from "@/lib/email/campaign-transport";
import { getSupportInbox } from "@/lib/email/contact";
import { getSiteOrigin } from "@/lib/site-url";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { CampaignSenderSetup } from "./sender";

/**
 * The sender's setup from this deployment's environment, as the migration's
 * wave sender builds it from the machine it runs on: the campaign's own
 * Resend key and subdomain (CAMPAIGN_RESEND_API_KEY, CAMPAIGN_EMAIL_FROM,
 * CAMPAIGN_EMAIL_DOMAIN), never the order mailbox; the support inbox for
 * Reply-To; this site for every link; and UNSUBSCRIBE_SECRET to sign them.
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
  };
}
