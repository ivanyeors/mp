import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { BasicMpillowLearnMoreSheet } from "@/components/slide-in-pages/basic-mpillow-learn-more-slide-in";
import { PremiumLearnMoreSheet } from "@/components/slide-in-pages/premium-learn-more-dialog";
import { ProductRatingBadge } from "@/components/shop/review-stars";
import type { ReviewAggregate } from "@/lib/seo/review-aggregate";
import { SlidersHorizontal } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { withLocale } from "@/lib/i18n/routing";
import type { Messages } from "@/lib/i18n/messages/types";
import type { Locale } from "@/lib/i18n/locales";
import type { LandingSection, PickYourMpillowContent } from "@/lib/types/landing-sections";

interface PickMpillowSectionProps {
  section: LandingSection;
  messages: Messages;
  locale: Locale;
  images: Record<string, string>;
  prices: { basicXsFromPrice: string; premiumXsFromPrice: string };
  ratings?: { basic?: ReviewAggregate; premium?: ReviewAggregate };
}

export function PickMpillowSection({ section, messages: m, locale, images, prices, ratings }: PickMpillowSectionProps) {
  const c = section.content as PickYourMpillowContent;
  const title = c.title ?? m.home.pickYourMpillow.title;
  const subtitle = c.subtitle ?? m.home.pickYourMpillow.subtitle;

  const cards = [
    {
      key: "basic" as const,
      title: m.home.pickYourMpillow.products.basic.title,
      desc: m.home.pickYourMpillow.products.basic.description,
      imageSrc: images.landing_basic_pillow,
      rightBadge: m.home.pickYourMpillow.products.basic.badge,
      fromPriceLabel: prices.basicXsFromPrice,
      specs: [
        { label: m.home.pickYourMpillow.specs.customisation, level: 1, hint: "" },
        { label: m.home.pickYourMpillow.specs.fitControl, level: 2, hint: "" },
      ],
    },
    {
      key: "premium" as const,
      title: m.home.pickYourMpillow.products.premium.title,
      desc: m.home.pickYourMpillow.products.premium.description,
      imageSrc: images.landing_premium_pillow,
      rightBadge: m.home.pickYourMpillow.products.premium.badge,
      fromPriceLabel: prices.premiumXsFromPrice,
      specs: [
        { label: m.home.pickYourMpillow.specs.customisation, level: 3, hint: "" },
        { label: m.home.pickYourMpillow.specs.fitControl, level: 4, hint: "" },
      ],
    },
  ];

  return (
    <section id="pick" className="relative">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">
        <div className="space-y-8">
          <div className="space-y-2">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">{title}</h2>
            <p className="text-muted-foreground leading-relaxed">{subtitle}</p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {cards.map((card) => (
              <Card
                key={card.title}
                className="overflow-hidden bg-card/40 backdrop-blur-sm py-0 gap-0"
              >
                <div className="relative h-[200px]">
                  <Image
                    src={card.imageSrc}
                    alt={`${card.title} Mpillow`}
                    fill
                    className="object-cover"
                    sizes="(min-width: 768px) 50vw, 100vw"
                  />
                  <div className="absolute top-3 left-3 flex gap-1">
                    <Badge>{card.title}</Badge>
                  </div>
                  <Badge
                    variant="outline"
                    className="absolute top-3 right-3 bg-background/90"
                  >
                    {card.rightBadge}
                  </Badge>
                </div>

                <CardContent className="p-4">
                  <h3 className="font-semibold">{card.desc}</h3>
                  {ratings?.[card.key] ? (
                    <div className="mt-2">
                      <ProductRatingBadge aggregate={ratings[card.key]!} />
                    </div>
                  ) : null}
                  <div className="mt-4 space-y-2">
                    {card.specs.map((s) => (
                      <div
                        key={s.label}
                        className="flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2 text-sm">
                          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                          <span>{s.label}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: 4 }).map((_, idx) => (
                            <div
                              key={idx}
                              className={[
                                "h-2 w-4 rounded-sm",
                                idx < s.level ? "bg-primary" : "bg-muted",
                              ].join(" ")}
                            />
                          ))}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {s.hint}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-2xl font-bold tabular-nums">
                      {m.home.pickYourMpillow.fromPricePrefix} {card.fromPriceLabel}
                    </span>
                  </div>
                </CardContent>

                <CardFooter className="p-4 pt-0">
                  {card.title === "Basic" ? (
                    <div className="flex w-full items-center gap-2">
                      <BasicMpillowLearnMoreSheet className="flex-1" />
                      <Button asChild className="flex-1">
                        <Link href={withLocale("/mp-basic", locale)}>{m.home.pickYourMpillow.buttonCustomise}</Link>
                      </Button>
                    </div>
                  ) : (
                    <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
                      <PremiumLearnMoreSheet className="flex-1" />
                      <Button asChild className="flex-1">
                        <Link href={withLocale("/mp-config", locale)}>{m.home.pickYourMpillow.buttonCustomise}</Link>
                      </Button>
                    </div>
                  )}
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
