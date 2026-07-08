"use client";

import * as React from "react";

import { ProductSlideSectionRenderer } from "@/components/product-sections/product-slide-section-renderer";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, sheetStickyBottomClassName, sheetStickyTopClassName } from "@/components/ui/sheet";
import { OverlayDismissButton } from "@/components/ui/overlay-dismiss";
import { useI18n } from "@/lib/i18n/use-i18n";
import { cervicalNeckSupportSlideSections } from "@/lib/product-slide-sections/configs/cervical-neck-support";

const OPEN_CERVICAL_NECK_SUPPORT_EVENT = "mpillow:open-cervical-neck-support";

export function openCervicalNeckSupportSheet() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPEN_CERVICAL_NECK_SUPPORT_EVENT));
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
      insetTopPadding={false}
      animation="fade-up"
      hideClose
      className="w-full max-w-none sm:max-w-none p-3 md:p-6 bg-transparent border-0 shadow-none overflow-hidden"
    >
      <div className="flex h-[100dvh] flex-col overflow-hidden rounded-2xl border bg-background shadow-sm">
        <div className={sheetStickyTopClassName}>
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
          <div className="space-y-10 pb-28">
            <ProductSlideSectionRenderer
              sections={cervicalNeckSupportSlideSections}
              messages={m.slides.cervicalNeckSupport}
            />
          </div>
        </div>

        <div className={sheetStickyBottomClassName}>
          <div className="px-4 py-4 md:px-6">
            <SheetClose asChild>
              <Button variant="outline" className="h-auto py-4 md:h-9 md:py-2">
                Back
              </Button>
            </SheetClose>
            <p className="sr-only">{m.slides.cervicalNeckSupport.bottomViewSource}</p>
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
