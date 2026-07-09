import type { AppointmentSettings, AppointmentType } from "./settings";

export type ResolvedAppointmentType = {
  type: AppointmentType;
  bookingUrl: string;
  label: string;
};

/**
 * Infer Customisation vs Re-adjustment from event summary + settings match strings.
 * Unclear → customisation (fallback rebook URL).
 */
export function resolveAppointmentType(
  summary: string | null | undefined,
  settings: AppointmentSettings,
): ResolvedAppointmentType {
  const s = (summary ?? "").toLowerCase();
  const readj = settings.readjustmentSummaryMatch.toLowerCase();
  const cust = settings.customisationSummaryMatch.toLowerCase();

  if (readj && s.includes(readj)) {
    return {
      type: "readjustment",
      bookingUrl: settings.readjustmentBookingUrl,
      label: "Re-adjustment",
    };
  }
  if (cust && s.includes(cust)) {
    return {
      type: "customisation",
      bookingUrl: settings.customisationBookingUrl,
      label: "Customisation",
    };
  }
  // Loose fallbacks if settings strings drift
  if (s.includes("re-adjustment") || s.includes("readjustment")) {
    return {
      type: "readjustment",
      bookingUrl: settings.readjustmentBookingUrl,
      label: "Re-adjustment",
    };
  }
  return {
    type: "customisation",
    bookingUrl: settings.customisationBookingUrl,
    label: "Customisation",
  };
}
