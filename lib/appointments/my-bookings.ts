import type { SupabaseClient } from "@supabase/supabase-js";

import { listGuestBookings, type GuestBooking } from "@/lib/appointments/calendar";
import { changeWindowOpen, isCustomisationEvent, type BookingOwner } from "@/lib/appointments/reschedule";
import type { AppointmentSettings } from "@/lib/appointments/settings";
import { supabaseAdmin } from "@/lib/supabase/server";

export type MyBooking = {
  eventId: string;
  kind: "readjustment" | "customisation";
  title: string;
  detail: string | null;
  startsAt: string;
  endsAt: string;
  locationId: string | null;
  locationName: string | null;
  changeable: boolean;
};

type ReadjustmentRow = {
  id: string;
  calendar_event_id: string;
  start_at: string;
  end_at: string;
  location_id: string | null;
  location_name: string;
  product_label: string;
};

const LOOKAHEAD_MS = 366 * 24 * 60 * 60 * 1000;

export function mergeMyBookings(input: {
  readjustments: readonly ReadjustmentRow[];
  events: readonly GuestBooking[] | null;
  locationNames: ReadonlyMap<string, string>;
  settings: AppointmentSettings;
  now: Date;
}): MyBooking[] {
  const { events, now } = input;
  const live = (events ?? []).filter((e) => e.state === "live" && Date.parse(e.startsAt) > now.getTime());
  const byId = new Map((events ?? []).map((e) => [e.id, e]));
  const nameOf = (id: string | null, fallback: string | null) => (id && input.locationNames.get(id)) || fallback;

  const out: MyBooking[] = [];
  for (const r of input.readjustments) {
    const ev = byId.get(r.calendar_event_id);
    if (ev && ev.state !== "live") continue;
    const startsAt = ev?.startsAt ?? r.start_at;
    if (Date.parse(startsAt) <= now.getTime()) continue;
    const locationId = ev?.locationId ?? r.location_id;
    out.push({
      eventId: r.calendar_event_id,
      kind: "readjustment",
      title: "Re-adjustment",
      detail: r.product_label,
      startsAt,
      endsAt: ev?.endsAt ?? r.end_at,
      locationId,
      locationName: nameOf(locationId, r.location_name),
      changeable: changeWindowOpen(startsAt, now),
    });
  }
  const listed = new Set(out.map((b) => b.eventId));
  for (const ev of live) {
    if (listed.has(ev.id) || ev.readjustmentBookingId) continue;
    if (!isCustomisationEvent(ev.summary, input.settings)) continue;
    out.push({
      eventId: ev.id,
      kind: "customisation",
      title: "Customisation",
      detail: null,
      startsAt: ev.startsAt,
      endsAt: ev.endsAt,
      locationId: ev.locationId,
      locationName: nameOf(ev.locationId, ev.location),
      changeable: changeWindowOpen(ev.startsAt, now),
    });
  }
  return out.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

export async function listMyBookings(
  owner: BookingOwner,
  deps: {
    settings: AppointmentSettings;
    locationNames: ReadonlyMap<string, string>;
    now?: Date;
    admin?: SupabaseClient;
  },
): Promise<{ bookings: MyBooking[]; calendarUnavailable: boolean }> {
  const now = deps.now ?? new Date();
  const admin = deps.admin ?? supabaseAdmin();
  const columns = "id, calendar_event_id, start_at, end_at, location_id, location_name, product_label";
  const [{ data, error }, events] = await Promise.all([
    admin
      .from("readjustment_bookings")
      .select(columns)
      .eq("customer_id", owner.customerId)
      .eq("status", "booked")
      .not("calendar_event_id", "is", null)
      .gt("end_at", now.toISOString()),
    listGuestBookings(owner.email, now.toISOString(), new Date(now.getTime() + LOOKAHEAD_MS).toISOString()).catch(
      (e) => {
        console.error("[account/bookings] calendar", e instanceof Error ? e.message : e);
        return null;
      },
    ),
  ]);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as ReadjustmentRow[];
  const listed = new Set(rows.map((r) => r.id));
  const movedLater = [
    ...new Set((events ?? []).map((e) => e.readjustmentBookingId).filter((id): id is string => !!id && !listed.has(id))),
  ];
  if (movedLater.length) {
    const extra = await admin
      .from("readjustment_bookings")
      .select(columns)
      .in("id", movedLater)
      .eq("customer_id", owner.customerId)
      .eq("status", "booked");
    if (extra.error) throw new Error(extra.error.message);
    rows.push(...((extra.data ?? []) as ReadjustmentRow[]));
  }
  return {
    bookings: mergeMyBookings({
      readjustments: rows,
      events,
      locationNames: deps.locationNames,
      settings: deps.settings,
      now,
    }),
    calendarUnavailable: events === null,
  };
}
