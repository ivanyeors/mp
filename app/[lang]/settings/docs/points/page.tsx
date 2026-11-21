import { requireAdminPage } from "@/lib/auth/admin";
import { DocArticle } from "@/components/settings/doc-article";
import { POINTS_GUIDE, pointsGuideSections } from "@/lib/admin-docs/points";
import { POINTS_DEFAULTS, type PointsSettings } from "@/lib/points/settings";
import { readPointsSettings } from "@/lib/points/server";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PointsGuidePage({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
    await requireAdminPage("docs", locale);

    let settings: PointsSettings = POINTS_DEFAULTS;
    let readError: string | null = null;
    try {
        settings = await readPointsSettings(supabaseAdmin());
    } catch (err) {
        readError = err instanceof Error ? err.message : String(err);
    }

    return (
        <article className="w-full max-w-3xl space-y-6">
            <header className="space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight">{POINTS_GUIDE.title}</h1>
                <p className="text-sm text-muted-foreground">{POINTS_GUIDE.summary}</p>
                <p className="text-xs text-muted-foreground">Updated {POINTS_GUIDE.updated}. The numbers are today&apos;s settings.</p>
            </header>
            {readError ? (
                <p role="alert" className="text-sm text-destructive">
                    Couldn&apos;t read the points settings, so the numbers below are the defaults: {readError}
                </p>
            ) : null}
            <DocArticle sections={pointsGuideSections(settings)} to={(href) => withLocale(href, locale)} />
        </article>
    );
}
