import { ModeToggle } from "@/components/mode-toggle";
import { Ripple } from "@/components/ui/shadcn-io/ripple";
import { Button } from "@/components/ui/button";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import {
  Award,
  BadgeCheck,
  ChevronRight,
  HeartPulse,
  Quote,
  Sparkles,
  ShieldCheck,
  Star,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Sticky top bar */}
      <header className="sticky top-0 z-30 border-b bg-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/40">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/mpillow_logo_2026.png"
              alt="Mpillow logo"
              width={40}
              height={40}
              className="h-10 w-10"
              priority
            />
            <span className="text-sm font-semibold tracking-tight">Mpillow</span>
          </Link>

          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a className="hover:text-foreground transition-colors" href="#pick">
              Pick your Mpillow
            </a>
            <a className="hover:text-foreground transition-colors" href="#why">
              Why Mpillow
            </a>
            <a className="hover:text-foreground transition-colors" href="#review">
              Review
            </a>
            <a className="hover:text-foreground transition-colors" href="#stories">
              Stories
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <Button asChild size="sm" className="hidden sm:inline-flex">
              <Link href="/mp-config">
                <Sparkles className="mr-2 h-4 w-4" />
                Pick your Mpillow
              </Link>
            </Button>
            <ModeToggle />
          </div>
        </div>
      </header>

      <main className="relative">
        {/* Hero */}
        <section className="relative">
          <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">
            <div className="grid grid-cols-1 items-center gap-10 md:grid-cols-2">
              <div className="space-y-6">
                <div className="inline-flex items-center gap-2 rounded-full border bg-card/40 px-3 py-1 text-xs text-muted-foreground backdrop-blur-sm">
                  <Star className="h-3.5 w-3.5 text-primary" />
                  Singapore-crafted · Customised fit
                </div>

                <div className="space-y-3">
                  <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">
                    Gift A Good Night’s Sleep With A{" "}
                    <span className="text-primary">100% Customised</span> Pillow
                  </h1>
                  <p className="text-lg leading-relaxed text-muted-foreground md:text-xl">
                    A cervical neck support pillow to maintain the perfect posture for every sleep position.
                  </p>
                </div>

                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <BadgeCheck className="mt-0.5 h-4 w-4 text-primary" />
                    Customised pillow from Singapore, handcrafted for a perfect night’s sleep
                  </li>
                  <li className="flex items-start gap-2">
                    <BadgeCheck className="mt-0.5 h-4 w-4 text-primary" />
                    Customisable pillows for any body build
                  </li>
                </ul>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Button asChild className="h-auto px-6 py-4 text-base">
                    <Link href="/mp-config">
                      <Sparkles className="mr-2 h-5 w-5" />
                      Pick your Mpillow
                      <ChevronRight className="ml-2 h-5 w-5" />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="h-auto px-6 py-4 text-base">
                    <a href="#ambassadors">How it’s made</a>
                  </Button>
                  <Button variant="secondary" className="h-auto px-6 py-4 text-base" disabled>
                    Gift vouchers (CTA placeholder)
                  </Button>
                </div>
              </div>

              <div className="relative">
                <AspectRatio
                  ratio={16 / 9}
                  className="overflow-hidden rounded-2xl border bg-card/40 backdrop-blur-sm"
                >
                  <div className="h-full w-full bg-muted/40" />
                  <div className="absolute inset-0 grid place-items-center">
                    <div className="rounded-full border bg-background/70 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
                      Hero media placeholder (16:9)
                    </div>
                  </div>
                </AspectRatio>
                <div className="mt-3 text-xs text-muted-foreground">
                  Placeholder for the homepage key image/video.
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

        {/* Ambassadors / How it’s made */}
        <section id="ambassadors" className="relative">
          <div className="mx-auto w-full max-w-5xl px-4 py-12 md:py-16">
            <div className="grid grid-cols-1 gap-10 md:grid-cols-2 md:items-center">
              <div className="space-y-4">
                <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                  Find out how Mpillows are made
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  For our ambassadors, Skyjin and Piggie — a behind-the-scenes look at the customisation process.
                </p>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Button variant="secondary" disabled>
                    Watch the process (CTA placeholder)
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/mp-care">Care guide</Link>
                  </Button>
                </div>
              </div>

              <AspectRatio
                ratio={16 / 9}
                className="overflow-hidden rounded-2xl border bg-card/40 backdrop-blur-sm"
              >
                <div className="h-full w-full bg-muted/40" />
                <div className="absolute inset-0 grid place-items-center">
                  <div className="rounded-full border bg-background/70 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
                    Video placeholder (16:9)
                  </div>
                </div>
              </AspectRatio>
            </div>
          </div>
        </section>

        {/* Pick your Mpillow */}
        <section id="pick" className="relative">
          <div className="mx-auto w-full max-w-5xl px-4 py-12 md:py-16">
            <div className="space-y-8">
              <div className="space-y-2">
                <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Pick your Mpillow</h2>
                <p className="text-muted-foreground leading-relaxed">
                  With three levels of customisation, we have an Mpillow for every need.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                {[
                  { title: "Level 1", desc: "Entry customisation (placeholder copy)" },
                  { title: "Level 2", desc: "More fit control (placeholder copy)" },
                  { title: "Level 3", desc: "Full modular tailoring (placeholder copy)" },
                ].map((card) => (
                  <div
                    key={card.title}
                    className="rounded-2xl border bg-card/40 backdrop-blur-sm overflow-hidden"
                  >
                    <AspectRatio ratio={4 / 3} className="bg-muted/40">
                      <div className="h-full w-full" />
                      <div className="absolute inset-0 grid place-items-center">
                        <div className="rounded-full border bg-background/70 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
                          Image placeholder (4:3)
                        </div>
                      </div>
                    </AspectRatio>
                    <div className="p-6 space-y-3">
                      <div className="text-lg font-semibold">{card.title}</div>
                      <p className="text-sm text-muted-foreground">{card.desc}</p>
                      <Button variant="outline" className="w-full" disabled>
                        Learn more (CTA placeholder)
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button asChild className="h-auto px-6 py-4 text-base">
                  <Link href="/mp-config">
                    Start fit assessment
                    <ChevronRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="h-auto px-6 py-4 text-base">
                  <Link href="/mp-maker">MP Maker</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Why choose / Neck pain */}
        <section id="why" className="relative">
          <div className="mx-auto w-full max-w-5xl px-4 py-12 md:py-16">
            <div className="grid grid-cols-1 gap-10 md:grid-cols-2 md:items-start">
              <div className="space-y-4">
                <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                  Why choose Mpillow
                </h2>
                <div className="space-y-3">
                  <div className="text-lg font-semibold">Neck Pain Issue?</div>
                  <p className="text-muted-foreground leading-relaxed">
                    Discover Mpillow – the ultimate customisable pillow for cervical neck pain relief. Designed to
                    support your unique posture and sleep style, our modular pillows help improve sleep quality,
                    reduce stiffness, and promote spinal alignment.
                  </p>
                  <p className="text-muted-foreground">Wake up refreshed every day.</p>
                </div>
                <Button asChild className="h-auto px-6 py-4 text-base">
                  <Link href="/mp-config">
                    See recommended fit
                    <ChevronRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
              </div>

              <div className="space-y-4">
                {[
                  "Easily adjustable for any height",
                  "100% washable",
                  "Uniquely shaped to suit your sleeping position",
                  "Customisable width for different body builds",
                  "Modular components for easy maintenance",
                ].map((benefit) => (
                  <div
                    key={benefit}
                    className="flex items-start gap-3 rounded-xl border bg-card/40 p-4 backdrop-blur-sm"
                  >
                    <HeartPulse className="mt-0.5 h-5 w-5 text-primary" />
                    <div className="text-sm leading-relaxed">{benefit}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Credibility strip */}
        <section className="relative">
          <div className="mx-auto w-full max-w-5xl px-4 pb-12 md:pb-16">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-2xl border bg-card/40 p-6 backdrop-blur-sm">
                <Award className="h-6 w-6 text-primary" />
                <div className="mt-3 text-lg font-semibold">Singapore Good Design 2022</div>
                <div className="mt-1 text-sm text-muted-foreground">Award-winning brand</div>
              </div>
              <div className="rounded-2xl border bg-card/40 p-6 backdrop-blur-sm">
                <ShieldCheck className="h-6 w-6 text-primary" />
                <div className="mt-3 text-lg font-semibold">7 years</div>
                <div className="mt-1 text-sm text-muted-foreground">Research and development</div>
              </div>
              <div className="rounded-2xl border bg-card/40 p-6 backdrop-blur-sm">
                <BadgeCheck className="h-6 w-6 text-primary" />
                <div className="mt-3 text-lg font-semibold">Patented</div>
                <div className="mt-1 text-sm text-muted-foreground">Across multiple countries</div>
              </div>
            </div>
          </div>
        </section>

        {/* Review */}
        <section id="review" className="relative">
          <div className="mx-auto w-full max-w-5xl px-4 py-12 md:py-16">
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                  Dr Steven Hulme&apos;s Mpillow Review
                </h2>
                <p className="text-muted-foreground">Featured review (media placeholder).</p>
              </div>

              <AspectRatio
                ratio={16 / 9}
                className="overflow-hidden rounded-2xl border bg-card/40 backdrop-blur-sm"
              >
                <div className="h-full w-full bg-muted/40" />
                <div className="absolute inset-0 grid place-items-center">
                  <div className="rounded-full border bg-background/70 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
                    Review video placeholder (16:9)
                  </div>
                </div>
              </AspectRatio>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button variant="secondary" disabled>
                  Watch review (CTA placeholder)
                </Button>
                <Button asChild variant="outline">
                  <Link href="/mp-config">Get recommended fit</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Customers */}
        <section id="stories" className="relative">
          <div className="mx-auto w-full max-w-5xl px-4 py-12 md:py-16">
            <div className="space-y-8">
              <div className="space-y-2">
                <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Hear from our customers</h2>
                <p className="text-muted-foreground">Testimonials (placeholders).</p>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                {[
                  { name: "Customer A", quote: "Placeholder quote about comfort and posture support." },
                  { name: "Customer B", quote: "Placeholder quote about waking up refreshed every day." },
                  { name: "Customer C", quote: "Placeholder quote about adjustability and washability." },
                ].map((t) => (
                  <div key={t.name} className="rounded-2xl border bg-card/40 p-6 backdrop-blur-sm">
                    <Quote className="h-5 w-5 text-primary" />
                    <div className="mt-3 text-sm text-muted-foreground leading-relaxed">{t.quote}</div>
                    <div className="mt-4 text-sm font-semibold">{t.name}</div>
                  </div>
                ))}
              </div>

              <Button variant="outline" disabled>
                Read more stories (CTA placeholder)
              </Button>
            </div>
          </div>
        </section>

        {/* Founder note */}
        <section className="relative">
          <div className="mx-auto w-full max-w-3xl px-4 py-12 md:py-16">
            <div className="rounded-2xl border bg-card/40 p-8 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Quote className="h-5 w-5 text-primary" />
                Words from the founder, Darren Yeo
              </div>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                What you&apos;re buying is not just a product but what were behind it - art, design, hard work,
                spirit, breakthroughs, innovation, adventure, persistence, dedication, time, and love.
              </p>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                A good product isn&apos;t just a result of copying another. Instead it carefully considers the needs
                and problems encountered by each individual. We spent thousands of hours researching and improving,
                learning from our failures and criticism, and making up for our losses. We believe that as long as we
                can help others, God will want us to succeed.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button variant="outline" disabled>
                  Read the full story (CTA placeholder)
                </Button>
                <Button asChild>
                  <Link href="/mp-config">Start your fit assessment</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Innovation challenge */}
        <section className="relative">
          <div className="mx-auto w-full max-w-5xl px-4 py-12 md:py-16 pb-[calc(7rem+env(safe-area-inset-bottom))]">
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Can you find them?</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Mpillow has at least 20 different innovative elements, can you find them?
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
                {Array.from({ length: 10 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border bg-card/40 px-3 py-3 text-sm text-muted-foreground backdrop-blur-sm"
                  >
                    Innovation element #{idx + 1}
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button variant="secondary" disabled>
                  Explore innovations (CTA placeholder)
                </Button>
                <Button asChild variant="outline">
                  <Link href="/mp-care">Care & maintenance</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
