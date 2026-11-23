import type { Metadata } from "next";
import Link from "next/link";

import { BookingFlow, type ReadjustmentBooking } from "@/components/slide-in-pages/booking-flow";
import { BookingPills } from "@/components/slide-in-pages/booking-pills";
import { Button } from "@/components/ui/button";
import { parseApptType } from "@/lib/appointments/appt-type";
import { linkCustomerToAuthUser } from "@/lib/auth/customer-identity";
import { getAuthUser } from "@/lib/auth/user";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/lib/i18n/locales";
import { getMessages } from "@/lib/i18n/messages";
import { withLocale } from "@/lib/i18n/routing";
import { loadServiceFees } from "@/lib/pricing/service-prices";
import { loadReadjustmentContext } from "@/lib/readjustment/purchases";
import { readBookingLocations } from "@/lib/locations";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { PAGE_META } from "@/lib/seo/page-meta";
import { supabaseAdmin } from "@/lib/supabase/server";

const sgd = (n: number) => `SGD ${n.toFixed(2)}`;

const APPOINTMENT_META = {
  customisation: PAGE_META.appointmentsCustomisation,
  readjustment: PAGE_META.appointmentsReadjustment,
} as const;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ type?: string }>;
}): Promise<Metadata> {
  const [{ lang }, { type }] = await Promise.all([params, searchParams]);
  const locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const appt = parseApptType(type);
  return buildPageMetadata({
    ...(appt ? APPOINTMENT_META[appt] : PAGE_META.appointments)[locale],
    path: appt ? `/appointments?type=${appt}` : "/appointments",
    lang: locale,
    noindex: appt === "readjustment",
  });
}

export const dynamic = "force-dynamic";

export default async function AppointmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ type?: string; item?: string }>;
}) {
  const { lang } = await params;
  const { type, item } = await searchParams;
  const appt = parseApptType(type);

  const locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const t = getMessages(locale).slides.bookAppointment;
  const prices =
    appt === "customisation" ? await loadServiceFees(supabaseAdmin()).catch(() => null) : null;

  let readjustment: ReadjustmentBooking | null = null;
  let signInHref: string | null = null;
  if (appt === "readjustment") {
    const user = await getAuthUser();
    if (!user) {
      const back = withLocale(
        `/appointments?type=readjustment${item ? `&item=${encodeURIComponent(item)}` : ""}`,
        locale,
      );
      signInHref = withLocale(`/account/login?next=${encodeURIComponent(back)}`, locale);
    } else {
      const customer = await linkCustomerToAuthUser(user);
      const ctx = await loadReadjustmentContext(supabaseAdmin(), customer.id);
      readjustment = {
        purchases: ctx.purchases.map((p) => ({
          orderItemId: p.orderItemId,
          orderNumber: p.orderNumber,
          label: p.label,
          imageUrl: p.imageUrl,
          paidAt: p.paidAt,
          quote: p.quote,
        })),
        fee: ctx.fee,
        preselect: item ?? null,
        prefill: {
          name: [customer.first_name, customer.last_name].filter(Boolean).join(" "),
          phone: customer.phone ?? "",
          email: customer.email,
        },
      };
    }
  }

  const locations = appt && !signInHref ? await readBookingLocations().catch(() => []) : [];

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight md:text-3xl">{t.title}</h1>
      {prices ? (
        <p className="mb-5 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
          {t.flow.measurementFeeNote
            .replace("{premium}", sgd(prices.measurement_premium.msrp))
            .replace("{basic}", sgd(prices.measurement_basic.msrp))}
        </p>
      ) : null}
      {signInHref ? (
        <div className="flex flex-col gap-4 rounded-lg border p-5">
          <h2 className="text-lg font-medium">{t.readjust.signInTitle}</h2>
          <p className="text-sm text-muted-foreground">{t.readjust.signInBody}</p>
          <Button asChild size="lg">
            <Link href={signInHref}>{t.readjust.signInCta}</Link>
          </Button>
        </div>
      ) : appt ? (
        <BookingFlow type={appt} readjustment={readjustment ?? undefined} locations={locations} />
      ) : (
        <div className="flex flex-1 flex-col gap-6">
          <p className="text-muted-foreground">{t.flow.typeLabel}</p>
          <BookingPills lang={lang} />
        </div>
      )}
    </main>
  );
}
