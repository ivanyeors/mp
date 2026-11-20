import Link from "next/link";
import { BookOpen } from "lucide-react";
import { requireAdminPage } from "@/lib/auth/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { ADMIN_GUIDES } from "@/lib/admin-docs/guides";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";

export const runtime = "nodejs";

export default async function DocumentationPage({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
    await requireAdminPage("docs", locale);

    return (
        <div className="w-full max-w-3xl space-y-4 md:space-y-6">
            <div className="flex items-center gap-1.5">
                <h1 className="text-2xl font-semibold tracking-tight">Documentation</h1>
                <InfoTip label="About Documentation">
                    <p>How each part of the platform works, for whoever runs it. Numbers in a guide are read from the live settings, so they are always the ones in use.</p>
                </InfoTip>
            </div>

            <ul className="grid gap-3 md:gap-4">
                {ADMIN_GUIDES.map((g) => (
                    <li key={g.slug}>
                        <Link href={withLocale(`/settings/docs/${g.slug}`, locale)} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            <Card className="transition hover:border-foreground/30 active:bg-press">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <BookOpen className="h-4 w-4" aria-hidden="true" />
                                        {g.title}
                                    </CardTitle>
                                    <CardDescription>{g.summary}</CardDescription>
                                </CardHeader>
                                <CardContent className="text-xs text-muted-foreground">Updated {g.updated}</CardContent>
                            </Card>
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    );
}
