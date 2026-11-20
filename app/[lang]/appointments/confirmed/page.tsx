import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, Check, MapPin } from "lucide-react";

import { ConfirmingRefresh } from "@/components/slide-in-pages/confirming-refresh";
import { Button } from "@/components/ui/button";
import { linkCustomerToAuthUser } from "@/lib/auth/customer-identity";
import { getAuthUser } from "@/lib/auth/user";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/lib/i18n/locales";
import { getMessages } from "@/lib/i18n/messages";
import { withLocale } from "@/lib/i18n/routing";
import { supabaseAdmin } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Re-adjustment booking", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ReadjustmentConfirmedPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ booking?: string }>;
}) {
  const { lang } = await params;
  const { booking: bookingId } = await searchParams;
  const locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const t = getMessages(locale).slides.bookAppointment;
  const rt = t.readjust;
  const bookAgainHref = withLocale("/appointments?type=readjustment", locale);

  const user = await getAuthUser();
  if (!user) {
    const back = withLocale(`/appointments/confirmed?booking=${encodeURIComponent(bookingId ?? "")}`, locale);
    redirect(withLocale(`/account/login?next=${encodeURIComponent(back)}`, locale));
  }
  const customer = await linkCustomerToAuthUser(user);

  const { data: booking } =
    bookingId && /^[0-9a-f-]{36}$/i.test(bookingId)
      ? await supabaseAdmin()
          .from("readjustment_bookings")
          .select("id, status, start_at, end_at, location_name, product_label, fee_amount, email, calendar_event_id")
          .eq("id", bookingId)
          .eq("customer_id", customer.id)
          .maybeSingle()
      : { data: null };

  const when = booking
    ? new Intl.DateTimeFormat(locale === "zh-CN" ? "zh-CN" : "en-SG", {
        timeZone: "Asia/Singapore",
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(booking.start_at as string))
    : "";

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col items-center justify-center gap-3 px-4 py-10 text-center">
      {!booking ? (
        <>
          <p className="text-lg font-medium">{rt.expiredTitle}</p>
          <Button asChild variant="outline">
            <Link href={bookAgainHref}>{rt.bookAgain}</Link>
          </Button>
        </>
      ) : booking.status === "awaiting_payment" ? (
        <>
          <CalendarClock className="size-10 text-muted-foreground" />
          <p className="text-lg font-medium">{rt.confirmingTitle}</p>
          <ConfirmingRefresh slowMessage={rt.confirmingSlow} />
        </>
      ) : booking.status === "needs_reschedule" ? (
        <>
          <CalendarClock className="size-10 text-muted-foreground" />
          <p className="text-lg font-medium">{rt.rescheduleTitle}</p>
          <p className="text-sm text-muted-foreground">{rt.rescheduleBody}</p>
        </>
      ) : booking.status === "expired" || booking.status === "cancelled" ? (
        <>
          <p className="text-lg font-medium">{rt.expiredTitle}</p>
          <p className="text-sm text-muted-foreground">{rt.expiredBody}</p>
          <Button asChild variant="outline">
            <Link href={bookAgainHref}>{rt.bookAgain}</Link>
          </Button>
        </>
      ) : (
        <>
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Check className="size-6" />
          </div>
          <p className="text-lg font-medium">{t.flow.confirmedTitle}</p>
          <p className="text-sm text-muted-foreground">{booking.product_label as string}</p>
          <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-4 shrink-0" />
            {when} {t.flow.confirmedAt} {booking.location_name as string}
          </p>
          <p className="text-sm font-medium text-primary">
            {rt.confirmedPaid
              .replace("{fee}", `SGD ${Number(booking.fee_amount).toFixed(2)}`)
              .replace("{email}", booking.email as string)}
          </p>
          <Button asChild className="mt-2">
            <a
              href={`/api/appointments/ics?${new URLSearchParams({
                summary: `Mpillow ${t.flow.readjustment}`,
                start: booking.start_at as string,
                end: booking.end_at as string,
                location: booking.location_name as string,
                description: booking.product_label as string,
                uid: (booking.calendar_event_id as string | null) ?? `${booking.id}@mpillow`,
              }).toString()}`}
              download="appointment.ics"
            >
              {t.flow.saveToCalendar}
            </a>
          </Button>
        </>
      )}
    </main>
  );
}
