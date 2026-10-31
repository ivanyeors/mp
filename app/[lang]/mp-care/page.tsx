import type { Metadata } from "next";
import Link from "next/link";

import { MpCareRitual } from "@/components/mp-care/care-ritual";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { englishOnlyPageMetadata } from "@/lib/seo/page-meta";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  return englishOnlyPageMetadata("mpCare", (await params).lang);
}

export default async function MpCarePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 md:py-16">
      <div className="space-y-4">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Pillow care ritual
        </p>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Mpillow Care</h1>
        <p className="leading-relaxed text-muted-foreground">
          A few seconds each morning, a quick wash every week and month, and a full clean once a
          year keep your Mpillow fresh and in shape for years. Every part of it is washable, right
          down to the fillings.
        </p>
      </div>

      <div className="mt-8">
        <MpCareRitual readjustHref={withLocale("/appointments?type=readjustment", locale)} />
      </div>

      <Separator className="my-12" />

      <section aria-labelledby="mp-care-help" className="space-y-4">
        <div className="space-y-2">
          <h2 id="mp-care-help" className="text-xl font-semibold tracking-tight">
            Still have questions?
          </h2>
          <p className="leading-relaxed text-muted-foreground">
            Our FAQ covers washing, drying and fillings in more detail, or our team can help.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild variant="outline">
            <Link href={withLocale("/faq", locale)}>Read the FAQ</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={withLocale("/support", locale)}>Contact support</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
