import Image from "next/image";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { PartnersBenefitCards } from "@/components/marketing/partners-benefit-cards";
import type { Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import type { ResolvedPartnersPage } from "@/lib/partners";

const DEFAULT_HERO = "/m-pillow-417953-web.webp";
// ponytail: CTA reuses top hero otherwise; swap when a dedicated ctaImage field exists
const DEFAULT_CTA_IMAGE = "/images/landing/ambassadors-hero.webp";

type PartnersWorkWithUsSectionProps = {
  content: ResolvedPartnersPage;
  locale: Locale;
};

export function PartnersWorkWithUsSection({ content, locale }: PartnersWorkWithUsSectionProps) {
  const heroImage = content.heroImage || DEFAULT_HERO;
  const ctaHref = content.ctaButtonUrl?.startsWith("http")
    ? content.ctaButtonUrl
    : withLocale(content.ctaButtonUrl || "/support", locale);

  return (
    <>
      <section className="relative">
        <div className="relative w-full overflow-hidden aspect-[3/4] md:aspect-[21/9]">
          <Image
            src={heroImage}
            alt=""
            fill
            priority
            className="object-cover"
            sizes="100vw"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background via-background/40 to-background/10" />
          <div className="absolute inset-0 flex items-end md:items-center">
            <div className="mx-auto w-full max-w-6xl px-4 pt-12 pb-[calc(3rem+var(--mobile-bottom-clearance,4.5rem))] md:py-16 md:pb-16">
              <div className="max-w-2xl space-y-6">
                <div className="space-y-3">
                  <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl md:text-5xl">
                    {content.title}
                  </h1>
                  {content.subtitle ? (
                    <p className="text-base leading-relaxed text-foreground/90 sm:text-lg sm:text-muted-foreground md:text-xl">
                      {content.subtitle}
                    </p>
                  ) : null}
                </div>
                {content.ctaButtonLabel ? (
                  <Link
                    href={ctaHref}
                    className="inline-flex h-12 items-center rounded-full bg-primary px-8 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    {content.ctaButtonLabel}
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>

      {content.benefitCards?.length ? (
        <section className="relative">
          <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">
            <PartnersBenefitCards cards={content.benefitCards} />
          </div>
        </section>
      ) : null}

      {content.body ? (
        <section className="relative">
          <div className="mx-auto w-full max-w-3xl px-4 py-12 md:py-16">
            <div className="prose prose-neutral dark:prose-invert max-w-none">
              <ReactMarkdown>{content.body}</ReactMarkdown>
            </div>
          </div>
        </section>
      ) : null}

      {content.ctaTitle ? (
        <section className="relative overflow-hidden py-16 md:py-24">
          <Image
            src={DEFAULT_CTA_IMAGE}
            alt=""
            fill
            className="object-cover"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative z-10 mx-auto max-w-4xl px-4 text-center text-white">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">{content.ctaTitle}</h2>
            {content.ctaSubtitle ? (
              <p className="mx-auto mt-4 max-w-2xl text-lg text-white/80 md:text-xl">
                {content.ctaSubtitle}
              </p>
            ) : null}
            {content.ctaButtonLabel ? (
              <Link
                href={ctaHref}
                className="mt-8 inline-flex h-12 items-center rounded-full bg-white px-8 text-base font-semibold text-black transition-colors hover:bg-white/90"
              >
                {content.ctaButtonLabel}
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}
    </>
  );
}
