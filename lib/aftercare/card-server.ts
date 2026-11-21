import type { SupabaseClient } from "@supabase/supabase-js";
import { listOpenStopRequests } from "@/lib/aftercare/preferences";
import { aftercareTemplateName, aftercareWhatsAppTransportConfigured } from "@/lib/whatsapp/aftercare-notify";
import { checkupTemplate } from "./checkup";
import { countCheckupSends } from "./checkup-counts";
import { runCheckups } from "./checkup-server";
import { REVIEW_REQUEST_TEMPLATE } from "./review-request";
import {
  countLinkedGoogleReviewsOfRequested,
  countReviewRequests,
  countReviewRequestSends,
} from "./review-request-counts";
import { runReviewRequests } from "./review-request-server";
import { AFTERCARE_SETTING_KEYS, parseAftercareSettings, type AftercareCardData, type AftercareSettings } from "./settings";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function readAftercareSettings(admin: SupabaseClient): Promise<AftercareSettings> {
  const { data, error } = await admin
    .from("site_settings")
    .select("key, value")
    .in("key", [...AFTERCARE_SETTING_KEYS]);
  if (error) throw new Error(`site_settings: ${error.message}`);
  const stored: Record<string, string> = {};
  for (const row of data ?? []) stored[row.key as string] = row.value as string;
  return parseAftercareSettings(stored);
}

export async function readAftercareCard(
  admin: SupabaseClient,
  opts: { origin: string; now?: Date },
): Promise<AftercareCardData> {
  const now = opts.now ?? new Date();
  const since = (days: number) => ({ from: new Date(now.getTime() - days * DAY_MS).toISOString(), to: now.toISOString() });
  const [settings, today, asked, sends, googleReviewsLinked, stops, checkupsToday, checkupsLast90] = await Promise.all([
    readAftercareSettings(admin),
    runReviewRequests(admin, { origin: opts.origin, now, dryRun: true }),
    countReviewRequests(admin, since(30)),
    countReviewRequestSends(admin, since(30)),
    countLinkedGoogleReviewsOfRequested(admin),
    listOpenStopRequests(admin),
    runCheckups(admin, { origin: opts.origin, now, dryRun: true }),
    countCheckupSends(admin, since(90)),
  ]);
  return {
    settings,
    reviewRequests: {
      today,
      last30: { asked: asked.sent, opened: asked.opened, email: sends.email, whatsapp: sends.whatsapp },
      googleReviewsLinked,
    },
    checkups: { today: checkupsToday, last90: checkupsLast90 },
    whatsapp: {
      senderConfigured: aftercareWhatsAppTransportConfigured(),
      reviewTemplate: aftercareTemplateName(REVIEW_REQUEST_TEMPLATE),
      checkupTemplate: aftercareTemplateName(checkupTemplate(settings.checkups.months)),
    },
    openStopRequests: stops.length,
  };
}
