"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { stripLocale } from "@/lib/i18n/routing";
import { isPageBuilderPreviewRoute } from "@/lib/routing/preview-route";

import { BookingPills } from "@/components/slide-in-pages/booking-pills";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { OverlayDismissButton } from "@/components/ui/overlay-dismiss";
import { OPEN_BOOK_APPOINTMENT_EVENT } from "@/lib/book-appointment";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/lib/i18n/locales";
import { useI18n } from "@/lib/i18n/use-i18n";

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

  if (isPageBuilderPreviewRoute(stripLocale(pathname ?? "/"))) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent hideClose mobileDrawer={false} className="max-w-2xl border-0 bg-transparent shadow-none">
        <DialogHeader className="items-center text-center sm:text-center">
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
        <DialogClose asChild>
          <OverlayDismissButton
            variant="inline"
            label={m.common.close}
            className="mx-auto rounded-full border border-border bg-background/90"
          />
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
