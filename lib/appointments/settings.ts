export type AppointmentType = "customisation" | "readjustment";

export type BlockedRange = { start: string; end: string };

export type AvailabilityWindow = { start: string; end: string };
export type WeeklyAvailability = AvailabilityWindow[][];

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export type AppointmentSettings = {
  whatsappEnabled: boolean;
  venue: string;
  durationMinutes: number;
  availability: WeeklyAvailability;
  openHour: number;
  closeHour: number;
  bookableDays: number[];
  customisationBookingUrl: string;
  readjustmentBookingUrl: string;
  customisationSummaryMatch: string;
  readjustmentSummaryMatch: string;
  slotLookaheadDays: number;
  slotOfferCount: number;
  blockedRanges: BlockedRange[];
  showCancelled: boolean;
};

export const DEFAULT_AVAILABILITY_WINDOW: AvailabilityWindow = { start: "10:00", end: "19:00" };
const DEFAULT_WINDOW = DEFAULT_AVAILABILITY_WINDOW;

export const DEFAULT_APPOINTMENT_SETTINGS: AppointmentSettings = {
  whatsappEnabled: true,
  venue: "22 Sin Ming Lane, #08-83, Midview City, Singapore 573969",
  durationMinutes: 60,
  availability: [0, 2, 3, 4, 5, 6].reduce<WeeklyAvailability>(
    (av, dow) => {
      av[dow] = [{ ...DEFAULT_WINDOW }];
      return av;
    },
    Array.from({ length: 7 }, () => []),
  ),
  openHour: 10,
  closeHour: 18,
  bookableDays: [0, 2, 3, 4, 5, 6],
  customisationBookingUrl: "https://calendar.app.google/wtLKP75zQRDB5gqC7",
  readjustmentBookingUrl: "https://calendar.app.google/RGe6GCxzBhX1coGV8",
  customisationSummaryMatch: "Mpillow Customisation",
  readjustmentSummaryMatch: "Mpillow Re-adjustment",
  slotLookaheadDays: 14,
  slotOfferCount: 3,
  blockedRanges: [],
  showCancelled: false,
};

export const APPOINTMENT_SETTING_KEYS = [
  "appointments_whatsapp_enabled",
  "appointments_venue",
  "appointments_duration_minutes",
  "appointments_open_hour",
  "appointments_close_hour",
  "appointments_bookable_days",
  "appointments_customisation_booking_url",
  "appointments_readjustment_booking_url",
  "appointments_customisation_summary_match",
  "appointments_readjustment_summary_match",
  "appointments_slot_lookahead_days",
  "appointments_slot_offer_count",
  "appointments_blocked_ranges",
  "appointments_show_cancelled",
  "appointments_availability",
] as const;

export function minutesOf(hhmm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min !== 0)) return null;
  return h * 60 + min;
}

export function hhmm(minutes: number): string {
  const clamped = Math.max(0, Math.min(1440, Math.round(minutes)));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

export function validateAvailability(av: unknown): string | null {
  if (!Array.isArray(av) || av.length !== 7) return "availability must list seven days";
  let any = false;
  for (let dow = 0; dow < 7; dow++) {
    const day = av[dow];
    if (!Array.isArray(day)) return `${WEEKDAY_LABELS[dow]}: windows must be a list`;
    const spans: [number, number][] = [];
    for (const w of day as unknown[]) {
      if (!w || typeof w !== "object") return `${WEEKDAY_LABELS[dow]}: bad window`;
      const { start, end } = w as Partial<AvailabilityWindow>;
      const a = typeof start === "string" ? minutesOf(start) : null;
      const b = typeof end === "string" ? minutesOf(end) : null;
      if (a == null || b == null) return `${WEEKDAY_LABELS[dow]}: times must be HH:MM`;
      if (a >= b) return `${WEEKDAY_LABELS[dow]}: a window must end after it starts`;
      spans.push([a, b]);
    }
    spans.sort((x, y) => x[0] - y[0]);
    for (let i = 1; i < spans.length; i++) {
      if (spans[i]![0] < spans[i - 1]![1]) return `${WEEKDAY_LABELS[dow]}: windows overlap`;
    }
    if (spans.length) any = true;
  }
  return any ? null : "At least one open window is required";
}

export function normalizeAvailability(av: WeeklyAvailability): WeeklyAvailability {
  return av.map((day) =>
    [...day]
      .map((w) => ({ start: w.start.trim(), end: w.end.trim() }))
      .sort((x, y) => (minutesOf(x.start) ?? 0) - (minutesOf(y.start) ?? 0)),
  );
}

export function availabilityFromLegacy(legacy: {
  openHour: number;
  closeHour: number;
  bookableDays: number[];
  durationMinutes: number;
}): WeeklyAvailability {
  const start = hhmm(legacy.openHour * 60);
  const end = hhmm(Math.min(1440, legacy.closeHour * 60 + legacy.durationMinutes));
  return Array.from({ length: 7 }, (_, dow) =>
    legacy.bookableDays.includes(dow) ? [{ start, end }] : [],
  );
}

export function legacyFromAvailability(
  av: WeeklyAvailability,
  durationMinutes: number,
): { openHour: number; closeHour: number; bookableDays: number[] } {
  let earliest = Infinity;
  let latestEnd = -Infinity;
  const bookableDays: number[] = [];
  av.forEach((day, dow) => {
    if (!day.length) return;
    bookableDays.push(dow);
    for (const w of day) {
      earliest = Math.min(earliest, minutesOf(w.start) ?? earliest);
      latestEnd = Math.max(latestEnd, minutesOf(w.end) ?? latestEnd);
    }
  });
  if (!bookableDays.length) {
    const d = DEFAULT_APPOINTMENT_SETTINGS;
    return { openHour: d.openHour, closeHour: d.closeHour, bookableDays: [] };
  }
  const openHour = Math.floor(earliest / 60);
  const closeHour = Math.max(openHour, Math.floor((latestEnd - durationMinutes) / 60));
  return { openHour, closeHour: Math.min(23, closeHour), bookableDays };
}

export function withDerivedHours(s: AppointmentSettings): AppointmentSettings {
  return { ...s, ...legacyFromAvailability(s.availability, s.durationMinutes) };
}

function parseAvailability(v: string | undefined): WeeklyAvailability | null {
  if (v == null || v.trim() === "") return null;
  try {
    const raw = JSON.parse(v) as unknown;
    if (validateAvailability(raw)) return null;
    return normalizeAvailability(raw as WeeklyAvailability);
  } catch {
    return null;
  }
}

function parsePositiveInt(v: string | undefined, fallback: number): number {
  if (v == null || v === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

function parseHour(v: string | undefined, fallback: number): number {
  if (v == null || v === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 23) return fallback;
  return Math.floor(n);
}

function parseBool(v: string | undefined, fallback: boolean): boolean {
  if (v == null || v.trim() === "") return fallback;
  const t = v.trim().toLowerCase();
  if (t === "true" || t === "1") return true;
  if (t === "false" || t === "0") return false;
  return fallback;
}

function parseBookableDays(v: string | undefined, fallback: number[]): number[] {
  if (v == null || v.trim() === "") return fallback;
  const days = v
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return days.length > 0 ? [...new Set(days)].sort((a, b) => a - b) : fallback;
}

function parseBlockedRanges(v: string | undefined, fallback: BlockedRange[]): BlockedRange[] {
  if (v == null || v.trim() === "") return fallback;
  try {
    const raw = JSON.parse(v) as unknown;
    if (!Array.isArray(raw)) return fallback;
    const out: BlockedRange[] = [];
    for (const item of raw) {
      if (
        item &&
        typeof item === "object" &&
        typeof (item as BlockedRange).start === "string" &&
        typeof (item as BlockedRange).end === "string" &&
        Date.parse((item as BlockedRange).start) < Date.parse((item as BlockedRange).end)
      ) {
        out.push({ start: (item as BlockedRange).start, end: (item as BlockedRange).end });
      }
    }
    return out;
  } catch {
    return fallback;
  }
}

export function parseAppointmentSettings(
  stored: Record<string, string>,
): AppointmentSettings {
  const d = DEFAULT_APPOINTMENT_SETTINGS;
  const durationMinutes = parsePositiveInt(
    stored.appointments_duration_minutes,
    d.durationMinutes,
  );
  const legacy = {
    openHour: parseHour(stored.appointments_open_hour, d.openHour),
    closeHour: parseHour(stored.appointments_close_hour, d.closeHour),
    bookableDays: parseBookableDays(stored.appointments_bookable_days, d.bookableDays),
    durationMinutes,
  };
  const availability =
    parseAvailability(stored.appointments_availability) ?? availabilityFromLegacy(legacy);
  const derived = legacyFromAvailability(availability, durationMinutes);
  return {
    venue: stored.appointments_venue?.trim() || d.venue,
    durationMinutes,
    availability,
    ...derived,
    customisationBookingUrl:
      stored.appointments_customisation_booking_url?.trim() ||
      d.customisationBookingUrl,
    readjustmentBookingUrl:
      stored.appointments_readjustment_booking_url?.trim() ||
      d.readjustmentBookingUrl,
    customisationSummaryMatch:
      stored.appointments_customisation_summary_match?.trim() ||
      d.customisationSummaryMatch,
    readjustmentSummaryMatch:
      stored.appointments_readjustment_summary_match?.trim() ||
      d.readjustmentSummaryMatch,
    slotLookaheadDays: parsePositiveInt(
      stored.appointments_slot_lookahead_days,
      d.slotLookaheadDays,
    ),
    slotOfferCount: parsePositiveInt(
      stored.appointments_slot_offer_count,
      d.slotOfferCount,
    ),
    blockedRanges: parseBlockedRanges(
      stored.appointments_blocked_ranges,
      d.blockedRanges,
    ),
    showCancelled: parseBool(stored.appointments_show_cancelled, d.showCancelled),
    whatsappEnabled: parseBool(
      stored.appointments_whatsapp_enabled,
      d.whatsappEnabled,
    ),
  };
}

export function appointmentSettingsToStored(
  s: AppointmentSettings,
): Record<string, string> {
  return {
    appointments_whatsapp_enabled: String(s.whatsappEnabled),
    appointments_venue: s.venue,
    appointments_duration_minutes: String(s.durationMinutes),
    appointments_open_hour: String(s.openHour),
    appointments_close_hour: String(s.closeHour),
    appointments_bookable_days: s.bookableDays.join(","),
    appointments_customisation_booking_url: s.customisationBookingUrl,
    appointments_readjustment_booking_url: s.readjustmentBookingUrl,
    appointments_customisation_summary_match: s.customisationSummaryMatch,
    appointments_readjustment_summary_match: s.readjustmentSummaryMatch,
    appointments_slot_lookahead_days: String(s.slotLookaheadDays),
    appointments_slot_offer_count: String(s.slotOfferCount),
    appointments_blocked_ranges: JSON.stringify(s.blockedRanges),
    appointments_show_cancelled: String(s.showCancelled),
    appointments_availability: JSON.stringify(s.availability),
  };
}
