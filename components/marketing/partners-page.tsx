import { PartnerLogoMarquee } from "@/components/marketing/partner-logo-marquee";
import { PartnersLogoGrid } from "@/components/marketing/partners-logo-grid";
import { PartnersWorkWithUsSection } from "@/components/marketing/partners-work-with-us-section";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { getPartners, getPartnersPageContent } from "@/lib/partners";

type PartnersPageProps = {
  params: Promise<{ lang: string }>;
};

export async function PartnersPage({ params }: PartnersPageProps) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

  const [pageContent, partners] = await Promise.all([
    getPartnersPageContent(locale),
    getPartners(),
  ]);

  return (
    <main>
      <PartnersWorkWithUsSection content={pageContent} locale={locale} />

      {pageContent.showMarquee && partners.length > 0 ? (
        <section className="border-y bg-muted/30">
          <PartnerLogoMarquee partners={partners} />
        </section>
      ) : null}

      <PartnersLogoGrid partners={partners} />
    </main>
  );
}
