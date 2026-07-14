export type MeasurementUnit = "cm" | "in";

/** Incomplete drafts like "16." stay invalid until the user finishes typing. */
export function normalizeMeasurementDraft(
  unit: MeasurementUnit,
  draft: string,
): string | null {
  const trimmed = draft.trim();
  if (!trimmed || trimmed.endsWith(".") || trimmed.endsWith(",")) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) return null;
  const cm = unit === "cm" ? value : value * 2.54;
  return String(Math.round(cm * 100) / 100);
}

export function displayMeasurement(unit: MeasurementUnit, cmValue: string): string {
  if (!cmValue.trim()) return "";
  const cm = Number(cmValue);
  if (!Number.isFinite(cm)) return cmValue;
  if (unit === "cm") return String(Math.round(cm * 100) / 100);
  const inches = cm / 2.54;
  return String(Math.round(inches * 100) / 100);
}
