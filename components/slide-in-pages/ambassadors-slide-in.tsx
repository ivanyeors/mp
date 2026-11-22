"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/use-i18n";
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
import { SheetScrollProgress } from "@/components/slide-in-pages/sheet-scroll-progress";

type Props = {
  className?: string;
};

export function AmbassadorsSlideIn({ className }: Props) {
  const { m } = useI18n();
  const header = useSlideInHeader("ambassadors");
  const [viewportEl, setViewportEl] = React.useState<HTMLDivElement | null>(null);

  const setViewportNode = React.useCallback((node: HTMLDivElement | null) => {
    setViewportEl(node);
  }, []);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="secondary" className={cn("h-auto px-6 py-4 text-base", className)}>
          {m.slides.ambassadors.trigger}
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
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-none border-0 bg-background md:rounded-2xl md:border md:shadow-sm">
          <div className={sheetStickyTopClassName}>
            <SheetHeader className="relative px-3 py-3 md:px-6 md:pb-5 md:pr-12">
              <SheetTitle>{header.title}</SheetTitle>
              <SheetDescription>{header.description}</SheetDescription>

              <SheetClose asChild>
                <OverlayDismissButton label={m.common.close} className="hidden md:inline-flex" />
              </SheetClose>
            </SheetHeader>

            <div className="px-3 pb-2 md:px-6 md:pb-5 space-y-3">
              <SheetScrollProgress viewport={viewportEl} className="h-1" />
            </div>
          </div>

          <div ref={setViewportNode} className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            <main className="pb-20" aria-label="Mpillow ambassadors">
              <SlideInPageSections page="ambassadors" />
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

