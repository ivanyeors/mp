import type { AppointmentSettings, AppointmentType } from "./settings";

export type ResolvedAppointmentType = {
  type: AppointmentType;
  bookingUrl: string;
  label: string;
};

/**
 * Strict match: Customisation / Re-adjustment from summary + settings strings.
 * Returns null when the event is not a known Mpillow appointment (e.g. busy/OOO).
 */
export function matchAppointmentType(
  summary: string | null | undefined,
  settings: AppointmentSettings,
): ResolvedAppointmentType | null {
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
  if (s.includes("customisation") || s.includes("customization")) {
    return {
      type: "customisation",
      bookingUrl: settings.customisationBookingUrl,
      label: "Customisation",
    };
  }
  return null;
}

/**
 * Infer type for WhatsApp rebook flows. Unclear → customisation (fallback URL).
 */
export function resolveAppointmentType(
  summary: string | null | undefined,
  settings: AppointmentSettings,
): ResolvedAppointmentType {
  return (
    matchAppointmentType(summary, settings) ?? {
      type: "customisation",
      bookingUrl: settings.customisationBookingUrl,
      label: "Customisation",
    }
  );
}
