import { requireAdminPage } from "@/lib/auth/admin";
import { listSegments } from "@/lib/crm/segments";
import { FIRST_CAMPAIGN_DRAFT } from "@/lib/email-campaigns/rules";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { CampaignEditor, type SegmentOption } from "../campaign-editor";

export const runtime = "nodejs";

/** A new campaign, starting from the Shopify customers' invitation (PRD-email-marketing). */
export default async function NewEmailCampaignPage({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
    const ctx = await requireAdminPage("campaigns", locale);

    const segments: SegmentOption[] = (await listSegments().catch(() => [])).map((s) => ({ id: s.id, name: s.name }));
    return <CampaignEditor campaign={null} draft={FIRST_CAMPAIGN_DRAFT} stats={null} segments={segments} staffEmail={ctx.email} />;
}
