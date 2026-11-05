"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger, sheetStickyBottomClassName, sheetStickyTopClassName } from "@/components/ui/sheet";
import { OverlayDismissButton } from "@/components/ui/overlay-dismiss";
import { SlideInPageSections, useSlideInHeader } from "@/components/slide-in-pages/slide-in-content";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/use-i18n";

type Props = {
  className?: string;
};

export function SizeMattersSlideIn({ className }: Props) {
  const { m } = useI18n();
  const header = useSlideInHeader("size-matters");
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
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="secondary" className={cn("h-auto px-6 py-4 text-base", className)}>
          {m.slides.sizeMatters.trigger}
        </Button>
      </SheetTrigger>

      <SheetContent
        side="right"
        mobilePreset="full"
        insetTopPadding={false}
        animation="fade-up"
        hideClose
        className="w-full max-w-none sm:max-w-none p-0 md:p-6 bg-transparent border-0 shadow-none overflow-hidden"
      >
        {/* Mobile: edge-to-edge; md+: framed shell */}
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

          <div ref={setViewportNode} className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
            {/* Sections and copy are Page Builder–editable (CONTEXT.md — Slide-in section). */}
            <main className="min-w-0 pb-20" aria-label="Mpillow sizing and fit">
              <SlideInPageSections page="size-matters" />
            </main>
          </div>

          <div className={cn(sheetStickyBottomClassName, "flex items-center justify-end gap-1.5 px-3 py-2.5 md:hidden")}>
            <SheetClose asChild>
              <OverlayDismissButton label={m.common.close} variant="inline" />
            </SheetClose>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

