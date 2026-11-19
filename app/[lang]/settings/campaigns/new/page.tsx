import { requireAdminPage } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { listSegments } from "@/lib/crm/segments";
import { newCampaignFromAddress } from "@/lib/email-campaigns/starters";
import { getCampaign, listCampaigns } from "@/lib/email-campaigns/store";
import { afterParam, matchable } from "@/lib/email-campaigns/wanted-segment";
import { slotBefore } from "@/lib/email-funnel/move";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { supabaseAdmin } from "@/lib/supabase/server";
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
 * From the Email funnel: `?starter=<id>` starts it from that Starter
 * (PRD-email-funnel slice 04); `?stage=<stage>` sends it to the stage's
 * Segment and `?after=<campaign id>:<did>` to a follow-up's (slice 06), each
 * found by its filters on the server or offered to be created
 * (`newCampaignFromAddress` says which wins). With `?before=<C>` too (the
 * Email flow's *Add an email here*, slice 07), C, a draft that follows the
 * same campaign, is moved to follow the new one on its first save
 * (`slotBefore`); a `before` that cannot be done is ignored. Opening it
 * saves, creates and sends nothing.
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

    const after = afterParam(query.after);
    const [segments, parent, points, ai, campaigns] = await Promise.all([
        listSegments().catch(() => null),
        // The follow-up's campaign; an unknown id, or one that cannot be read, opens the ordinary empty campaign.
        after ? getCampaign(supabaseAdmin(), after.id).catch(() => null) : Promise.resolve(null),
        campaignPointsLive(),
        campaignAiWriting(),
        // Only to slot in front of `before`: who follows whom is read as the Email funnel reads it.
        after && query.before ? listCampaigns(supabaseAdmin()).catch(() => null) : Promise.resolve(null),
    ]);
    const slot =
        segments && campaigns
            ? slotBefore(
                  {
                      segments: segments.map((s) => ({ id: s.id, name: s.name, count: s.count, needsReview: s.needsReview, params: s.params })),
                      campaigns: campaigns.map(({ campaign, stats }) => ({ campaign, stats })),
                  },
                  after,
                  query.before,
              )
            : null;
    const { draft, wanted, note, found } = newCampaignFromAddress(query, matchable(segments ?? []), parent);
    return (
        <CampaignEditor
            campaign={null}
            draft={draft}
            stats={null}
            segments={segmentOptions(segments ?? [], ctx, locale)}
            staffEmail={ctx.email}
            pointsLive={points}
            ai={ai}
            found={found}
            wanted={wanted}
            audienceNote={note}
            segmentsUnread={!segments}
            // The Segments' own create needs it (POST /api/settings/customers/segments).
            canCreateSegments={hasPermission(ctx, "customers-edit")}
            slotBefore={slot}
        />
    );
}
