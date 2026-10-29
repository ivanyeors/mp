import { requireAdminPage } from "@/lib/auth/admin";
import { listSegments } from "@/lib/crm/segments";
import { newCampaignDraft } from "@/lib/email-campaigns/rules";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { CampaignEditor } from "../campaign-editor";
import { campaignPointsLive } from "../points-live";
import { segmentOptions } from "../segment-options";

export const runtime = "nodejs";

/**
 * A new campaign, empty, every field on its placeholder
 * (PRD-campaign-email-editor slice 01), with the Start panel offering where
 * to start: blank, Write with AI, a Starter (the sign-in invitation among
 * them) or a past campaign (slice 08). From *Email this Segment* on
 * Customers (`?segment=<id>`), it is sent to that Segment and named after it
 * (PRD-crm-retention-loop slice 02), the Start panel offered all the same.
 */
export default async function NewEmailCampaignPage({
    params,
    searchParams,
}: {
    params: Promise<{ lang: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const [{ lang }, query] = await Promise.all([params, searchParams]);
    const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
    const ctx = await requireAdminPage("campaigns", locale);

    const [segments, points] = await Promise.all([listSegments().catch(() => []), campaignPointsLive()]);
    return (
        <CampaignEditor
            campaign={null}
            draft={newCampaignDraft(query.segment, segments)}
            stats={null}
            segments={segmentOptions(segments, ctx, locale)}
            staffEmail={ctx.email}
            pointsLive={points}
        />
    );
}
