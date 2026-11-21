import { getGoogleAccessToken } from "./google-auth";
import { normalizePhone } from "./phone";
import { matchAppointmentType, resolveAppointmentType } from "./type";
import type { AppointmentSettings, AppointmentType } from "./settings";
import type { BusyInterval, EventGuest } from "./slots";
import {
  LOCATION_ID_PROP,
  READJUSTMENT_BOOKING_PROP,
  addSgtDays,
  buildEventInsertBody,
  sgtLocalToUtcMs,
  sgtParts,
} from "./slots";

const CAL_BASE = "https://www.googleapis.com/calendar/v3";

export type CalendarGuestEvent = {
  id: string;
  summary: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
  guestName: string;
  phone: string;
  email: string | null;
  appointmentType: AppointmentType;
  bookingUrl: string;
  typeLabel: string;
  guestDeclined: boolean;
};

export type EventState = "live" | "declined" | "cancelled" | "gone";

export type CalendarRangeEvent = {
  id: string;
  summary: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  kind: "appointment" | "busy";
  description: string | null;
  eventType: string | null;
  location: string | null;
  locationId: string | null;
  locationName: string | null;
  guestName: string | null;
  phone: string | null;
  appointmentType: AppointmentType | null;
  typeLabel: string | null;
  rsvp: "accepted" | "declined" | "tentative" | "needsAction" | null;
  cancelled: boolean;
  readjustmentBookingId: string | null;
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

export type LocationRef = { id: string; name: string; address: string | null };

function normalizeAddress(a: string | null | undefined): string {
  return (a ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

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

function guestRsvp(
  ev: GCalEvent,
): "accepted" | "declined" | "tentative" | "needsAction" {
  const s = (ev.attendees ?? []).find((a) => !a.self)?.responseStatus;
  return s === "accepted" || s === "declined" || s === "tentative" ? s : "needsAction";
}

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
  if (ev.transparency === "transparent") return false;
  return true;
}

export function mapGCalItemToRangeEvent(
  ev: GCalEvent,
  settings: AppointmentSettings,
  opts: { includeCancelled?: boolean; locations?: readonly LocationRef[] } = {},
): CalendarRangeEvent | null {
  if (!ev.id) return null;
  const cancelled = ev.status === "cancelled";
  if (cancelled && !opts.includeCancelled) return null;

  const eventType = (ev.eventType ?? "default").toLowerCase();
  if (eventType === "workinglocation" || eventType === "birthday") return null;

  const matched = matchAppointmentType(ev.summary, settings);
  if (cancelled && !matched) return null;
  if (!matched && ev.transparency === "transparent") return null;

  const allDay = Boolean(ev.start?.date && !ev.start.dateTime);
  let startsAt: string;
  let endsAt: string;
  if (allDay) {
    if (!ev.start?.date || !ev.end?.date) return null;
    startsAt = ev.start.date;
    endsAt = ev.end.date;
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
    rsvp: busy ? null : guestRsvp(ev),
    cancelled,
    readjustmentBookingId: busy
      ? null
      : (ev.extendedProperties?.private?.[READJUSTMENT_BOOKING_PROP] ?? null),
  };
}

function calendarId(): string {
  return process.env.GOOGLE_CALENDAR_ID?.trim() || "primary";
}

export function toGCalRfc3339(iso: string): string {
  const s = iso.trim();
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(s)) return s;
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

export function formatGoogleCalendarError(status: number, body: string): string {
  let message = body.slice(0, 400);
  try {
    const json = JSON.parse(body) as { error?: { message?: string } };
    if (json.error?.message) message = json.error.message;
  } catch {}
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

export function extractPhoneFromEvent(ev: {
  summary?: string;
  description?: string;
  location?: string;
}): string | null {
  const blob = [ev.description, ev.summary, ev.location].filter(Boolean).join("\n");
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

export function extractGuestName(ev: GCalEvent): string | null {
  const attendee = (ev.attendees ?? []).find((a) => !a.self);
  if (attendee?.displayName?.trim()) return attendee.displayName.trim();
  if (attendee?.email?.trim()) {
    const local = attendee.email.split("@")[0]?.trim();
    if (local) return local;
  }
  const summary = ev.summary?.trim() ?? "";
  const dash = summary.split(/\s[-–—]\s/);
  if (dash.length >= 2 && dash[0]!.trim().length >= 2) return dash[0]!.trim();
  return null;
}

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

export function mapGCalItemToGuestEvent(
  ev: GCalEvent,
  settings: AppointmentSettings,
): CalendarGuestEvent | null {
  if (!ev.id) return null;
  if (ev.status === "cancelled") return null;
  if (ev.start?.date && !ev.start.dateTime) return null;
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
    guestDeclined: guestRsvp(ev) === "declined",
  };
}

export function eventStateOf(ev: GCalEvent): EventState {
  if (ev.status === "cancelled") return "cancelled";
  return guestRsvp(ev) === "declined" ? "declined" : "live";
}

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
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`events.delete failed (${res.status}): ${await res.text()}`);
  }
}

export async function getEventState(eventId: string): Promise<EventState> {
  const id = encodeURIComponent(calendarId());
  const eid = encodeURIComponent(eventId);
  const res = await calFetch(`/calendars/${id}/events/${eid}`);
  if (res.status === 404 || res.status === 410) return "gone";
  if (!res.ok) {
    throw new Error(formatGoogleCalendarError(res.status, await res.text()));
  }
  return eventStateOf((await res.json()) as GCalEvent);
}

export async function listChangedEventStates(
  updatedMinIso: string,
): Promise<Array<{ id: string; state: EventState }>> {
  const id = encodeURIComponent(calendarId());
  const out: Array<{ id: string; state: EventState }> = [];
  let pageToken: string | undefined;
  do {
    const qs = new URLSearchParams({
      updatedMin: toGCalRfc3339(updatedMinIso),
      showDeleted: "true",
      singleEvents: "true",
      maxResults: "250",
    });
    if (pageToken) qs.set("pageToken", pageToken);
    const res = await calFetch(`/calendars/${id}/events?${qs}`);
    if (!res.ok) {
      throw new Error(formatGoogleCalendarError(res.status, await res.text()));
    }
    const json = (await res.json()) as { items?: GCalEvent[]; nextPageToken?: string };
    for (const ev of json.items ?? []) {
      if (ev.id) out.push({ id: ev.id, state: eventStateOf(ev) });
    }
    pageToken = json.nextPageToken;
  } while (pageToken);
  return out;
}

export async function watchCalendarEvents(input: {
  channelId: string;
  token: string;
  address: string;
  ttlSeconds: number;
}): Promise<{ resourceId: string; expirationMs: number }> {
  const id = encodeURIComponent(calendarId());
  const res = await calFetch(`/calendars/${id}/events/watch`, {
    method: "POST",
    body: JSON.stringify({
      id: input.channelId,
      type: "web_hook",
      address: input.address,
      token: input.token,
      params: { ttl: String(input.ttlSeconds) },
    }),
  });
  if (!res.ok) {
    throw new Error(`events.watch failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as { resourceId?: string; expiration?: string };
  const expirationMs = Number(json.expiration);
  if (!json.resourceId || !Number.isFinite(expirationMs)) {
    throw new Error("events.watch returned no resourceId / expiration");
  }
  return { resourceId: json.resourceId, expirationMs };
}

export async function stopCalendarChannel(channelId: string, resourceId: string): Promise<void> {
  const res = await calFetch("/channels/stop", {
    method: "POST",
    body: JSON.stringify({ id: channelId, resourceId }),
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`channels.stop failed (${res.status}): ${await res.text()}`);
  }
}

export function venueForEvent(
  location: string | null | undefined,
  settingsVenue: string,
): string {
  return location?.trim() || settingsVenue;
}
