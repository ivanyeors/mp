import { getGoogleAccessToken } from "./google-auth";
import { normalizePhone } from "./phone";
import { resolveAppointmentType } from "./type";
import type { AppointmentSettings, AppointmentType } from "./settings";
import type { BusyInterval } from "./slots";
import { addSgtDays, sgtLocalToUtcMs, sgtParts } from "./slots";

const CAL_BASE = "https://www.googleapis.com/calendar/v3";

export type CalendarGuestEvent = {
  id: string;
  summary: string;
  startsAt: string; // ISO
  endsAt: string;
  location: string | null;
  guestName: string;
  phone: string; // E.164
  appointmentType: AppointmentType;
  bookingUrl: string;
  typeLabel: string;
};

type GCalEvent = {
  id?: string;
  status?: string;
  summary?: string;
  location?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: Array<{ displayName?: string; email?: string; self?: boolean }>;
};

function calendarId(): string {
  return process.env.GOOGLE_CALENDAR_ID?.trim() || "primary";
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
  const id = encodeURIComponent(calendarId());
  const qs = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "100",
  });
  const res = await calFetch(`/calendars/${id}/events?${qs}`);
  if (!res.ok) {
    throw new Error(`Calendar list failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as { items?: GCalEvent[] };
  const out: CalendarGuestEvent[] = [];

  for (const ev of json.items ?? []) {
    if (!ev.id) continue;
    if (ev.status === "cancelled") continue;
    if (ev.start?.date && !ev.start.dateTime) continue; // all-day
    if (!ev.start?.dateTime || !ev.end?.dateTime) continue;

    const phone = extractPhoneFromEvent(ev);
    const guestName = extractGuestName(ev);
    if (!phone || !guestName) continue;

    const resolved = resolveAppointmentType(ev.summary, settings);
    out.push({
      id: ev.id,
      summary: ev.summary ?? "",
      startsAt: ev.start.dateTime,
      endsAt: ev.end.dateTime,
      location: ev.location?.trim() || null,
      guestName,
      phone,
      appointmentType: resolved.type,
      bookingUrl: resolved.bookingUrl,
      typeLabel: resolved.label,
    });
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
      timeMin: timeMinIso,
      timeMax: timeMaxIso,
      items: [{ id: calendarId() }],
    }),
  });
  if (!res.ok) {
    throw new Error(`freeBusy failed (${res.status}): ${await res.text()}`);
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
  const res = await calFetch(`/calendars/${id}/events/${eid}`, {
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

export async function deleteEvent(eventId: string): Promise<void> {
  const id = encodeURIComponent(calendarId());
  const eid = encodeURIComponent(eventId);
  const res = await calFetch(`/calendars/${id}/events/${eid}`, { method: "DELETE" });
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
