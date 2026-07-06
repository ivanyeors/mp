"use client";

import * as React from "react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { OverlayDismissButton } from "@/components/ui/overlay-dismiss";
import { useI18n } from "@/lib/i18n/use-i18n";

const OPEN_CERVICAL_NECK_SUPPORT_EVENT = "mpillow:open-cervical-neck-support";

export function openCervicalNeckSupportSheet() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPEN_CERVICAL_NECK_SUPPORT_EVENT));
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-semibold tracking-tight">{children}</h3>;
}

function BenefitCard({
  imageSrc,
  imageAlt,
  title,
  description,
}: {
  imageSrc?: string;
  imageAlt?: string;
  title: string;
  description: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card/40 shadow-sm">
      {imageSrc ? (
        <div className="relative aspect-[4/3] bg-muted/20">
          <Image
            src={imageSrc}
            alt={imageAlt ?? ""}
            fill
            className="object-cover"
            sizes="(min-width: 768px) 33vw, 100vw"
          />
        </div>
      ) : null}
      <div className="p-4">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function CervicalNeckSupportSheetInner() {
  const { m } = useI18n();

  const [progress, setProgress] = React.useState(0);
  const [viewportEl, setViewportEl] = React.useState<HTMLDivElement | null>(null);

  const setViewportNode = React.useCallback((node: HTMLDivElement | null) => {
    setViewportEl(node);
  }, []);

  React.useEffect(() => {
    const viewport = viewportEl;
    if (!viewport) return;

    let raf = 0;
    const update = () => {
      const max = viewport.scrollHeight - viewport.clientHeight;
      const pct = max > 0 ? (viewport.scrollTop / max) * 100 : 0;
      setProgress(Math.max(0, Math.min(100, pct)));
    };

    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        update();
      });
    };

    update();
    viewport.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", update);

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      viewport.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", update);
    };
  }, [viewportEl]);

  return (
    <SheetContent
      side="right"
      mobilePreset="full"
      animation="fade-up"
      hideClose
      className="w-full max-w-none sm:max-w-none p-3 md:p-6 bg-transparent border-0 shadow-none overflow-hidden"
    >
      {/* Framed shell: inner rounded panel */}
      <div className="flex h-[100dvh] flex-col overflow-hidden rounded-2xl border bg-background shadow-sm">
        <div className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
          <SheetHeader className="relative px-4 py-4 md:px-8 md:py-6 md:pr-12">
            <SheetTitle>{m.slides.cervicalNeckSupport.title}</SheetTitle>
            <SheetDescription>{m.slides.cervicalNeckSupport.description}</SheetDescription>

            <SheetClose asChild>
              <OverlayDismissButton label={m.common.close} className="hidden md:inline-flex" />
            </SheetClose>
          </SheetHeader>

          <div className="px-4 pb-4 md:px-8 md:pb-5">
            <Progress value={progress} className="h-1" />
          </div>
        </div>

        <div ref={setViewportNode} className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <div className="p-0">
            <div className="space-y-10 pb-28">
              <section className="px-4 pt-5 md:px-6">
                <div className="space-y-4">
                  <div className="relative aspect-[16/9] overflow-hidden rounded-xl bg-muted/20">
                    <Image
                      src="/bev-back-sleep.png"
                      alt="Back sleeping posture with cervical neck support"
                      fill
                      className="object-cover"
                      sizes="100vw"
                      priority={false}
                    />
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {m.slides.cervicalNeckSupport.heroEyebrow}
                    </p>
                    <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
                      {m.slides.cervicalNeckSupport.heroTitle}
                    </h2>
                    {m.slides.cervicalNeckSupport.heroDescription ? (
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {m.slides.cervicalNeckSupport.heroDescription}
                      </p>
                    ) : null}
                  </div>
                </div>
              </section>

              <section className="px-4 md:px-6 space-y-3">
                <SectionTitle>{m.slides.cervicalNeckSupport.whyTitle}</SectionTitle>
                <div className="grid gap-4 md:grid-cols-2 md:items-start">
                  <div className="space-y-2">
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {m.slides.cervicalNeckSupport.whyDescription}
                    </p>
                  </div>
                  <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted/20">
                    <Image
                      src="/cns-pouch.png"
                      alt="Cervical neck support pouch"
                      fill
                      className="object-cover"
                      sizes="(min-width: 768px) 50vw, 100vw"
                      priority={false}
                    />
                  </div>
                </div>
              </section>

              <section className="px-4 md:px-6 space-y-3">
                <div className="relative overflow-hidden rounded-xl border bg-card/30">
                  <div className="relative aspect-[3/1] bg-muted/20">
                    <Image
                      src="/round-flat-head-comp.png"
                      alt="Round head vs flat head comparison"
                      fill
                      className="object-contain bg-white"
                      sizes="100vw"
                      priority={false}
                    />
                  </div>
                </div>
              </section>

              <section className="px-4 md:px-6 space-y-3">
                <SectionTitle>{m.slides.cervicalNeckSupport.benefitsTitle}</SectionTitle>
                <div className="grid gap-3 md:grid-cols-3">
                  {m.slides.cervicalNeckSupport.benefits.map((benefit, idx) => {
                    const image =
                      idx === 1
                        ? { src: "/cns-insert.png", alt: "Cervical neck support insert" }
                        : idx === 2
                          ? { src: "/cns-contact-point.png", alt: "Contact point support diagram" }
                          : null;
                    return (
                      <BenefitCard
                        key={benefit.title}
                        title={benefit.title}
                        description={benefit.description}
                        imageSrc={image?.src}
                        imageAlt={image?.alt}
                      />
                    );
                  })}
                </div>
              </section>

              <section className="px-4 md:px-6 space-y-3">
                <SectionTitle>{m.slides.cervicalNeckSupport.differenceTitle}</SectionTitle>
                <div className="space-y-2">
                  {m.slides.cervicalNeckSupport.differenceParagraphs.map((text) => (
                    <p key={text} className="text-sm leading-relaxed text-muted-foreground">
                      {text}
                    </p>
                  ))}
                </div>

                <div className="rounded-xl border bg-card/30 p-4">
                  <div className="text-sm font-semibold text-foreground">
                    {m.slides.cervicalNeckSupport.additionalBenefitsTitle}
                  </div>
                  <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                    {m.slides.cervicalNeckSupport.additionalBenefits.map((text) => (
                      <li key={text}>{text}</li>
                    ))}
                  </ul>
                </div>
              </section>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 z-10 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <div className="px-4 py-4 md:px-6">
            <SheetClose asChild>
              <Button variant="outline" className="h-auto py-4 md:h-9 md:py-2">
                Back
              </Button>
            </SheetClose>
          </div>
        </div>
      </div>
    </SheetContent>
  );
}

export function CervicalNeckSupportSheet() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_CERVICAL_NECK_SUPPORT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CERVICAL_NECK_SUPPORT_EVENT, onOpen);
  }, []);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <CervicalNeckSupportSheetInner />
    </Sheet>
  );
}