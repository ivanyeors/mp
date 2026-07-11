"use client";

import * as React from "react";
import Link from "next/link";

import { ProductSlideSectionRenderer } from "@/components/product-sections/product-slide-section-renderer";
import { openBookAppointmentSheet } from "@/lib/book-appointment";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger, sheetStickyBottomClassName, sheetStickyTopClassName } from "@/components/ui/sheet";
import { OverlayDismissButton } from "@/components/ui/overlay-dismiss";
import { cn } from "@/lib/utils";
import { withLocale } from "@/lib/i18n/routing";
import { useI18n } from "@/lib/i18n/use-i18n";
import { mbolsterSlideSections } from "@/lib/product-slide-sections/configs/mbolster";

type Props = {
  className?: string;
  triggerLabel?: string;
};

type ControlledSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function MbolsterLearnMoreSheetInner() {
  const { m, locale } = useI18n();
  const to = React.useCallback((href: string) => withLocale(href, locale), [locale]);

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
      className="w-full max-w-none sm:max-w-none p-3 md:p-6 bg-transparent border-0 shadow-none overflow-hidden"
    >
      <div className="flex h-[100dvh] flex-col overflow-hidden rounded-2xl border bg-background shadow-sm">
        <div className={sheetStickyTopClassName}>
          <SheetHeader className="relative px-4 py-4 md:px-8 md:py-6 md:pr-12">
            <SheetTitle>{m.slides.mbolster.title}</SheetTitle>
            <SheetDescription>{m.slides.mbolster.description}</SheetDescription>

            <SheetClose asChild>
              <OverlayDismissButton label={m.common.close} className="hidden md:inline-flex" />
            </SheetClose>
          </SheetHeader>

          <div className="px-4 pb-4 md:px-8 md:pb-5">
            <Progress value={progress} className="h-1" />
          </div>
        </div>

        <div ref={setViewportNode} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain">
          <div className="pb-28">
            <ProductSlideSectionRenderer
              sections={mbolsterSlideSections}
              messages={m.slides.mbolster}
              commonMessages={m.common}
              resolveHref={to}
            />
          </div>
        </div>

        <div className={sheetStickyBottomClassName}>
          <div className="flex items-center gap-2 px-4 py-3 md:gap-3 md:px-6 md:py-4">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <Button asChild className="h-auto shrink-0 px-4 py-3 text-sm md:h-9 md:py-2 md:text-base">
                <Link href={to("/mbolster-config")}>{m.slides.mbolster.discoverButton}</Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-auto shrink-0 px-4 py-3 text-sm md:h-9 md:py-2 md:text-base"
                onClick={openBookAppointmentSheet}
              >
                {m.common.bookAppointment}
              </Button>
            </div>
            <SheetClose asChild>
              <OverlayDismissButton label={m.common.close} variant="inline" className="md:hidden shrink-0" />
            </SheetClose>
          </div>
        </div>
      </div>
    </SheetContent>
  );
}

export function MbolsterLearnMoreSlideIn({ className, triggerLabel }: Props) {
  const { m } = useI18n();
  const label = triggerLabel ?? m.slides.mbolster.trigger;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="secondary" className={cn("h-auto px-4 py-3", className)}>
          {label}
        </Button>
      </SheetTrigger>
      <MbolsterLearnMoreSheetInner />
    </Sheet>
  );
}

export function MbolsterLearnMoreSheet({ open, onOpenChange }: ControlledSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <MbolsterLearnMoreSheetInner />
    </Sheet>
  );
}
