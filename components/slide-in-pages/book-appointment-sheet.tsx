"use client";

import * as React from "react";

import { BookingFlow } from "@/components/slide-in-pages/booking-flow";
import { Button } from "@/components/ui/button";
import { OverlayDismissButton } from "@/components/ui/overlay-dismiss";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger, sheetStickyBottomClassName, sheetStickyTopClassName } from "@/components/ui/sheet";
import { OPEN_BOOK_APPOINTMENT_EVENT } from "@/lib/book-appointment";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/use-i18n";

function useBookAppointmentOpen() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_BOOK_APPOINTMENT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_BOOK_APPOINTMENT_EVENT, onOpen);
  }, []);

  return [open, setOpen] as const;
}

// ponytail: dropped the BOOK_APPOINTMENT_URL Google iframe (ADR 0013) — the
// Mpillow BookingFlow (location picker + slot grid on the slice-07 APIs) renders
// in the same Sheet shell. Google can't do the Location picker.
function AppointmentBody({ label, closeLabel }: { label: string; closeLabel: string }) {
  return (
    <>
      <SheetHeader className={cn(sheetStickyTopClassName, "shrink-0 md:pr-12")}>
        <SheetTitle>{label}</SheetTitle>
        <SheetClose asChild>
          <OverlayDismissButton label={closeLabel} className="hidden md:inline-flex" />
        </SheetClose>
      </SheetHeader>
      {/* ponytail: Sheet is retired in slice 05 — hardcode the default type to keep it compiling. */}
      <BookingFlow type="customisation" />
      <div className={cn(sheetStickyBottomClassName, "flex shrink-0 items-center justify-end gap-1.5 px-3 py-2.5 md:hidden")}>
        <SheetClose asChild>
          <OverlayDismissButton label={closeLabel} variant="inline" />
        </SheetClose>
      </div>
    </>
  );
}

/** Headless sheet host — mount once in root layout so openBookAppointmentSheet() works site-wide. */
export function BookAppointmentHost() {
  const { m } = useI18n();
  const [open, setOpen] = useBookAppointmentOpen();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        mobilePreset="full"
        insetTopPadding={false}
        hideClose
        className="w-full md:w-[70vw] max-w-none sm:max-w-none p-0 overflow-hidden"
      >
        <div className="flex h-[100dvh] flex-col overflow-hidden">
          <AppointmentBody label={m.slides.bookAppointment.trigger} closeLabel={m.common.close} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

type Props = {
  triggerClassName?: string;
  triggerVariant?: React.ComponentProps<typeof Button>["variant"];
  triggerLabel?: string;
};

export function BookAppointmentSheet({
  triggerClassName,
  triggerVariant = "outline",
  triggerLabel,
}: Props) {
  const { m } = useI18n();
  const label = triggerLabel ?? m.slides.bookAppointment.trigger;
  const [open, setOpen] = useBookAppointmentOpen();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant={triggerVariant} className={triggerClassName}>
          {label}
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        mobilePreset="full"
        insetTopPadding={false}
        hideClose
        className="w-full md:w-[70vw] max-w-none sm:max-w-none p-0 overflow-hidden"
      >
        <div className="flex h-[100dvh] flex-col overflow-hidden">
          <AppointmentBody label={label} closeLabel={m.common.close} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
