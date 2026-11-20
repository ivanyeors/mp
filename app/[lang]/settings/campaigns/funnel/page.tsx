import { requireAdminPage } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { EmailsNav } from "@/components/settings/emails-nav";
import { getEmailFunnel } from "@/lib/email-funnel/server";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { FunnelClient } from "./funnel-client";
import { stageFromParam } from "./funnel-format";

export const runtime = "nodejs";

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
                permissions={[...ctx.permissions]}
            />
        </div>
    );
}
