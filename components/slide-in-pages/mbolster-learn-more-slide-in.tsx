"use client";

import * as React from "react";
import Link from "next/link";

import { SlideInPageSections, useSlideInHeader } from "@/components/slide-in-pages/slide-in-content";
import { PageFaqAccordion } from "@/components/page-faq/page-faq-accordion";
import type { PageFaqSectionItem } from "@/components/page-faq/page-faq-section";
import { openBookAppointment } from "@/lib/book-appointment";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger, sheetStickyBottomClassName, sheetStickyTopClassName } from "@/components/ui/sheet";
import { OverlayDismissButton } from "@/components/ui/overlay-dismiss";
import { cn } from "@/lib/utils";
import { PAGE_FAQ_DEFAULTS } from "@/lib/page-faq/defaults";
import type { Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { useI18n } from "@/lib/i18n/use-i18n";

export type MbolsterLearnMoreFaq = {
  title: string;
  items: PageFaqSectionItem[];
};

type Props = {
  className?: string;
  triggerLabel?: string;
  faq?: MbolsterLearnMoreFaq | null;
};

type ControlledSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  faq?: MbolsterLearnMoreFaq | null;
};

const FAQ_VIEW_ALL: Record<Locale, string> = {
  "en-US": "View all FAQs",
  "zh-CN": "查看全部常见问题",
};

/** ponytail: defaults when caller has no DB fetch (dock/landing); config page passes live set. */
function resolveMbolsterFaq(locale: Locale, faq?: MbolsterLearnMoreFaq | null): MbolsterLearnMoreFaq | null {
  if (faq && faq.items.length > 0) return faq;
  const def = PAGE_FAQ_DEFAULTS.find((d) => d.surfaceKey === "mbolster-config");
  if (!def?.items.length) return null;
  return {
    title: def.titles[locale] ?? def.titles["en-US"],
    items: def.items.map((item) => {
      const localized = item.content[locale] ?? item.content["en-US"];
      return {
        id: item.slug,
        slug: item.slug,
        question: localized.question,
        answer: localized.answer,
      };
    }),
  };
}

function MbolsterLearnMoreSheetInner({ faq }: { faq?: MbolsterLearnMoreFaq | null }) {
  const { m, locale } = useI18n();
  const header = useSlideInHeader("mbolster");
  const to = React.useCallback((href: string) => withLocale(href, locale), [locale]);
  const resolvedFaq = React.useMemo(() => resolveMbolsterFaq(locale, faq), [locale, faq]);

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
      insetTopPadding={false}
      animation="fade-up"
      hideClose
      className="w-full max-w-none sm:max-w-none p-0 md:p-6 bg-transparent border-0 shadow-none overflow-hidden"
    >
      <div className="flex h-[100dvh] flex-col overflow-hidden rounded-none border-0 bg-background md:rounded-2xl md:border md:shadow-sm">
        <div className={sheetStickyTopClassName}>
          <SheetHeader className="relative px-3 py-3 md:px-8 md:py-6 md:pr-12">
            <SheetTitle>{header.title}</SheetTitle>
            <SheetDescription>{header.description}</SheetDescription>

            <SheetClose asChild>
              <OverlayDismissButton label={m.common.close} className="hidden md:inline-flex" />
            </SheetClose>
          </SheetHeader>

          <div className="px-3 pb-2 md:px-8 md:pb-5">
            <Progress value={progress} className="h-1" />
          </div>
        </div>

        <div ref={setViewportNode} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain">
          <div className="pb-20">
            <SlideInPageSections page="mbolster" resolveHref={to} />
            {resolvedFaq ? (
              <section className="mx-auto w-full max-w-6xl px-4 py-10 md:px-8 md:py-12">
                <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                  <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
                    {resolvedFaq.title}
                  </h2>
                  <Link
                    href={to("/faq")}
                    className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                  >
                    {FAQ_VIEW_ALL[locale]}
                  </Link>
                </div>
                <PageFaqAccordion items={resolvedFaq.items} locale={locale} />
              </section>
            ) : null}
          </div>
        </div>

        <div className={sheetStickyBottomClassName}>
          <div className="flex items-center gap-1.5 px-3 py-2.5 md:gap-3 md:px-6 md:py-4">
            <Button asChild className="h-auto min-w-0 flex-1 whitespace-normal px-2.5 py-2.5 text-center text-sm leading-tight md:h-9 md:flex-none md:px-4 md:py-2 md:text-base">
              <Link href={to("/mbolster-config")}>{m.slides.mbolster.discoverButton}</Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-auto min-w-0 flex-1 whitespace-normal px-2.5 py-2.5 text-center text-sm leading-tight md:h-9 md:flex-none md:px-4 md:py-2 md:text-base"
              onClick={openBookAppointment}
            >
              {m.common.bookAppointment}
            </Button>
            <SheetClose asChild>
              <OverlayDismissButton label={m.common.close} variant="inline" className="md:hidden shrink-0" />
            </SheetClose>
          </div>
        </div>
      </div>
    </SheetContent>
  );
}

export function MbolsterLearnMoreSlideIn({ className, triggerLabel, faq }: Props) {
  const { m } = useI18n();
  const label = triggerLabel ?? m.slides.mbolster.trigger;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="secondary" className={cn("h-auto px-4 py-3", className)}>
          {label}
        </Button>
      </SheetTrigger>
      <MbolsterLearnMoreSheetInner faq={faq} />
    </Sheet>
  );
}

export function MbolsterLearnMoreSheet({ open, onOpenChange, faq }: ControlledSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <MbolsterLearnMoreSheetInner faq={faq} />
    </Sheet>
  );
}
