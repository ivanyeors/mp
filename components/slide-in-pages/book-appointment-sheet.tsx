"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { OverlayDismissButton } from "@/components/ui/overlay-dismiss";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useI18n } from "@/lib/i18n/use-i18n";

const OPEN_BOOK_APPOINTMENT_EVENT = "mpillow:open-book-appointment";

export const BOOK_APPOINTMENT_URL =
  "https://calendar.google.com/calendar/appointments/schedules/AcZssZ0bNnrc_0CeREyaoByx0GDhuif5fJFTCyAQTkEJH14vNs5XT_zzqgv47CJ-FrUACncTtYs8yeas?gv=true";

export function openBookAppointmentSheet() {
  window.dispatchEvent(new Event(OPEN_BOOK_APPOINTMENT_EVENT));
}

function useBookAppointmentOpen() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_BOOK_APPOINTMENT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_BOOK_APPOINTMENT_EVENT, onOpen);
  }, []);

  return [open, setOpen] as const;
}

function AppointmentIframe({
  appointmentUrl,
  label,
  closeLabel,
}: {
  appointmentUrl: string;
  label: string;
  closeLabel: string;
}) {
  return (
    <>
      <SheetHeader className="sticky top-0 z-10 shrink-0 border-b bg-background/80 backdrop-blur md:pr-12">
        <SheetTitle>{label}</SheetTitle>
        <SheetClose asChild>
          <OverlayDismissButton label={closeLabel} className="hidden md:inline-flex" />
        </SheetClose>
      </SheetHeader>
      <div className="min-h-0 flex-1 overflow-hidden">
        <iframe
          src={appointmentUrl}
          style={{ border: 0 }}
          width="100%"
          height="100%"
          frameBorder="0"
          title="Google Calendar Appointment Scheduling"
        />
      </div>
      {/* ponytail: iframe swallows the default corner close on mobile — keep dismiss outside the iframe */}
      <div className="sticky bottom-0 z-10 flex shrink-0 justify-end border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:hidden">
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
        hideClose
        className="w-full md:w-[70vw] max-w-none sm:max-w-none p-0 overflow-hidden"
      >
        <div className="flex h-[100dvh] flex-col overflow-hidden">
          <AppointmentIframe
            appointmentUrl={BOOK_APPOINTMENT_URL}
            label={m.slides.bookAppointment.trigger}
            closeLabel={m.common.close}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

type Props = {
  appointmentUrl?: string;
  triggerClassName?: string;
  triggerVariant?: React.ComponentProps<typeof Button>["variant"];
  triggerLabel?: string;
};

export function BookAppointmentSheet({
  appointmentUrl = BOOK_APPOINTMENT_URL,
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
        hideClose
        className="w-full md:w-[70vw] max-w-none sm:max-w-none p-0 overflow-hidden"
      >
        <div className="flex h-[100dvh] flex-col overflow-hidden">
          <AppointmentIframe appointmentUrl={appointmentUrl} label={label} closeLabel={m.common.close} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
