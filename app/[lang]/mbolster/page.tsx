import Link from "next/link";

import { BookAppointmentButton } from "@/components/book-appointment-button";
import { Button } from "@/components/ui/button";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";

export default async function MbolsterPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const configHref = withLocale("/mbolster-config", locale);

  return (
    <div className="min-h-screen bg-background">
      <main className="relative overflow-x-hidden">
        <section className="relative">
          <div className="mx-auto w-full max-w-6xl px-4 pb-12 pt-12 md:pb-16 md:pt-16">
            <div className="space-y-10">
              <header className="space-y-3">
                <div className="text-sm font-semibold text-muted-foreground">Adjustable Bolster</div>
                <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
                  Customised Bolsters - Mbolster
                </h1>
                <p className="max-w-3xl text-muted-foreground leading-relaxed">
                  Not sure how to customise your bolster? Make an appointment with us and we can help you adjust your
                  Mbolster according to your side sleeping preference.
                </p>

                <div className="flex flex-wrap items-end justify-between gap-4 pt-2">
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Starting from</div>
                    <div className="text-3xl font-bold tabular-nums">$135.00 SGD</div>
                    <div className="text-sm text-muted-foreground">Based on selected size and case type.</div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button asChild>
                      <Link href={configHref}>Customise</Link>
                    </Button>
                    <BookAppointmentButton>Book an appointment</BookAppointmentButton>
                  </div>
                </div>
              </header>

              <div className="grid gap-6 md:grid-cols-2">
                <section className="rounded-2xl border bg-card/40 p-5 backdrop-blur-sm md:p-7">
                  <h2 className="text-lg font-semibold tracking-tight">About Mbolster</h2>
                  <div className="mt-3 space-y-3 text-sm text-muted-foreground leading-relaxed">
                    <p>
                      Using the same modular structure as the Mpillow, the firmness of our customisable bolster, Mbolster
                      is adjustable and suitable for side sleeping. Our Mbolster is also hygienic as it is 100% washable.
                      It comes in different sizes to suit your height.
                    </p>
                    <p>
                      You may also add on our Mbolster case made of tencel material to give it a premium feel. Duo face
                      cover combines 2 Mbolsters to help stomach sleepers breathe better when sleeping on the stomach and
                      to help align the spine.
                    </p>
                    <p>The inner case is made of white polyester fiber.</p>
                  </div>
                </section>

                <section className="rounded-2xl border bg-card/40 p-5 backdrop-blur-sm md:p-7">
                  <h2 className="text-lg font-semibold tracking-tight">Choose your size (by height)</h2>
                  <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center justify-between gap-3 rounded-xl border bg-background/50 px-4 py-3">
                      <div className="font-medium text-foreground">Size S</div>
                      <div className="text-right">D15 × 0.8m (Ideal for ≤ 1.50m)</div>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-xl border bg-background/50 px-4 py-3">
                      <div className="font-medium text-foreground">Size M</div>
                      <div className="text-right">D20 × 1.0m (Ideal for 1.50m–1.80m)</div>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-xl border bg-background/50 px-4 py-3">
                      <div className="font-medium text-foreground">Size L</div>
                      <div className="text-right">D20 × 1.2m (Ideal for &gt; 1.80m)</div>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-muted-foreground">
                    Tip: not sure? Use the “Customise” button to get a quick recommendation.
                  </div>
                </section>
              </div>

              <section className="rounded-2xl border bg-card/40 p-5 backdrop-blur-sm md:p-7">
                <h2 className="text-lg font-semibold tracking-tight">What’s in the packaging</h2>
                <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                  <li>x1 Mbolster inner case*</li>
                  <li>x1 Vacuum Bag</li>
                  <li>x1 Laundry Bag</li>
                </ul>
                <div className="mt-3 text-sm text-muted-foreground leading-relaxed">
                  <div className="font-semibold text-foreground">Fillings quantity</div>
                  <div>Fillings provided and based on the selected size.</div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    *Bolster case is excluded. It is optional and it is an add-on.
                  </div>
                </div>
              </section>

              <section className="grid gap-6 md:grid-cols-2">
                <div className="rounded-2xl border bg-card/40 p-5 backdrop-blur-sm md:p-7">
                  <h2 className="text-lg font-semibold tracking-tight">Highlights</h2>
                  <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                    <li>Modular fillings for adjustable firmness</li>
                    <li>Machine washable for better hygiene</li>
                    <li>Suited for side sleepers (and flexible enough for other positions)</li>
                    <li>Multiple sizes for different heights</li>
                  </ul>
                </div>

                <div className="rounded-2xl border bg-card/40 p-5 backdrop-blur-sm md:p-7">
                  <h2 className="text-lg font-semibold tracking-tight">Customer review</h2>
                  <div className="mt-3 rounded-xl border bg-background/50 p-4">
                    <div className="text-sm font-semibold text-foreground">Customised Bolster</div>
                    <div className="mt-1 text-sm text-muted-foreground">“My daughter loves the bolster!”</div>
                  </div>
                  <div className="mt-3 text-xs text-muted-foreground">Based on a customer review.</div>
                </div>
              </section>

              <section className="rounded-2xl border bg-card/40 p-5 backdrop-blur-sm md:p-7">
                <h2 className="text-lg font-semibold tracking-tight">Why it helps</h2>
                <div className="mt-3 space-y-3 text-sm text-muted-foreground leading-relaxed">
                  <p>
                    Complementing the Mpillow in providing better sleep quality is our Mbolster. While the Mpillow helps
                    prevent neck and shoulder pain, the Mbolster ensures side sleepers maintain the right lower back
                    posture throughout the night to prevent muscle strain and lower back pain.
                  </p>
                  <p>
                    The Mbolster revolutionizes the traditional paradigm. Its innovative design ensures you have a
                    hygienic bolster with just the right balance of softness and firmness that remains durable over time,
                    providing you with daily comfort.
                  </p>
                </div>
              </section>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
