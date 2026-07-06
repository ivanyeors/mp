import Link from "next/link";
import { PartnerLogoMarquee } from "@/components/marketing/partner-logo-marquee";
import { PartnersLogoGrid } from "@/components/marketing/partners-logo-grid";
import { PartnersWorkWithUsSection } from "@/components/marketing/partners-work-with-us-section";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { getPartners, getPartnersPageContent } from "@/lib/partners";

type PartnersPageProps = {
  params: Promise<{ lang: string }>;
};

export async function PartnersPage({ params }: PartnersPageProps) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const homeHref = withLocale("/", locale);

  const [pageContent, partners] = await Promise.all([
    getPartnersPageContent(locale),
    getPartners(),
  ]);

  return (
    <main>
      <PartnersWorkWithUsSection content={pageContent} locale={locale} />

      {pageContent.showMarquee && partners.length > 0 ? (
        <section className="border-y bg-muted/30">
          <div className="mx-auto w-full max-w-6xl px-4">
            <PartnerLogoMarquee partners={partners} />
          </div>
        </section>
      ) : null}

      <PartnersLogoGrid partners={partners} />

      <div className="mx-auto w-full max-w-6xl px-4 pb-12 md:pb-16">
        <Link
          href={homeHref}
          className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          ← Back to home
        </Link>
      </div>
    </main>
  );
}
