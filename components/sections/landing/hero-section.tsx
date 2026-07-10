import { CustomiseTierPicker } from "@/components/customise-tier-picker";
import { Ripple } from "@/components/ui/shadcn-io/ripple";
import { BookAppointmentSheet } from "@/components/slide-in-pages/book-appointment-sheet";
import { BOOK_APPOINTMENT_URL } from "@/lib/book-appointment";
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
        <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-t from-black/40 via-black/15 to-transparent md:hidden dark:hidden" />
        <div className="absolute inset-0 z-10 flex items-end md:items-center">
          <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">
            <div className="max-w-xl space-y-6">
              <div className="space-y-3">
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl md:text-6xl">
                  {titlePrefix}
                  {sep}
                  <span className="text-primary">{titleEmphasis}</span>
                  {sep}
                  {titleSuffix}
                </h1>
                <p className="text-base leading-relaxed text-muted-foreground sm:text-lg max-w-prose">
                  {m.home.hero.seoAnswer}
                </p>
                <p className="text-base leading-relaxed text-muted-foreground sm:text-lg md:text-xl">
                  {subtitle}
                </p>
              </div>

              <div className="pointer-events-auto flex flex-col gap-3 sm:flex-row sm:items-center">
                <CustomiseTierPicker
                  locale={locale}
                  images={images}
                  basicLabel={m.home.pickYourMpillow.products.basic.title}
                  premiumLabel={m.home.pickYourMpillow.products.premium.title}
                  triggerLabel={ctaCustomise}
                />
                <BookAppointmentSheet
                  appointmentUrl={BOOK_APPOINTMENT_URL}
                  triggerVariant="outline"
                  triggerClassName="h-auto px-6 py-4 text-base"
                  triggerLabel={ctaBook}
                />
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
