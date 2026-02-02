"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useI18n } from "@/lib/i18n/use-i18n";

const OPEN_BOOK_APPOINTMENT_EVENT = "mpillow:open-book-appointment";

export function openBookAppointmentSheet() {
  window.dispatchEvent(new Event(OPEN_BOOK_APPOINTMENT_EVENT));
}

type Props = {
  appointmentUrl: string;
  triggerClassName?: string;
  triggerVariant?: React.ComponentProps<typeof Button>["variant"];
  triggerLabel?: string;
};

export function BookAppointmentSheet({
  appointmentUrl,
  triggerClassName,
  triggerVariant = "outline",
  triggerLabel,
}: Props) {
  const { m } = useI18n();
  const label = triggerLabel ?? m.slides.bookAppointment.trigger;
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_BOOK_APPOINTMENT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_BOOK_APPOINTMENT_EVENT, onOpen);
  }, []);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant={triggerVariant} className={triggerClassName}>
          {label}
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        disableMobileBottom
        className="w-full md:w-[70vw] max-w-none sm:max-w-none p-0 overflow-hidden"
      >
        <SheetHeader className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur pr-12">
          <SheetTitle>{label}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-hidden">
          <iframe
            src={appointmentUrl}
            style={{ border: 0 }}
            width="100%"
            height="100%"
            frameBorder="0"
            title="Google Calendar Appointment Scheduling"
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

