import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/admin";
import { listSegments } from "@/lib/crm/segments";
import { getCampaign, getCampaignStats } from "@/lib/email-campaigns/store";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { supabaseAdmin } from "@/lib/supabase/server";
import { CampaignEditor, type SegmentOption } from "../campaign-editor";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One campaign: its email, a test, and its waves (PRD-email-marketing). */
export default async function EmailCampaignPage({ params }: { params: Promise<{ lang: string; id: string }> }) {
    const { lang, id } = await params;
    const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
    const ctx = await requireAdminPage("campaigns", locale);
    if (!UUID.test(id)) notFound();

    const admin = supabaseAdmin();
    const campaign = await getCampaign(admin, id);
    if (!campaign || campaign.archivedAt) notFound();
    const [stats, segments] = await Promise.all([
        getCampaignStats(admin, id),
        listSegments().catch(() => []),
    ]);
    const options: SegmentOption[] = segments.map((s) => ({ id: s.id, name: s.name }));
    // The Segment it was saved with stays choosable even if it was archived since.
    if (campaign.segmentId && !options.some((s) => s.id === campaign.segmentId)) {
        options.push({ id: campaign.segmentId, name: "(archived Segment)" });
    }
    return <CampaignEditor campaign={campaign} draft={campaign} stats={stats} segments={options} staffEmail={ctx.email} />;
}
