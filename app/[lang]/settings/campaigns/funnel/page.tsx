import { requireAdminPage } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { EmailsNav } from "@/components/settings/emails-nav";
import { getEmailFunnel } from "@/lib/email-funnel/server";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { FunnelClient } from "./funnel-client";
import { stageFromParam } from "./funnel-format";

export const runtime = "nodejs";

/**
 * Admin Panel → Email campaigns → Funnel (PRD-email-funnel slice 03; ADR
 * 0054): every email the platform sends by itself, laid along the Lifecycle
 * stages. For the stage in `?stage=` (default Lead): the Segments that cut it,
 * its Email flow and each email's results. Read-only apart from its links;
 * guarded by `campaigns`. Links to Customers show only with `customers`.
 *
 * The loader never fails the page: a part it could not read is *not counted*
 * or named on the page.
 */
export default async function EmailFunnelPage({
    params,
    searchParams,
}: {
    params: Promise<{ lang: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const [{ lang }, query] = await Promise.all([params, searchParams]);
    const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
    const ctx = await requireAdminPage("campaigns", locale);
    const to = (href: string) => withLocale(href, locale);

    const view = await getEmailFunnel();

    return (
        <div className="space-y-6">
            <EmailsNav
                current="funnel"
                campaignsHref={to("/settings/campaigns")}
                funnelHref={to("/settings/campaigns/funnel")}
                templatesHref={hasPermission(ctx, "email-templates") ? to("/settings/email-templates") : null}
            />
            <FunnelClient
                view={view}
                initialStage={stageFromParam(view, query.stage)}
                locale={locale}
                // Every link on the page is offered only where the role can open it (`canOpenWith`).
                permissions={[...ctx.permissions]}
            />
        </div>
    );
}
