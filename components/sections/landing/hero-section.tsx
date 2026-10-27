import { CustomiseTierPicker } from "@/components/customise-tier-picker";
import { Ripple } from "@/components/ui/shadcn-io/ripple";
import { BookAppointmentButton } from "@/components/book-appointment-button";
import { HeroContrastFrame } from "@/components/sections/landing/hero-contrast-frame";
import Image from "next/image";
import type { Messages } from "@/lib/i18n/messages/types";
import type { Locale } from "@/lib/i18n/locales";
import type { LandingSection, HeroContent } from "@/lib/types/landing-sections";

/**
 * Once `HeroContrastFrame` has measured the photo, the copy takes the colour with the
 * most contrast over it, per theme. Important, so it outranks the `dark:` theme colours
 * at equal specificity; the colours must match `TONE_RGB` in `lib/a11y/text-contrast`.
 */
const TONE_INK = [
  "group-data-[hero-tone=light]/hero:text-white! group-data-[hero-tone=dark]/hero:text-neutral-950!",
  "dark:group-data-[hero-tone-dark=light]/hero:text-white! dark:group-data-[hero-tone-dark=dark]/hero:text-neutral-950!",
].join(" ");

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
  const heroAlt = c.alt ?? "Mpillow cervical pillow on a bed";
  const titlePrefix = c.titlePrefix ?? m.home.hero.titlePrefix;
  const titleEmphasis = c.titleEmphasis ?? m.home.hero.titleEmphasis;
  const titleSuffix = c.titleSuffix ?? m.home.hero.titleSuffix;
  const subtitle = c.subtitle ?? m.home.hero.subtitle;
  const ctaCustomise = c.ctaCustomiseLabel ?? m.home.hero.ctaCustomise;
  const ctaBook = c.ctaBookLabel ?? m.home.hero.ctaBookAppointment;

  return (
    <section className="relative">
      <HeroContrastFrame className="relative w-full overflow-hidden md:aspect-video">
        <Image
          src={heroImage}
          alt={heroAlt}
          fill
          priority
          className="object-cover"
          sizes="100vw"
          data-hero-backdrop
        />

        {/* The dark-theme washes are drawn by HeroContrastFrame, which measures through them. */}
        {/* Mobile: in flow with a 3:4 floor so long copy grows the hero instead of
            being clipped; md+: overlay centered on the 16:9 image. */}
        <div className="relative z-10 flex min-h-[133.34vw] flex-col md:absolute md:inset-0 md:min-h-0 md:flex-row md:items-center">
          <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pt-12 md:block md:h-auto md:flex-none md:py-16">
            <div className="flex h-full max-w-xl flex-col flex-1 md:block md:h-auto md:space-y-6">
              <div className="space-y-3">
                <h1
                  data-hero-copy
                  className={`line-clamp-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl md:text-6xl ${TONE_INK}`}
                >
                  {titlePrefix}
                  {titleSuffix ? (
                    <>
                      {titlePrefix ? sep : null}
                      <span className={`text-primary ${TONE_INK}`}>{titleEmphasis}</span>
                      {sep}
                      {titleSuffix}
                    </>
                  ) : (
                    <>
                      {/* Tagline: force line 2 to start with the emphasis (e.g. "don't…") */}
                      <br />
                      <span className={`text-primary ${TONE_INK}`}>{titleEmphasis}</span>
                    </>
                  )}
                </h1>
                {/* Answer lede for AEO; hard ≤4 lines so hero never walls the product image */}
                {/* Light mode has no overlay, so muted grey would vanish into the photo */}
                <p
                  data-hero-copy
                  className={`line-clamp-4 text-base font-medium leading-relaxed text-foreground sm:text-lg dark:font-normal dark:text-foreground/85 dark:sm:text-muted-foreground max-w-prose ${TONE_INK}`}
                >
                  {m.home.hero.seoAnswer}
                </p>
                {subtitle ? (
                  <p
                    data-hero-copy
                    className={`text-base font-medium leading-relaxed text-foreground sm:text-lg md:text-xl dark:font-normal dark:text-foreground/90 dark:sm:text-muted-foreground ${TONE_INK}`}
                  >
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
      </HeroContrastFrame>

      <Ripple
        mainCircleSize={320}
        mainCircleOpacity={0.12}
        numCircles={6}
        className="absolute inset-0 -z-10"
      />
    </section>
  );
}
