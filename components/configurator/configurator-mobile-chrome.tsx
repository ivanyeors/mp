"use client";

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
import { sheetStickyBottomClassName } from "@/lib/sheet/safe-area";
import { cn } from "@/lib/utils";

/** Outer wizard gutter: tighter sides on mobile. */
export const configuratorOuterPadClassName = "p-4 max-md:px-3";

/** Step cards: tighter padding on mobile. */
export const configuratorCardPadClassName = "p-5 md:p-8";

/** Preview panel side padding. */
export const configuratorPreviewPadClassName = "px-3 py-6 md:px-5";

/** Room for fixed mobile Close bar. */
export const configuratorMobileCloseClearanceClassName = "max-md:pb-24";

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
      <DialogContent className="max-w-sm">
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

/** Fixed bottom Close — mobile only; slide-in safe-bottom language. */
export function ConfiguratorMobileCloseBar({ onClose }: { onClose: () => void }) {
  return (
    <div
      className={cn(
        sheetStickyBottomClassName,
        "fixed inset-x-0 bottom-0 z-20 md:hidden",
      )}
    >
      <div className="flex items-center justify-end gap-1.5 px-3 py-2.5">
        <OverlayDismissButton variant="inline" label="Close" onClick={onClose} />
      </div>
    </div>
  );
}
