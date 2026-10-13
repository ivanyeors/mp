"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";

type Booking = {
  id: string;
  status: string;
  purchase_source: "platform" | "unlisted";
  order_number: string | null;
  product_label: string;
  purchase_paid_at: string | null;
  unlisted_where: string | null;
  unlisted_reference: string | null;
  complimentary: boolean;
  fee_amount: number | string;
  fee_order_id: string | null;
  fee_order_number: string | null;
  purchase_order_id: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  awaiting_payment: "Awaiting payment",
  booked: "Booked",
  attended: "Attended",
  no_show: "No-show",
  cancelled: "Cancelled",
  expired: "Payment not completed",
  needs_reschedule: "Paid — needs a new time",
};

const WHERE_LABEL: Record<string, string> = {
  online_before_accounts: "online, before accounts",
  in_store: "in store",
  gift: "a gift",
  other: "somewhere else",
};

const day = (iso: string) =>
  new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", day: "numeric", month: "short", year: "numeric" }).format(
    new Date(iso),
  );

/**
 * The Re-adjustment behind an appointment (ADR 0024): which pillow, its order,
 * whether the visit is free or paid, and the Attended / No-show / Cancel actions.
 */
export function ReadjustmentPanel({ bookingId, onChanged }: { bookingId: string; onChanged?: () => void }) {
  const pathname = usePathname() ?? "/";
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const [booking, setBooking] = React.useState<Booking | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    fetch(`/api/settings/readjustments/${encodeURIComponent(bookingId)}`)
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        if (!alive) return;
        if (r.ok && body?.booking) setBooking(body.booking);
        else setError(body?.error ?? "Could not load the re-adjustment");
      })
      .catch(() => alive && setError("Could not load the re-adjustment"));
    return () => {
      alive = false;
    };
  }, [bookingId]);

  async function act(action: "attended" | "no_show" | "cancel") {
    if (action === "cancel" && !window.confirm("Cancel this re-adjustment? The customer is told by Google Calendar.")) {
      return;
    }
    setBusy(action);
    try {
      const res = await fetch(`/api/settings/readjustments/${encodeURIComponent(bookingId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Failed");
      setBooking(body.booking);
      toast.success(STATUS_LABEL[body.booking.status] ?? "Updated");
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!booking) return <p className="text-sm text-muted-foreground">Loading re-adjustment…</p>;

  const fee = Number(booking.fee_amount);
  const open = booking.status === "booked" || booking.status === "no_show" || booking.status === "attended";

  return (
    <section className="mt-4 space-y-3 rounded-lg border p-3 text-sm" aria-label="Re-adjustment">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium">Re-adjustment</h3>
        <Badge variant="outline">{STATUS_LABEL[booking.status] ?? booking.status}</Badge>
      </div>
      <div>
        <div className="font-medium">{booking.product_label}</div>
        {booking.purchase_source === "platform" ? (
          <div className="text-muted-foreground">
            {booking.purchase_order_id ? (
              <Link
                href={withLocale(`/settings/orders/${booking.purchase_order_id}`, locale)}
                className="underline underline-offset-2"
              >
                Order #{booking.order_number}
              </Link>
            ) : (
              <>Order #{booking.order_number}</>
            )}
            {booking.purchase_paid_at ? ` · bought ${day(booking.purchase_paid_at)}` : null}
          </div>
        ) : (
          <div className="text-amber-700 dark:text-amber-400">
            Not listed — bought {WHERE_LABEL[booking.unlisted_where ?? ""] ?? "elsewhere"}
            {booking.unlisted_reference ? ` · ref ${booking.unlisted_reference}` : ""}. Check proof of purchase.
          </div>
        )}
      </div>
      <div>
        {booking.complimentary ? (
          <Badge>Complimentary</Badge>
        ) : (
          <span>
            Paid SGD {fee.toFixed(2)}
            {booking.fee_order_id ? (
              <>
                {" · "}
                <Link
                  href={withLocale(`/settings/orders/${booking.fee_order_id}`, locale)}
                  className="underline underline-offset-2"
                >
                  Order #{booking.fee_order_number}
                </Link>
              </>
            ) : null}
          </span>
        )}
      </div>
      {booking.status === "no_show" && booking.complimentary ? (
        <p className="text-xs text-muted-foreground">The free visit stays used. Cancel instead to give it back.</p>
      ) : null}
      {booking.status === "cancelled" && !booking.complimentary && booking.fee_order_id ? (
        <p className="text-xs text-muted-foreground">Refund from the Order if appropriate.</p>
      ) : null}
      {open ? (
        <div className="flex flex-wrap gap-2">
          {booking.status !== "attended" ? (
            <Button size="sm" disabled={busy != null} onClick={() => void act("attended")}>
              {busy === "attended" ? "Saving…" : "Mark attended"}
            </Button>
          ) : null}
          {booking.status !== "no_show" ? (
            <Button size="sm" variant="outline" disabled={busy != null} onClick={() => void act("no_show")}>
              {busy === "no_show" ? "Saving…" : "No-show"}
            </Button>
          ) : null}
          {booking.status !== "attended" ? (
            <Button size="sm" variant="ghost" disabled={busy != null} onClick={() => void act("cancel")}>
              {busy === "cancel" ? "Cancelling…" : "Cancel booking"}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
