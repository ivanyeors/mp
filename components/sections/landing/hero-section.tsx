import { CustomiseTierPicker } from "@/components/customise-tier-picker";
import { Ripple } from "@/components/ui/shadcn-io/ripple";
import { BookAppointmentButton } from "@/components/book-appointment-button";
import Image from "next/image";
import type { Messages } from "@/lib/i18n/messages/types";
import type { Locale } from "@/lib/i18n/locales";
import type { LandingSection, HeroContent } from "@/lib/types/landing-sections";

interface HeroSectionProps {
  section: LandingSection;
  messages: Messages;
  locale: Locale;
  images: Record<string, string>;
}

export function HeroSection({ section, messages: m, locale, images }: HeroSectionProps) {
  const c = section.content as HeroContent;
  const sep = locale === "zh-CN" ? "" : " ";
  const heroImage = c.image ?? images.landing_hero;
  const titlePrefix = c.titlePrefix ?? m.home.hero.titlePrefix;
  const titleEmphasis = c.titleEmphasis ?? m.home.hero.titleEmphasis;
  const titleSuffix = c.titleSuffix ?? m.home.hero.titleSuffix;
  const subtitle = c.subtitle ?? m.home.hero.subtitle;
  const ctaCustomise = c.ctaCustomiseLabel ?? m.home.hero.ctaCustomise;
  const ctaBook = c.ctaBookLabel ?? m.home.hero.ctaBookAppointment;

  return (
    <section className="relative">
      <div className="relative w-full overflow-hidden aspect-[3/4] md:aspect-video">
        <Image
          src={heroImage}
          alt="Mpillow pillow hero"
          fill
          priority
          className="object-cover"
          sizes="100vw"
        />

        <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-t from-background/85 via-background/25 to-transparent" />
        <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-t from-black/55 via-black/25 to-transparent md:hidden" />
        <div className="absolute inset-0 z-10 flex md:items-center">
          <div className="mx-auto h-full w-full max-w-6xl px-4 pt-12 md:h-auto md:py-16">
            <div className="flex h-full max-w-xl flex-col md:block md:h-auto md:space-y-6">
              <div className="space-y-3">
                <h1 className="line-clamp-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl md:text-6xl">
                  {titlePrefix}
                  {titleSuffix ? (
                    <>
                      {titlePrefix ? sep : null}
                      <span className="text-primary">{titleEmphasis}</span>
                      {sep}
                      {titleSuffix}
                    </>
                  ) : (
                    <>
                      {/* Tagline: force line 2 to start with the emphasis (e.g. "don't…") */}
                      <br />
                      <span className="text-primary">{titleEmphasis}</span>
                    </>
                  )}
                </h1>
                {/* Answer lede for AEO; hard ≤4 lines so hero never walls the product image */}
                <p className="line-clamp-4 text-base leading-relaxed text-foreground/85 sm:text-lg sm:text-muted-foreground max-w-prose">
                  {m.home.hero.seoAnswer}
                </p>
                {subtitle ? (
                  <p className="text-base leading-relaxed text-foreground/90 sm:text-lg sm:text-muted-foreground md:text-xl">
                    {subtitle}
                  </p>
                ) : null}
              </div>

              <div className="pointer-events-auto mt-auto flex flex-col gap-3 pb-[var(--mobile-bottom-clearance,4.5rem)] sm:flex-row sm:items-center md:mt-0 md:pb-0">
                <CustomiseTierPicker
                  locale={locale}
                  images={images}
                  basicLabel={m.home.pickYourMpillow.products.basic.title}
                  premiumLabel={m.home.pickYourMpillow.products.premium.title}
                  triggerLabel={ctaCustomise}
                />
                <BookAppointmentButton variant="outline" className="h-auto px-6 py-4 text-base">
                  {ctaBook}
                </BookAppointmentButton>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Ripple
        mainCircleSize={320}
        mainCircleOpacity={0.12}
        numCircles={6}
        className="absolute inset-0 -z-10"
      />
    </section>
  );
}
