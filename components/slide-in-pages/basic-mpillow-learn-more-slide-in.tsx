"use client";

import * as React from "react";
import Link from "next/link";

import { openBookAppointment } from "@/lib/book-appointment";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  sheetStickyBottomClassName,
  sheetStickyTopClassName,
} from "@/components/ui/sheet";
import { OverlayDismissButton } from "@/components/ui/overlay-dismiss";
import { SlideInPageSections, useSlideInHeader } from "@/components/slide-in-pages/slide-in-content";
import { cn } from "@/lib/utils";
import { withLocale } from "@/lib/i18n/routing";
import { useI18n } from "@/lib/i18n/use-i18n";

type Props = {
  className?: string;
  triggerLabel?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
};

function BasicMpillowLearnMoreSheetInner() {
  const { m, locale } = useI18n();
  const header = useSlideInHeader("basic-mpillow");
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

        <div ref={setViewportNode} className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <div className="space-y-10 pb-20">
            <SlideInPageSections page="basic-mpillow" resolveHref={to} />
          </div>
        </div>

        <div className={sheetStickyBottomClassName}>
          <div className="flex items-center gap-1.5 px-3 py-2.5 md:gap-3 md:px-6 md:py-4">
            <Button asChild className="h-auto min-w-0 flex-1 whitespace-normal px-2.5 py-2.5 text-center text-sm leading-tight md:h-9 md:flex-none md:px-4 md:py-2 md:text-base">
              <Link href={to("/mp-basic")}>{m.slides.basicMpillow.bottomCustomise}</Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-auto min-w-0 flex-1 whitespace-normal px-2.5 py-2.5 text-center text-sm leading-tight md:h-9 md:flex-none md:px-4 md:py-2 md:text-base"
              onClick={openBookAppointment}
            >
              {m.slides.basicMpillow.bookAdjustment}
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

export function BasicMpillowLearnMoreSheet({ open, onOpenChange, children, className, triggerLabel }: Props) {
  const { m } = useI18n();
  const label = triggerLabel ?? m.slides.basicMpillow.trigger;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {open === undefined && (
        <SheetTrigger asChild>
          {children ?? (
            <Button variant="secondary" className={cn("h-auto py-2.5", className)}>
              {label}
            </Button>
          )}
        </SheetTrigger>
      )}
      <BasicMpillowLearnMoreSheetInner />
    </Sheet>
  );
}
