"use client";

import { useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { OverlayDismissButton } from "@/components/ui/overlay-dismiss";
import { pinToScreenBottom, screenBottomPinClassName } from "@/hooks/use-screen-bottom-pin";
import { publishMobileBottomBarHeight } from "@/lib/mobile-bottom-bar-height";
import { sheetStickyBottomClassName } from "@/lib/sheet/safe-area";
import { cn } from "@/lib/utils";

/** Outer wizard gutter: tighter sides on mobile. */
export const configuratorOuterPadClassName = "p-4 max-md:px-3";

/** Step cards: tighter padding on mobile. */
export const configuratorCardPadClassName = "p-5 md:p-8";

/** Preview panel side padding. */
export const configuratorPreviewPadClassName = "px-3 py-6 md:px-5";

/**
 * Room for the fixed mobile bar. The bar's own bottom padding carries the
 * safe-area inset, so the clearance has to as well or the end of a long step
 * stays under the bar on iPhones with a home indicator.
 */
export const configuratorMobileCloseClearanceClassName =
  "max-md:pb-[calc(6rem+var(--safe-bottom))]";

/**
 * A configurator's sticky top header (title row, or the Paired build's stepper).
 * In the installed app the page runs under a see-through status bar and the body
 * is padded clear of it; the header reaches up into that padding, so once it
 * sticks it covers the status bar instead of the page scrolling under the clock.
 * The page must not be inside an `overflow-x-hidden` box: that makes the box a
 * scroll container, and the header sticks to it, which never scrolls.
 */
export const configuratorStickyHeaderClassName =
  "sticky top-0 z-40 standalone:-mt-[var(--safe-top)] standalone:pt-[var(--safe-top)]";

export function ConfiguratorExitDialog({
  open,
  onOpenChange,
  description,
  onConfirmExit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  description: string;
  onConfirmExit: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="max-w-sm">
        <DialogHeader className="text-center sm:text-center">
          <DialogTitle>Exit configuration?</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-center">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Stay
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              onOpenChange(false);
              onConfirmExit();
            }}
          >
            Exit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The bar's actions slot. Empty, it collapses and Close sits alone on the right.
 * The last action — the step's Continue — takes the remaining width and wraps
 * to a second line rather than clip on a narrow phone; Back keeps its own width.
 */
const mobileActionsSlotClassName = cn(
  "flex min-w-0 flex-1 items-center gap-2 border-l pl-2 empty:hidden",
  "[&>:last-child]:h-auto [&>:last-child]:min-w-0 [&>:last-child]:flex-1 [&>:last-child]:py-1.5 [&>:last-child]:whitespace-normal [&>:last-child]:text-center",
);

/**
 * Fixed bottom bar — mobile only; slide-in safe-bottom language. Close on the
 * left, then the current step's Back / Continue (see ConfiguratorStepActions),
 * so the step's actions stay in thumb reach however far the step scrolls.
 * Pinned to the screen's real bottom edge: after a step's keyboard closes, iOS
 * would otherwise float it up the screen as the page scrolls (useScreenBottomPin).
 * Publishes its height, so the analytics notice and the chat bubble sit above
 * Back / Continue rather than over them.
 */
export function ConfiguratorMobileCloseBar({
  onClose,
  actionsRef,
}: {
  onClose: () => void;
  /** Receives the slot ConfiguratorStepActions portals into. */
  actionsRef?: (el: HTMLDivElement | null) => void;
}) {
  const barRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const unpin = pinToScreenBottom(el);
    const unpublish = publishMobileBottomBarHeight(el);
    return () => {
      unpin();
      unpublish();
    };
  }, []);
  return (
    <div
      ref={barRef}
      className={cn(
        sheetStickyBottomClassName,
        "fixed inset-x-0 z-20 md:hidden",
        screenBottomPinClassName,
      )}
    >
      <div className="flex items-center justify-end gap-2 px-3 py-2.5">
        <OverlayDismissButton variant="inline" label="Close" onClick={onClose} />
        <div ref={actionsRef} className={mobileActionsSlotClassName} />
      </div>
    </div>
  );
}

/**
 * A step's Back / Continue. Desktop renders them in place under the step; on
 * mobile they move into ConfiguratorMobileCloseBar's slot. They are portalled
 * rather than made `fixed`, because the step cards' backdrop blur and the
 * wizard's scale transition would pin a fixed child to the card, not the screen.
 */
export function ConfiguratorStepActions({
  mobile,
  slot,
  className,
  children,
}: {
  mobile: boolean;
  /** The bar's actions slot; null until the bar has mounted. */
  slot: HTMLElement | null;
  /** Desktop layout of the row. */
  className?: string;
  children: ReactNode;
}) {
  if (!mobile) return <div className={className}>{children}</div>;
  return slot ? createPortal(children, slot) : null;
}
