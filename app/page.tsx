import { HomeHeader } from "@/components/home-header";
import { Ripple } from "@/components/ui/shadcn-io/ripple";
import { Button } from "@/components/ui/button";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { AmbassadorsSlideIn } from "@/components/ambassadors-slide-in";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Award,
  BadgeCheck,
  ChevronRight,
  HeartPulse,
  Quote,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export default function Home() {
  const appointmentUrl =
    "https://calendar.google.com/calendar/appointments/schedules/AcZssZ0bNnrc_0CeREyaoByx0GDhuif5fJFTCyAQTkEJH14vNs5XT_zzqgv47CJ-FrUACncTtYs8yeas?gv=true";

  return (
    <div className="min-h-screen bg-background relative">
      <HomeHeader />

      <main className="relative overflow-x-hidden">
        {/* Hero */}
        <section className="relative">
          <AspectRatio ratio={16 / 9} className="relative w-full overflow-hidden">
            <Image
              src="/DarkMpillowImage-WEB.jpg"
              alt="Mpillow pillow hero"
              fill
              priority
              className="object-cover"
              sizes="100vw"
            />

            {/* Overlay content */}
            <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-t from-background/85 via-background/25 to-transparent" />
            <div className="absolute inset-0 z-10 flex items-end md:items-center">
              <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">
                <div className="max-w-xl space-y-6">
                  <div className="space-y-3">
                    <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl md:text-6xl">
                      Gift A Good Night’s Sleep With A{" "}
                      <span className="text-primary">100% Customised</span> Pillow
                    </h1>
                    <p className="text-base leading-relaxed text-muted-foreground sm:text-lg md:text-xl">
                      A cervical neck support pillow to maintain the perfect posture for every sleep position.
                    </p>
                  </div>

                  <div className="pointer-events-auto flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Button asChild className="h-auto px-6 py-4 text-base">
                      <Link href="/mp-config">
                        <Sparkles className="mr-2 h-5 w-5" />
                        Customise
                        <ChevronRight className="ml-2 h-5 w-5" />
                      </Link>
                    </Button>
                    <Sheet>
                      <SheetTrigger asChild>
                        <Button variant="outline" className="h-auto px-6 py-4 text-base">
                          Book an appointment
                        </Button>
                      </SheetTrigger>
                      <SheetContent
                        side="right"
                        disableMobileBottom
                        className="w-full md:w-[70vw] max-w-none sm:max-w-none p-0 overflow-hidden"
                      >
                        <SheetHeader className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur pr-12">
                          <SheetTitle>Book an appointment</SheetTitle>
                        </SheetHeader>
                        <div className="flex-1 overflow-hidden">
                          <iframe
                            src={appointmentUrl}
                            style={{ border: 0 }}
                            width="100%"
                            height="100%"
                            frameBorder="0"
                            title="Google Calendar Appointment Scheduling"
                          />
                        </div>
                      </SheetContent>
                    </Sheet>
                  </div>
                </div>
              </div>
            </div>
          </AspectRatio>

          <Ripple
            mainCircleSize={320}
            mainCircleOpacity={0.12}
            numCircles={6}
            className="absolute inset-0 -z-10"
          />
        </section>

        {/* Ambassadors / How it’s made */}
        <section id="ambassadors" className="relative">
          <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">
            <div className="grid grid-cols-1 gap-10 md:grid-cols-2 md:items-center">
              <div className="space-y-4">
                <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                  Customisable pillows for any body build
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  For our ambassadors, Skyjin and Piggie — a behind-the-scenes look at the customisation process.
                </p>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <AmbassadorsSlideIn />
                </div>
              </div>

              <AspectRatio
                ratio={16 / 9}
                className="overflow-hidden rounded-2xl border bg-card/40 backdrop-blur-sm"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://www.mpillow.com/cdn/shop/files/DSC_2362-H-WEB_1200x_71b66f9b-3cce-4686-99be-34f774ddbe8a.webp?v=1667646766&width=900"
                  alt="Mpillow ambassadors process"
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </AspectRatio>
            </div>
          </div>
        </section>

        {/* Pick your Mpillow */}
        <section id="pick" className="relative">
          <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">
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
          <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">
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
          <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">
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
          <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                  Dr Steven Hulme&apos;s Mpillow Review
                </h2>
                <p className="text-muted-foreground">Featured review.</p>
              </div>

              <AspectRatio
                ratio={16 / 9}
                className="overflow-hidden rounded-2xl border bg-card/40 backdrop-blur-sm"
              >
                <iframe
                  className="absolute inset-0 h-full w-full"
                  src="https://www.youtube.com/embed/nvFI6woJD9g?si=yiFH8pApqbX6GCxf&controls=0"
                  title="YouTube video player"
                  frameBorder={0}
                  loading="lazy"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </AspectRatio>

            </div>
          </div>
        </section>

        {/* Customers */}
        <section id="stories" className="relative">
          <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">
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
          <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">
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
          <div className="mx-auto w-full max-w-6xl px-4 pt-12 md:pt-16 pb-[calc(7rem+env(safe-area-inset-bottom))]">
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
