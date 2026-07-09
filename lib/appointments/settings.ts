/** Appointment reminder rules stored in site_settings (secrets stay in env). */

export type AppointmentType = "customisation" | "readjustment";

export type AppointmentSettings = {
  /** Default venue when calendar event has no location. */
  venue: string;
  /** Appointment length in minutes. */
  durationMinutes: number;
  /** First bookable start hour in Asia/Singapore (0–23). */
  openHour: number;
  /** Last bookable start hour in Asia/Singapore (0–23), inclusive. */
  closeHour: number;
  /**
   * Bookable weekdays as JS getDay() values (0=Sun … 6=Sat).
   * Default Tue–Sun: [0, 2, 3, 4, 5, 6].
   */
  bookableDays: number[];
  customisationBookingUrl: string;
  readjustmentBookingUrl: string;
  /** Case-insensitive substring match against event summary. */
  customisationSummaryMatch: string;
  readjustmentSummaryMatch: string;
  /** How many days ahead to search for reschedule slots. */
  slotLookaheadDays: number;
  /** Max slots offered in one WhatsApp interactive list. */
  slotOfferCount: number;
};

export const DEFAULT_APPOINTMENT_SETTINGS: AppointmentSettings = {
  venue: "512 Chai Chee Lane Singapore 469028 #02-10",
  durationMinutes: 60,
  openHour: 10,
  closeHour: 18,
  bookableDays: [0, 2, 3, 4, 5, 6], // Sun, Tue–Sat
  customisationBookingUrl: "https://calendar.app.google/wtLKP75zQRDB5gqC7",
  readjustmentBookingUrl: "https://calendar.app.google/RGe6GCxzBhX1coGV8",
  customisationSummaryMatch: "Mpillow Customisation",
  readjustmentSummaryMatch: "Mpillow Re-adjustment",
  slotLookaheadDays: 14,
  slotOfferCount: 3,
};

export const APPOINTMENT_SETTING_KEYS = [
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
] as const;

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

function parseBookableDays(v: string | undefined, fallback: number[]): number[] {
  if (v == null || v.trim() === "") return fallback;
  const days = v
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return days.length > 0 ? [...new Set(days)].sort((a, b) => a - b) : fallback;
}

/** Merge stored site_settings key/values with defaults. */
export function parseAppointmentSettings(
  stored: Record<string, string>,
): AppointmentSettings {
  const d = DEFAULT_APPOINTMENT_SETTINGS;
  return {
    venue: stored.appointments_venue?.trim() || d.venue,
    durationMinutes: parsePositiveInt(
      stored.appointments_duration_minutes,
      d.durationMinutes,
    ),
    openHour: parseHour(stored.appointments_open_hour, d.openHour),
    closeHour: parseHour(stored.appointments_close_hour, d.closeHour),
    bookableDays: parseBookableDays(
      stored.appointments_bookable_days,
      d.bookableDays,
    ),
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
  };
}

export function appointmentSettingsToStored(
  s: AppointmentSettings,
): Record<string, string> {
  return {
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
  };
}
