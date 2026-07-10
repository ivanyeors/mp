import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { MbolsterLearnMoreSlideIn } from "@/components/slide-in-pages/mbolster-learn-more-slide-in";
import { ProductRatingBadge } from "@/components/shop/review-stars";
import type { ReviewAggregate } from "@/lib/seo/review-aggregate";
import { SlidersHorizontal } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { withLocale } from "@/lib/i18n/routing";
import type { Messages } from "@/lib/i18n/messages/types";
import type { Locale } from "@/lib/i18n/locales";
import type { LandingSection, ProductCardContent } from "@/lib/types/landing-sections";

interface ProductCardSectionProps {
  section: LandingSection;
  messages: Messages;
  locale: Locale;
  images: Record<string, string>;
  prices: { bolsterFromPrice: string };
  bolsterRating?: ReviewAggregate;
}

export function ProductCardSection({ section, messages: m, locale, images, prices, bolsterRating }: ProductCardSectionProps) {
  const c = section.content as ProductCardContent;
  const title = c.title ?? m.home.mbolster.title;
  const description = c.description ?? m.home.mbolster.description;
  const subtitle = c.subtitle ?? m.home.mbolster.subtitle;
  const image = c.image ?? images.landing_mbolster;

  return (
    <section className="relative">
      <div className="mx-auto w-full max-w-6xl px-4 pb-12 md:pb-16">
        <Card className="overflow-hidden bg-card/40 backdrop-blur-sm py-0 gap-0">
          <div className="grid grid-cols-1 md:grid-cols-2">
            <div className="relative aspect-[3/4] w-full md:aspect-[1493/554] lg:aspect-auto lg:min-h-[360px]">
              <Image
                src={image}
                alt="Mbolster"
                fill
                className="object-cover"
                sizes="(min-width: 1280px) 560px, (min-width: 768px) 50vw, 100vw"
              />
            </div>

            <div className="flex flex-col">
              <CardContent className="p-5 md:p-7">
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h2>
                  <p className="text-muted-foreground leading-relaxed">{description}</p>
                  {bolsterRating ? (
                    <div className="pt-1">
                      <ProductRatingBadge aggregate={bolsterRating} />
                    </div>
                  ) : null}
                </div>

                <div className="mt-4">
                  <h3 className="font-semibold">{subtitle}</h3>

                  <div className="mt-4 space-y-2">
                    {[
                      { label: m.home.mbolster.specs.customisation, level: 3 },
                      { label: m.home.mbolster.specs.fitControl, level: 4 },
                    ].map((s) => (
                      <div key={s.label} className="flex items-center justify-between">
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
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-2xl font-bold tabular-nums">
                      {m.home.mbolster.fromPricePrefix} {prices.bolsterFromPrice}
                    </span>
                  </div>
                </div>
              </CardContent>

              <CardFooter className="p-5 pt-0 md:p-7 md:pt-0">
                <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
                  <MbolsterLearnMoreSlideIn className="flex-1" />
                  <Button asChild className="flex-1">
                    <Link href={withLocale("/mbolster-config", locale)}>{m.home.mbolster.buttonCustomise}</Link>
                  </Button>
                </div>
              </CardFooter>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}
