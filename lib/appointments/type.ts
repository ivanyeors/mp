import type { AppointmentSettings, AppointmentType } from "./settings";

export type ResolvedAppointmentType = {
  type: AppointmentType;
  bookingUrl: string;
  label: string;
};

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

export function appointmentTypeInfo(
  type: AppointmentType,
  settings: AppointmentSettings,
): ResolvedAppointmentType {
  return type === "readjustment"
    ? { type, bookingUrl: settings.readjustmentBookingUrl, label: "Re-adjustment" }
    : { type: "customisation", bookingUrl: settings.customisationBookingUrl, label: "Customisation" };
}

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
