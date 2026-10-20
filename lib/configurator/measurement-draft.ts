import { cmToInches, inchesToCm, roundCm } from "@/lib/rules-engine/units";

export type MeasurementUnit = "cm" | "in";

/**
 * Incomplete drafts like "16." stay invalid until the user finishes typing.
 * Without `minCm` the value must be positive; with it, anything from `minCm` up.
 */
export function normalizeMeasurementDraft(
  unit: MeasurementUnit,
  draft: string,
  minCm?: number,
): string | null {
  const trimmed = draft.trim();
  if (!trimmed || trimmed.endsWith(".") || trimmed.endsWith(",")) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  const cm = roundCm(unit === "cm" ? value : inchesToCm(value));
  if (minCm === undefined ? cm <= 0 : cm < minCm) return null;
  return String(cm);
}

export function displayMeasurement(unit: MeasurementUnit, cmValue: string): string {
  if (!cmValue.trim()) return "";
  const cm = Number(cmValue);
  if (!Number.isFinite(cm)) return cmValue;
  if (unit === "cm") return String(roundCm(cm));
  return String(Math.round(cmToInches(cm) * 100) / 100);
}
