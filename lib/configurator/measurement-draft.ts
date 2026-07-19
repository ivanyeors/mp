import { cmToInches, inchesToCm, roundCm } from "@/lib/rules-engine/units";

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
  const cm = unit === "cm" ? value : inchesToCm(value);
  return String(roundCm(cm));
}

export function displayMeasurement(unit: MeasurementUnit, cmValue: string): string {
  if (!cmValue.trim()) return "";
  const cm = Number(cmValue);
  if (!Number.isFinite(cm)) return cmValue;
  if (unit === "cm") return String(roundCm(cm));
  return String(Math.round(cmToInches(cm) * 100) / 100);
}
