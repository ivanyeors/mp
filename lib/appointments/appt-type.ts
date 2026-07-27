export const APPT_TYPES = ["customisation", "readjustment"] as const;

export type ApptType = (typeof APPT_TYPES)[number];

/** `?type=…` → a valid ApptType, or null (absent/invalid → page shows the pill chooser). */
export function parseApptType(value: string | null | undefined): ApptType | null {
  return APPT_TYPES.includes(value as ApptType) ? (value as ApptType) : null;
}
