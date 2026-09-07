import { getGoogleAccessToken } from "./google-auth";
import { normalizePhone } from "./phone";
import { matchAppointmentType, resolveAppointmentType } from "./type";
import type { AppointmentSettings, AppointmentType } from "./settings";
import type { BusyInterval, EventGuest } from "./slots";
import {
  LOCATION_ID_PROP,
  addSgtDays,
  buildEventInsertBody,
  sgtLocalToUtcMs,
  sgtParts,
} from "./slots";

const CAL_BASE = "https://www.googleapis.com/calendar/v3";

export type CalendarGuestEvent = {
  id: string;
  summary: string;
  startsAt: string; // ISO
  endsAt: string;
  location: string | null;
  guestName: string;
  phone: string; // E.164
  /** Guest attendee email (booking flow adds one), null for staff-typed events. */
  email: string | null;
  appointmentType: AppointmentType;
  bookingUrl: string;
  typeLabel: string;
};

/** Admin calendar view — includes events without parsed phone/guest. */
export type CalendarRangeEvent = {
  id: string;
  summary: string;
  /** Timed: ISO datetime. All-day: YYYY-MM-DD (GCal exclusive end). */
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  /** Known Mpillow appointment vs other GCal busy/block time. */
  kind: "appointment" | "busy";
  /** Plain-text description from GCal (HTML stripped). */
  description: string | null;
  eventType: string | null;
  location: string | null;
  /**
   * The Location row the event was booked at: the id stamped on insert, else
   * an exact address match for events from before stamping, else null (staff
   * typed a venue by hand, or none).
   */
  locationId: string | null;
  locationName: string | null;
  guestName: string | null;
  phone: string | null;
  appointmentType: AppointmentType | null;
  typeLabel: string | null;
  /** Guest's Google RSVP. null for busy/blocked (non-appointment) ranges. */
  rsvp: "accepted" | "declined" | "tentative" | "needsAction" | null;
  /**
   * Google `status: "cancelled"`. Only surfaced for known appointments when the
   * admin opts in (`settings.showCancelled`); drawn struck-through in the grid.
   */
  cancelled: boolean;
};

type GCalEvent = {
  id?: string;
  status?: string;
  summary?: string;
  location?: string;
  description?: string;
  eventType?: string;
  transparency?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: Array<{
    displayName?: string;
    email?: string;
    self?: boolean;
    responseStatus?: string;
  }>;
  extendedProperties?: { private?: Record<string, string>; shared?: Record<string, string> };
};

/** The subset of a Location the admin calendar needs to name and colour an event. */
export type LocationRef = { id: string; name: string; address: string | null };

function normalizeAddress(a: string | null | undefined): string {
  return (a ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Pure: which Location an event belongs to. The stamped id wins; an exact
 * (whitespace/case-insensitive) address match covers events booked before
 * stamping; anything else is unresolved.
 */
export function resolveEventLocation(
  ev: Pick<GCalEvent, "location" | "extendedProperties">,
  locations: readonly LocationRef[],
): LocationRef | null {
  const stamped = ev.extendedProperties?.private?.[LOCATION_ID_PROP];
  if (stamped) {
    const byId = locations.find((l) => l.id === stamped);
    if (byId) return byId;
  }
  const addr = normalizeAddress(ev.location);
  if (!addr) return null;
  return locations.find((l) => normalizeAddress(l.address) === addr) ?? null;
}

/** Guest's Google RSVP: first non-self attendee's responseStatus. Missing/unknown → needsAction. */
function guestRsvp(
  ev: GCalEvent,
): "accepted" | "declined" | "tentative" | "needsAction" {
  const s = (ev.attendees ?? []).find((a) => !a.self)?.responseStatus;
  return s === "accepted" || s === "declined" || s === "tentative" ? s : "needsAction";
}

/** Strip simple HTML from GCal descriptions for UI labels. */
export function plainDescription(html: string | null | undefined): string | null {
  if (!html?.trim()) return null;
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{2,}/g, "\n")
    .trim();
  return text || null;
}

function isGCalBusyKind(ev: GCalEvent, matched: boolean): boolean {
  if (matched) return false;
  const t = (ev.eventType ?? "default").toLowerCase();
  if (t === "outofoffice" || t === "focustime") return true;
  // Transparent ("show as free") still listed, but not a busy block for styling
  if (ev.transparency === "transparent") return false;
  // Anything else on the calendar that isn't a known appointment → busy/block
  return true;
}

/**
 * Map one GCal events.list item for the admin mirror view. Skips incomplete
 * items. Cancelled items are skipped too unless `includeCancelled` — and even
 * then only known appointments survive: a cancelled random busy block is noise.
 */
export function mapGCalItemToRangeEvent(
  ev: GCalEvent,
  settings: AppointmentSettings,
  opts: { includeCancelled?: boolean; locations?: readonly LocationRef[] } = {},
): CalendarRangeEvent | null {
  if (!ev.id) return null;
  const cancelled = ev.status === "cancelled";
  if (cancelled && !opts.includeCancelled) return null;

  const eventType = (ev.eventType ?? "default").toLowerCase();
  // Not blocks — skip noise from status/location calendars
  if (eventType === "workinglocation" || eventType === "birthday") return null;

  const matched = matchAppointmentType(ev.summary, settings);
  if (cancelled && !matched) return null;
  // Free-time markers aren't blocked off
  if (!matched && ev.transparency === "transparent") return null;

  const allDay = Boolean(ev.start?.date && !ev.start.dateTime);
  let startsAt: string;
  let endsAt: string;
  if (allDay) {
    if (!ev.start?.date || !ev.end?.date) return null;
    startsAt = ev.start.date;
    endsAt = ev.end.date; // GCal exclusive end date
  } else {
    if (!ev.start?.dateTime || !ev.end?.dateTime) return null;
    startsAt = ev.start.dateTime;
    endsAt = ev.end.dateTime;
  }

  const busy = isGCalBusyKind(ev, matched != null);
  const phone = extractPhoneFromEvent(ev);
  const guestName = extractGuestName(ev);
  const description = plainDescription(ev.description);
  const summary =
    ev.summary?.trim() || description?.split("\n")[0]?.trim() || "(No title)";
  const resolved = busy ? null : resolveEventLocation(ev, opts.locations ?? []);

  return {
    id: ev.id,
    summary,
    startsAt,
    endsAt,
    allDay,
    kind: busy ? "busy" : "appointment",
    description,
    eventType: ev.eventType ?? null,
    location: ev.location?.trim() || null,
    locationId: resolved?.id ?? null,
    locationName: resolved?.name ?? null,
    guestName,
    phone,
    appointmentType: matched?.type ?? null,
    typeLabel: matched?.label ?? null,
    // Second visual channel — only appointments carry an RSVP; busy/OOO/blocked → none.
    rsvp: busy ? null : guestRsvp(ev),
    cancelled,
  };
}

function calendarId(): string {
  return process.env.GOOGLE_CALENDAR_ID?.trim() || "primary";
}

/**
 * FullCalendar with timeZone=Asia/Singapore sends `2026-07-05T00:00:00` (no offset).
 * Google Calendar API requires RFC3339 with Z or ±offset.
 */
export function toGCalRfc3339(iso: string): string {
  const s = iso.trim();
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(s)) return s;
  // Floating SGT wall time from our admin calendar
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return `${s}+08:00`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00:00+08:00`;
  return s;
}

async function calFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getGoogleAccessToken();
  return fetch(`${CAL_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
}

/** Prefer Google's message; call out disabled Calendar API. */
export function formatGoogleCalendarError(status: number, body: string): string {
  let message = body.slice(0, 400);
  try {
    const json = JSON.parse(body) as { error?: { message?: string } };
    if (json.error?.message) message = json.error.message;
  } catch {
    /* keep raw */
  }
  if (
    status === 403 &&
    /Calendar API has not been used|has been disabled|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(
      message,
    )
  ) {
    return (
      "Google Calendar API is disabled (or missing scope) on the OAuth GCP project. " +
      "Enable calendar-json.googleapis.com for that project, then retry. " +
      `(${message})`
    );
  }
  return `Calendar list failed (${status}): ${message}`;
}

/** Extract phone from description / summary / location free text. */
export function extractPhoneFromEvent(ev: {
  summary?: string;
  description?: string;
  location?: string;
}): string | null {
  const blob = [ev.description, ev.summary, ev.location].filter(Boolean).join("\n");
  // Prefer +65 / 65 forms, then bare 8-digit mobiles
  const patterns = [
    /\+65[\s-]?\d{4}[\s-]?\d{4}/,
    /\b65[\s-]?\d{4}[\s-]?\d{4}\b/,
    /\b[689]\d{3}[\s-]?\d{4}\b/,
  ];
  for (const re of patterns) {
    const m = blob.match(re);
    if (m) {
      const n = normalizePhone(m[0]);
      if (n) return n;
    }
  }
  return null;
}

/** Guest display name: first non-self attendee, else summary before " - ", else "Guest". */
export function extractGuestName(ev: GCalEvent): string | null {
  const attendee = (ev.attendees ?? []).find((a) => !a.self);
  if (attendee?.displayName?.trim()) return attendee.displayName.trim();
  if (attendee?.email?.trim()) {
    const local = attendee.email.split("@")[0]?.trim();
    if (local) return local;
  }
  const summary = ev.summary?.trim() ?? "";
  // "Name - Mpillow Customisation" style
  const dash = summary.split(/\s[-–—]\s/);
  if (dash.length >= 2 && dash[0]!.trim().length >= 2) return dash[0]!.trim();
  return null;
}

/** Guest email: first non-self attendee's address, else an "Email: x" line in the description. */
export function extractGuestEmail(ev: GCalEvent): string | null {
  const attendee = (ev.attendees ?? []).find((a) => !a.self && a.email?.trim());
  if (attendee?.email) return attendee.email.trim().toLowerCase();
  const text = plainDescription(ev.description) ?? "";
  const m = text.match(/email\s*:\s*([^\s<>]+@[^\s<>]+)/i);
  return m?.[1]?.trim().toLowerCase() ?? null;
}

function sgtDayBounds(now: Date, dayOffset: number): { timeMin: string; timeMax: string } {
  const p = sgtParts(now.getTime());
  const day = addSgtDays(p.y, p.m, p.d, dayOffset);
  const next = addSgtDays(day.y, day.m, day.d, 1);
  const start = sgtLocalToUtcMs(day.y, day.m, day.d, 0, 0);
  const end = sgtLocalToUtcMs(next.y, next.m, next.d, 0, 0);
  return {
    timeMin: new Date(start).toISOString(),
    timeMax: new Date(end).toISOString(),
  };
}

export async function listDayEvents(
  dayOffset: number,
  settings: AppointmentSettings,
  now: Date = new Date(),
): Promise<CalendarGuestEvent[]> {
  const { timeMin, timeMax } = sgtDayBounds(now, dayOffset);
  return listGuestEvents(timeMin, timeMax, settings);
}

/** Map one GCal item to a guest event (needs a parsed phone + name), else null. */
export function mapGCalItemToGuestEvent(
  ev: GCalEvent,
  settings: AppointmentSettings,
): CalendarGuestEvent | null {
  if (!ev.id) return null;
  if (ev.status === "cancelled") return null;
  if (ev.start?.date && !ev.start.dateTime) return null; // all-day
  if (!ev.start?.dateTime || !ev.end?.dateTime) return null;

  const phone = extractPhoneFromEvent(ev);
  const guestName = extractGuestName(ev);
  if (!phone || !guestName) return null;

  const resolved = resolveAppointmentType(ev.summary, settings);
  return {
    id: ev.id,
    summary: ev.summary ?? "",
    startsAt: ev.start.dateTime,
    endsAt: ev.end.dateTime,
    location: ev.location?.trim() || null,
    guestName,
    phone,
    email: extractGuestEmail(ev),
    appointmentType: resolved.type,
    bookingUrl: resolved.bookingUrl,
    typeLabel: resolved.label,
  };
}

/**
 * Timed events with a parsable guest (name + phone) between two instants.
 * Used by the reminder cron (one day) and the contacts sweep (next N days).
 */
export async function listGuestEvents(
  timeMinIso: string,
  timeMaxIso: string,
  settings: AppointmentSettings,
): Promise<CalendarGuestEvent[]> {
  const id = encodeURIComponent(calendarId());
  const qs = new URLSearchParams({
    timeMin: toGCalRfc3339(timeMinIso),
    timeMax: toGCalRfc3339(timeMaxIso),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  const res = await calFetch(`/calendars/${id}/events?${qs}`);
  if (!res.ok) {
    throw new Error(formatGoogleCalendarError(res.status, await res.text()));
  }
  const json = (await res.json()) as { items?: GCalEvent[] };
  const out: CalendarGuestEvent[] = [];
  for (const ev of json.items ?? []) {
    const mapped = mapGCalItemToGuestEvent(ev, settings);
    if (mapped) out.push(mapped);
  }
  return out;
}

export async function listRangeEvents(
  timeMinIso: string,
  timeMaxIso: string,
  settings: AppointmentSettings,
  locations: readonly LocationRef[] = [],
): Promise<CalendarRangeEvent[]> {
  const id = encodeURIComponent(calendarId());
  const qs = new URLSearchParams({
    timeMin: toGCalRfc3339(timeMinIso),
    timeMax: toGCalRfc3339(timeMaxIso),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  // Google keeps a deleted event's fields until it is purged, so cancelled
  // appointments still carry summary/start/end and can be drawn struck-through.
  if (settings.showCancelled) qs.set("showDeleted", "true");
  const res = await calFetch(`/calendars/${id}/events?${qs}`);
  if (!res.ok) {
    throw new Error(formatGoogleCalendarError(res.status, await res.text()));
  }
  const json = (await res.json()) as { items?: GCalEvent[] };
  const out: CalendarRangeEvent[] = [];

  for (const ev of json.items ?? []) {
    const mapped = mapGCalItemToRangeEvent(ev, settings, {
      includeCancelled: settings.showCancelled,
      locations,
    });
    if (mapped) out.push(mapped);
  }
  return out;
}

export async function freeBusy(
  timeMinIso: string,
  timeMaxIso: string,
): Promise<BusyInterval[]> {
  const res = await calFetch("/freeBusy", {
    method: "POST",
    body: JSON.stringify({
      timeMin: toGCalRfc3339(timeMinIso),
      timeMax: toGCalRfc3339(timeMaxIso),
      items: [{ id: calendarId() }],
    }),
  });
  if (!res.ok) {
    throw new Error(formatGoogleCalendarError(res.status, await res.text()));
  }
  const json = (await res.json()) as {
    calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }>;
  };
  const busy = json.calendars?.[calendarId()]?.busy ?? json.calendars?.primary?.busy ?? [];
  return busy.map((b) => ({
    startMs: Date.parse(b.start),
    endMs: Date.parse(b.end),
  }));
}

export async function patchEventTimes(
  eventId: string,
  startIso: string,
  endIso: string,
): Promise<void> {
  const id = encodeURIComponent(calendarId());
  const eid = encodeURIComponent(eventId);
  const res = await calFetch(`/calendars/${id}/events/${eid}?sendUpdates=all`, {
    method: "PATCH",
    body: JSON.stringify({
      start: { dateTime: startIso, timeZone: "Asia/Singapore" },
      end: { dateTime: endIso, timeZone: "Asia/Singapore" },
    }),
  });
  if (!res.ok) {
    throw new Error(`events.patch failed (${res.status}): ${await res.text()}`);
  }
}

/** Insert a booking event (events.insert). Returns the new event id. */
// ponytail: sendUpdates=all only mails the attendee because the token is a user-delegated
// OAuth grant (admin@mpillow.com refresh token, per google-auth.ts). A bare service-account
// JWT 403s forbiddenForServiceAccounts here — upgrade path is domain-wide delegation with an
// impersonation subject.
export async function createEvent(guest: EventGuest): Promise<string> {
  const id = encodeURIComponent(calendarId());
  const res = await calFetch(`/calendars/${id}/events?sendUpdates=all`, {
    method: "POST",
    body: JSON.stringify(buildEventInsertBody(guest)),
  });
  if (!res.ok) {
    throw new Error(`events.insert failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as { id?: string };
  if (!json.id) throw new Error("events.insert returned no event id");
  return json.id;
}

export async function deleteEvent(eventId: string): Promise<void> {
  const id = encodeURIComponent(calendarId());
  const eid = encodeURIComponent(eventId);
  const res = await calFetch(`/calendars/${id}/events/${eid}?sendUpdates=all`, {
    method: "DELETE",
  });
  // 404/410 = already gone — treat as success (idempotent)
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`events.delete failed (${res.status}): ${await res.text()}`);
  }
}

export function venueForEvent(
  location: string | null | undefined,
  settingsVenue: string,
): string {
  return location?.trim() || settingsVenue;
}
