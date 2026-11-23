import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";

import { MyBookings } from "@/components/account/my-bookings";
import { Button } from "@/components/ui/button";
import { TALK_TO_TEAM } from "@/lib/appointments/messages";
import { listMyBookings } from "@/lib/appointments/my-bookings";
import { getAppointmentSettings } from "@/lib/appointments/settings-store";
import { linkCustomerToAuthUser } from "@/lib/auth/customer-identity";
import { getAuthUser } from "@/lib/auth/user";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { readBookingLocations } from "@/lib/locations";

export const metadata = {
  title: "Bookings",
};

export default async function AccountBookingsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

  const user = await getAuthUser();
  if (!user) {
    redirect(withLocale(`/account/login?next=${encodeURIComponent(withLocale("/account/bookings", locale))}`, locale));
  }

  const customer = await linkCustomerToAuthUser(user);
  const [settings, places] = await Promise.all([getAppointmentSettings(), readBookingLocations().catch(() => [])]);
  const { bookings, calendarUnavailable } = await listMyBookings(
    { customerId: customer.id, email: customer.email || user.email || "" },
    { settings, locationNames: new Map(places.map((p) => [p.id, p.name])) },
  ).catch(() => ({ bookings: [], calendarUnavailable: true }));

  return (
    <div className="w-full max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Bookings</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your upcoming visits. You can change the date, time or location until the day before the visit.
        </p>
      </div>

      {calendarUnavailable ? (
        <p role="status" className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
          We couldn&apos;t load every booking just now. Refresh the page to try again.
        </p>
      ) : null}

      {bookings.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <CalendarDays className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">You don&apos;t have any upcoming bookings.</p>
          <Button asChild variant="outline">
            <Link href={withLocale("/appointments", locale)}>Book a visit</Link>
          </Button>
        </div>
      ) : (
        <MyBookings
          bookings={bookings.map((b) => ({
            eventId: b.eventId,
            title: b.title,
            detail: b.detail,
            startsAt: b.startsAt,
            endsAt: b.endsAt,
            locationId: b.locationId,
            locationName: b.locationName,
            changeable: b.changeable,
          }))}
          places={places}
          closedNote={`Changes close the day before your visit. To change it now, please ${TALK_TO_TEAM}.`}
        />
      )}
    </div>
  );
}
