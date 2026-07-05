import Link from "next/link";

import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";

type MarketingStubPageProps = {
  title: string;
  params: Promise<{ lang: string }>;
};

export async function MarketingStubPage({ title, params }: MarketingStubPageProps) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const homeHref = withLocale("/", locale);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 md:py-16">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
        <p className="leading-relaxed text-muted-foreground">Content coming soon.</p>
      </div>
      <div className="mt-10 border-t pt-6">
        <Link href={homeHref} className="text-sm underline underline-offset-4">
          Back to home
        </Link>
      </div>
    </main>
  );
}
