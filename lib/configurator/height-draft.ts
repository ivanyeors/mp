export type HeightUnit = "cm" | "m";

const MIN_HEIGHT_CM = 80;
const MAX_HEIGHT_CM = 250;

export function normalizeHeightDraft(unit: HeightUnit, draft: string): string | null {
  const value = Number(draft.trim());
  if (!Number.isFinite(value) || value <= 0) return null;
  const cm = unit === "cm" ? value : value * 100;
  if (cm < MIN_HEIGHT_CM || cm > MAX_HEIGHT_CM) return null;
  return String(Math.round(cm * 10) / 10);
}

export function displayHeight(unit: HeightUnit, heightCm: string): string {
  const cm = Number(heightCm);
  if (!Number.isFinite(cm) || heightCm.trim() === "") return "";
  if (unit === "cm") return String(Math.round(cm * 10) / 10);
  return String(Math.round(cm) / 100);
}
