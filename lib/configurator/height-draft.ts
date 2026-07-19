import { cmToInches, inchesToCm, roundCm } from "@/lib/rules-engine/units";

export type HeightUnit = "cm" | "m" | "in";

const MIN_HEIGHT_CM = 80;
const MAX_HEIGHT_CM = 250;

export function normalizeHeightDraft(unit: HeightUnit, draft: string): string | null {
  const trimmed = draft.trim();
  if (!trimmed || trimmed.endsWith(".") || trimmed.endsWith(",")) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) return null;
  const cm =
    unit === "cm" ? value : unit === "m" ? value * 100 : inchesToCm(value);
  if (cm < MIN_HEIGHT_CM || cm > MAX_HEIGHT_CM) return null;
  return String(Math.round(cm * 10) / 10);
}

export function displayHeight(unit: HeightUnit, heightCm: string): string {
  const cm = Number(heightCm);
  if (!Number.isFinite(cm) || heightCm.trim() === "") return "";
  if (unit === "cm") return String(Math.round(cm * 10) / 10);
  if (unit === "m") return String(Math.round(cm) / 100);
  return String(Math.round(cmToInches(cm) * 100) / 100);
}

/** Round-trip helper for checks (canonical cm stays the stored value). */
export function heightInchesRoundTrip(inches: number): number {
  return roundCm(inchesToCm(inches));
}
