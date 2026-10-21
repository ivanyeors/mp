// Send one wave of the Shopify migration's campaign emails
// (PRD-shopify-customer-migration slice 08). A human runs every wave.
//
//   npx tsx --env-file=.env.local scripts/customer-migration-send.ts \
//     --template migration_announcement --wave w1 --limit 200 [--buyers-only] [--apply]
//
//   --template      migration_announcement | migration_reminder | migration_service_notice
//   --wave          the wave's label (pilot, w1, w2…). A wave holds at most --limit
//                   people: running the same command again sends nothing.
//   --limit         the most this wave holds.
//   --buyers-only   leave out subscribers who never bought on Shopify.
//   --retry-failed  re-send this wave's failed sends, and nobody else.
//   --resume        run although the latest wave crossed the pause rule (bounces over
//                   2%, complaints over 0.1%), once the segment has been looked at.
//   --apply         send. Without it this is a dry run: it prints the checks, the
//                   eligible count and the selection, and sends nothing.
//
// Everything it decides is in lib/customer-migration (`selectCampaignAudience`,
// `runCampaignWave`); this file only parses flags and prints. It refuses to send
// unless the transport is Resend (CAMPAIGN_RESEND_API_KEY), CAMPAIGN_EMAIL_FROM is
// on CAMPAIGN_EMAIL_DOMAIN, and NEXT_PUBLIC_SITE_URL answers one-click unsubscribe
// with this machine's UNSUBSCRIBE_SECRET.
//
// Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SITE_URL,
//      CAMPAIGN_RESEND_API_KEY, CAMPAIGN_EMAIL_FROM, CAMPAIGN_EMAIL_DOMAIN,
//      UNSUBSCRIBE_SECRET, SUPPORT_EMAIL

import { createClient } from "@supabase/supabase-js";

import { CAMPAIGN_TEMPLATES, isCampaignTemplate } from "@/lib/customer-migration/campaign";
import { formatWaveReport, runCampaignWave } from "@/lib/customer-migration/wave-sender";
import { getCampaignTransport, transactionalFromAddress } from "@/lib/email/campaign-transport";
import { getSupportInbox } from "@/lib/email/contact";
import { getSiteOrigin } from "@/lib/site-url";

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) fail(`Missing required env var: ${name}`);
  return v;
}

function flagValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i >= 0) return args[i + 1];
  return args.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1);
}

async function main() {
  const args = process.argv.slice(2);
  const template = flagValue(args, "--template");
  if (!isCampaignTemplate(template)) fail(`--template must be one of ${CAMPAIGN_TEMPLATES.join(", ")}`);
  const wave = flagValue(args, "--wave");
  if (!wave) fail("--wave is required, e.g. --wave w1");
  const limit = Number(flagValue(args, "--limit"));
  if (!Number.isInteger(limit) || limit < 1) fail("--limit is required: a whole number of people, e.g. --limit 200");

  const admin = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });

  const report = await runCampaignWave(
    {
      template,
      wave,
      limit,
      buyersOnly: args.includes("--buyers-only"),
      retryFailed: args.includes("--retry-failed"),
      resume: args.includes("--resume"),
      apply: args.includes("--apply"),
    },
    {
      admin,
      transport: getCampaignTransport(),
      campaignFrom: process.env.CAMPAIGN_EMAIL_FROM,
      campaignDomain: process.env.CAMPAIGN_EMAIL_DOMAIN,
      orderFrom: transactionalFromAddress(),
      replyTo: getSupportInbox(),
      origin: getSiteOrigin(),
      unsubscribeSecret: process.env.UNSUBSCRIBE_SECRET || undefined,
    },
  );

  for (const line of formatWaveReport(report)) console.log(line);
  if (report.request.apply && (!report.ran || report.failed > 0 || report.stopped)) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
