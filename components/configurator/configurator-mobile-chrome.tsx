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

export const configuratorOuterPadClassName = "p-4 max-md:px-3";

export const configuratorCardPadClassName = "p-5 md:p-8";

export const configuratorPreviewPadClassName = "px-3 py-6 md:px-5";

export const configuratorMobileCloseClearanceClassName =
  "max-md:pb-[calc(6rem+var(--safe-bottom))]";

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

const mobileActionsSlotClassName = cn(
  "flex min-w-0 flex-1 items-center gap-2 border-l pl-2 empty:hidden",
  "[&>:last-child]:h-auto [&>:last-child]:min-w-0 [&>:last-child]:flex-1 [&>:last-child]:py-1.5 [&>:last-child]:whitespace-normal [&>:last-child]:text-center",
);

export function ConfiguratorMobileCloseBar({
  onClose,
  actionsRef,
}: {
  onClose: () => void;
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

export function ConfiguratorStepActions({
  mobile,
  slot,
  className,
  children,
}: {
  mobile: boolean;
  slot: HTMLElement | null;
  className?: string;
  children: ReactNode;
}) {
  if (!mobile) return <div className={className}>{children}</div>;
  return slot ? createPortal(children, slot) : null;
}
