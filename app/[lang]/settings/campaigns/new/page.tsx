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
        after ? getCampaign(supabaseAdmin(), after.id).catch(() => null) : Promise.resolve(null),
        campaignPointsLive(),
        campaignAiWriting(),
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
            canCreateSegments={hasPermission(ctx, "customers-edit")}
            slotBefore={slot}
        />
    );
}
