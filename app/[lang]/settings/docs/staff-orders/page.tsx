import { requireAdminPage } from "@/lib/auth/admin";
import { DocArticle } from "@/components/settings/doc-article";
import { STAFF_ORDERS_GUIDE, staffOrdersGuideSections } from "@/lib/admin-docs/staff-orders";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";

export const runtime = "nodejs";

export default async function StaffOrdersGuidePage({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
    await requireAdminPage("docs", locale);

    return (
        <article className="w-full max-w-3xl space-y-6">
            <header className="space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight">{STAFF_ORDERS_GUIDE.title}</h1>
                <p className="text-sm text-muted-foreground">{STAFF_ORDERS_GUIDE.summary}</p>
                <p className="text-xs text-muted-foreground">Updated {STAFF_ORDERS_GUIDE.updated}.</p>
            </header>
            <DocArticle sections={staffOrdersGuideSections()} to={(href) => withLocale(href, locale)} />
        </article>
    );
}
