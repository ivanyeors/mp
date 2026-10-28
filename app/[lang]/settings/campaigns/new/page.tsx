import { requireAdminPage } from "@/lib/auth/admin";
import { listSegments } from "@/lib/crm/segments";
import { newCampaignDraft } from "@/lib/email-campaigns/rules";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { CampaignEditor } from "../campaign-editor";
import { segmentOptions } from "../segment-options";

export const runtime = "nodejs";

/**
 * A new campaign, starting from the Shopify customers' invitation
 * (PRD-email-marketing), or, from *Email this Segment* on Customers
 * (`?segment=<id>`), a blank one sent to that Segment
 * (PRD-crm-retention-loop slice 02).
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

    const segments = await listSegments().catch(() => []);
    return (
        <CampaignEditor
            campaign={null}
            draft={newCampaignDraft(query.segment, segments)}
            stats={null}
            segments={segmentOptions(segments, ctx, locale)}
            staffEmail={ctx.email}
        />
    );
}
