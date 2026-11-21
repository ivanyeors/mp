import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { listSegments } from "@/lib/crm/segments";
import { playbooksFound } from "@/lib/email-campaigns/starters";
import { matchable } from "@/lib/email-campaigns/wanted-segment";
import { keptToday } from "@/lib/email-campaigns/keep-sending";
import { getCampaign, getCampaignStats, readCampaignResults, readWaveStats } from "@/lib/email-campaigns/store";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { supabaseAdmin } from "@/lib/supabase/server";
import { campaignAiWriting } from "../ai-writing";
import { CampaignEditor } from "../campaign-editor";
import { campaignPointsLive } from "../points-live";
import { segmentOptions } from "../segment-options";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EmailCampaignPage({
    params,
    searchParams,
}: {
    params: Promise<{ lang: string; id: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const [{ lang, id }, query] = await Promise.all([params, searchParams]);
    const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
    const ctx = await requireAdminPage("campaigns", locale);
    if (!UUID.test(id)) notFound();

    const admin = supabaseAdmin();
    const campaign = await getCampaign(admin, id);
    if (!campaign || campaign.archivedAt) notFound();
    const [stats, segments, waves, points, ai, results] = await Promise.all([
        getCampaignStats(admin, id),
        listSegments().catch(() => null),
        readWaveStats(admin, id).then((w) => w.own).catch(() => []),
        campaignPointsLive(),
        campaignAiWriting(),
        campaign.lockedAt ? readCampaignResults(admin, id).catch(() => null) : Promise.resolve(null),
    ]);
    const options = segmentOptions(segments ?? [], ctx, locale);
    if (campaign.segmentId && !options.some((s) => s.id === campaign.segmentId)) {
        options.push({ id: campaign.segmentId, name: "(archived Segment)" });
    }
    return (
        <CampaignEditor
            campaign={campaign}
            draft={campaign}
            stats={stats}
            waves={waves}
            segments={options}
            staffEmail={ctx.email}
            pointsLive={points}
            ai={ai}
            keptToday={keptToday(waves, new Date())}
            results={results}
            initialTab={query.tab === "results" ? "results" : undefined}
            found={playbooksFound(matchable(segments ?? []))}
            segmentsUnread={!segments}
            canCreateSegments={hasPermission(ctx, "customers-edit")}
        />
    );
}
