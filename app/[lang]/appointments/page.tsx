import type { Metadata } from "next";

import { BookingFlow } from "@/components/slide-in-pages/booking-flow";
import { BookingPills } from "@/components/slide-in-pages/booking-pills";
import { parseApptType } from "@/lib/appointments/appt-type";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/lib/i18n/locales";
import { getMessages } from "@/lib/i18n/messages";

export const metadata: Metadata = {
  title: "Book an appointment",
  description: "Book a customisation or readjustment appointment with Mpillow.",
};

export default async function AppointmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { lang } = await params;
  const { type } = await searchParams;
  const appt = parseApptType(type);

  const locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const t = getMessages(locale).slides.bookAppointment;

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight md:text-3xl">{t.title}</h1>
      {appt ? (
        <BookingFlow type={appt} />
      ) : (
        <div className="flex flex-1 flex-col gap-6">
          <p className="text-muted-foreground">{t.flow.typeLabel}</p>
          <BookingPills lang={lang} />
        </div>
      )}
    </main>
  );
}
