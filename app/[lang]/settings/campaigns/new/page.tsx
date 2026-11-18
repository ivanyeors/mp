import { requireAdminPage } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { listSegments } from "@/lib/crm/segments";
import { newCampaignDraft } from "@/lib/email-campaigns/rules";
import { startedFromParam } from "@/lib/email-campaigns/starters";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { campaignAiWriting } from "../ai-writing";
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
 * From the Email funnel's *Not set up* step (`?starter=<id>`,
 * PRD-email-funnel slice 04), it is started from that Starter as the Start
 * panel starts it, and a Playbook whose Segment is missing offers to create
 * it. Opening it saves and sends nothing.
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

    const [segments, points, ai] = await Promise.all([listSegments().catch(() => []), campaignPointsLive(), campaignAiWriting()]);
    const options = segmentOptions(segments, ctx, locale);
    const starter = Array.isArray(query.starter) ? query.starter[0] : query.starter;
    return (
        <CampaignEditor
            campaign={null}
            draft={startedFromParam(newCampaignDraft(query.segment, segments), starter, options)}
            stats={null}
            segments={options}
            staffEmail={ctx.email}
            pointsLive={points}
            ai={ai}
            starterId={starter}
            // The Segments' own create needs it (POST /api/settings/customers/segments).
            canCreateSegments={hasPermission(ctx, "customers-edit")}
        />
    );
}
