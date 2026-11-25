import { minutesOf, type AppointmentSettings } from "./settings";

export type BusyInterval = { startMs: number; endMs: number };

export type SlotOffer = {
  startIso: string;
  endIso: string;
  id: string;
};

const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;

export function sgtParts(ms: number): {
  y: number;
  m: number;
  d: number;
  hour: number;
  minute: number;
  dow: number;
} {
  const sgt = new Date(ms + SGT_OFFSET_MS);
  return {
    y: sgt.getUTCFullYear(),
    m: sgt.getUTCMonth() + 1,
    d: sgt.getUTCDate(),
    hour: sgt.getUTCHours(),
    minute: sgt.getUTCMinutes(),
    dow: sgt.getUTCDay(),
  };
}

export function sgtLocalToUtcMs(
  y: number,
  m: number,
  d: number,
  hour: number,
  minute = 0,
): number {
  return Date.UTC(y, m - 1, d, hour, minute, 0) - SGT_OFFSET_MS;
}

function overlaps(
  startMs: number,
  endMs: number,
  busy: BusyInterval[],
): boolean {
  for (const b of busy) {
    if (startMs < b.endMs && endMs > b.startMs) return true;
  }
  return false;
}

export function addSgtDays(y: number, m: number, d: number, days: number): {
  y: number;
  m: number;
  d: number;
} {
  const utc = Date.UTC(y, m - 1, d + days);
  const dt = new Date(utc);
  return {
    y: dt.getUTCFullYear(),
    m: dt.getUTCMonth() + 1,
    d: dt.getUTCDate(),
  };
}

/** ponytail: O(n) scan per slot; fine for small admin block lists. */
export function blockedRangesToBusy(
  ranges: { start: string; end: string }[],
): BusyInterval[] {
  return ranges
    .map((r) => ({ startMs: Date.parse(r.start), endMs: Date.parse(r.end) }))
    .filter((r) => Number.isFinite(r.startMs) && Number.isFinite(r.endMs) && r.startMs < r.endMs);
}

export type SgtDay = { y: number; m: number; d: number };

export function listDaySlots(
  busy: BusyInterval[],
  settings: AppointmentSettings,
  day: SgtDay,
  now: Date = new Date(),
): SlotOffer[] {
  const dow = new Date(Date.UTC(day.y, day.m - 1, day.d)).getUTCDay();
  const windows = settings.availability[dow] ?? [];
  if (!windows.length) return [];

  const duration = Math.max(1, settings.durationMinutes);
  const durationMs = duration * 60 * 1000;
  const nowMs = now.getTime();
  const allBusy = [...busy, ...blockedRangesToBusy(settings.blockedRanges)];
  const out: SlotOffer[] = [];

  for (const w of windows) {
    const from = minutesOf(w.start);
    const to = minutesOf(w.end);
    if (from == null || to == null) continue;
    for (let t = from; t + duration <= to; t += duration) {
      const startMs = sgtLocalToUtcMs(day.y, day.m, day.d, Math.floor(t / 60), t % 60);
      const endMs = startMs + durationMs;
      if (startMs <= nowMs) continue;
      if (overlaps(startMs, endMs, allBusy)) continue;

      const startIso = new Date(startMs).toISOString();
      out.push({
        startIso,
        endIso: new Date(endMs).toISOString(),
        id: `slot_${startIso}`,
      });
    }
  }
  return out;
}

const MAX_BOOKING_AHEAD_MS = 366 * 24 * 60 * 60 * 1000;

export function isOfferableSlot(
  startIso: string,
  endIso: string,
  settings: AppointmentSettings,
  now: Date = new Date(),
): boolean {
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
  if (startMs - now.getTime() > MAX_BOOKING_AHEAD_MS) return false;
  const p = sgtParts(startMs);
  return listDaySlots([], settings, { y: p.y, m: p.m, d: p.d }, now).some(
    (s) => Date.parse(s.startIso) === startMs && Date.parse(s.endIso) === endMs,
  );
}

export type DaySuggestion = { date: string; count: number };

export function formatSgtDay(day: SgtDay): string {
  return `${day.y}-${String(day.m).padStart(2, "0")}-${String(day.d).padStart(2, "0")}`;
}

// ponytail: stops at the end of next month; widen it if whole months fill up.
export function daysThroughNextMonth(now: Date = new Date()): number {
  const t = sgtParts(now.getTime());
  return Math.round((Date.UTC(t.y, t.m + 1, 1) - Date.UTC(t.y, t.m - 1, t.d)) / 86_400_000);
}

export function suggestNextDays(
  busy: BusyInterval[],
  settings: AppointmentSettings,
  { minSlots = 3, maxDays = 3 }: { minSlots?: number; maxDays?: number } = {},
  now: Date = new Date(),
): DaySuggestion[] {
  const today = sgtParts(now.getTime());
  const span = daysThroughNextMonth(now);
  const roomy: DaySuggestion[] = [];
  const any: DaySuggestion[] = [];
  for (let i = 0; i < span && roomy.length < maxDays; i++) {
    const day = addSgtDays(today.y, today.m, today.d, i);
    const count = listDaySlots(busy, settings, day, now).length;
    if (!count) continue;
    const hit = { date: formatSgtDay(day), count };
    if (any.length < maxDays) any.push(hit);
    if (count >= minSlots) roomy.push(hit);
  }
  return roomy.length ? roomy : any;
}

export type SgtMonth = { y: number; m: number };

export function monthOpenDays(
  busy: BusyInterval[],
  settings: AppointmentSettings,
  month: SgtMonth,
  now: Date = new Date(),
): DaySuggestion[] {
  const daysInMonth = new Date(Date.UTC(month.y, month.m, 0)).getUTCDate();
  const latestMs = now.getTime() + MAX_BOOKING_AHEAD_MS;
  const out: DaySuggestion[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const day = { y: month.y, m: month.m, d };
    const count = listDaySlots(busy, settings, day, now).filter(
      (s) => Date.parse(s.startIso) <= latestMs,
    ).length;
    if (count) out.push({ date: formatSgtDay(day), count });
  }
  return out;
}

export function offerSlots(
  busy: BusyInterval[],
  settings: AppointmentSettings,
  now: Date = new Date(),
): SlotOffer[] {
  const parts = sgtParts(now.getTime());
  const cursor = { y: parts.y, m: parts.m, d: parts.d };
  const out: SlotOffer[] = [];

  for (let day = 0; day <= settings.slotLookaheadDays && out.length < settings.slotOfferCount; day++) {
    const sgtDay = day === 0 ? cursor : addSgtDays(cursor.y, cursor.m, cursor.d, day);
    for (const slot of listDaySlots(busy, settings, sgtDay, now)) {
      out.push(slot);
      if (out.length >= settings.slotOfferCount) return out;
    }
  }
  return out;
}

export type EventGuest = {
  startIso: string;
  endIso: string;
  summary: string;
  locationAddress: string;
  locationId?: string;
  guestName: string;
  phone: string;
  email?: string;
  notes?: string[];
  readjustmentBookingId?: string;
};

export const LOCATION_ID_PROP = "mpLocationId";

export const READJUSTMENT_BOOKING_PROP = "mpReadjustmentBookingId";

export type EventInsertBody = {
  summary: string;
  location: string;
  description: string;
  start: { dateTime: string; timeZone: "Asia/Singapore" };
  end: { dateTime: string; timeZone: "Asia/Singapore" };
  attendees?: Array<{ email: string; displayName?: string }>;
  extendedProperties?: { private: Record<string, string> };
};

export function buildEventInsertBody(guest: EventGuest): EventInsertBody {
  const lines = [`Name: ${guest.guestName}`, `Phone: ${guest.phone}`];
  if (guest.email) lines.push(`Email: ${guest.email}`);
  if (guest.notes?.length) lines.push("", ...guest.notes);

  const body: EventInsertBody = {
    summary: guest.summary,
    location: guest.locationAddress,
    description: lines.join("\n"),
    start: { dateTime: guest.startIso, timeZone: "Asia/Singapore" },
    end: { dateTime: guest.endIso, timeZone: "Asia/Singapore" },
  };
  if (guest.email) {
    body.attendees = [{ email: guest.email, displayName: guest.guestName }];
  }
  const priv: Record<string, string> = {};
  if (guest.locationId) priv[LOCATION_ID_PROP] = guest.locationId;
  if (guest.readjustmentBookingId) priv[READJUSTMENT_BOOKING_PROP] = guest.readjustmentBookingId;
  if (Object.keys(priv).length > 0) body.extendedProperties = { private: priv };
  return body;
}

export function formatSlotLabelSgt(startIso: string): string {
  const ms = Date.parse(startIso);
  if (!Number.isFinite(ms)) return startIso;
  const p = sgtParts(ms);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][p.dow]!;
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const hh = String(p.hour).padStart(2, "0");
  const mm = String(p.minute).padStart(2, "0");
  return `${weekday} ${p.d} ${months[p.m - 1]}, ${hh}:${mm}`;
}
