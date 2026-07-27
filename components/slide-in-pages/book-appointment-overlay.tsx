"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";

import { BookingPills } from "@/components/slide-in-pages/booking-pills";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OPEN_BOOK_APPOINTMENT_EVENT } from "@/lib/book-appointment";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/lib/i18n/locales";
import { useI18n } from "@/lib/i18n/use-i18n";

/**
 * Mount once in the root layout: listens for openBookAppointment() and shows the
 * pill overlay (a modal Dialog, not a drawer). Picking a pill navigates to the
 * full page route — so opening from a learn-more slide-in never stacks drawers.
 */
export function BookAppointmentOverlay() {
  const { m } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_BOOK_APPOINTMENT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_BOOK_APPOINTMENT_EVENT, onOpen);
  }, []);

  const seg = pathname?.split("/")[1] ?? "";
  const lang = isSupportedLocale(seg) ? seg : DEFAULT_LOCALE;
  const t = m.slides.bookAppointment;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{t.flow.typeLabel}</DialogDescription>
        </DialogHeader>
        <BookingPills
          lang={lang}
          onSelect={(type) => {
            setOpen(false);
            router.push(`/${lang}/appointments?type=${type}`);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
