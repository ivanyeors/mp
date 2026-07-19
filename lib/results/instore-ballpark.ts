/**
 * Rule-based size×tier ballpark for in-store mp-config measurements (no filling lines).
 * // ponytail: bootstrap/legacy — callers use lib/rules-engine/recommend when a graph is published
 */

export type PillowSize = "XS" | "S" | "M" | "L" | "XL";
export type PillowTier = "basic" | "premium";

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
};

export function inferSizeFromMeasurements(
  data: Record<string, unknown>,
): { size: PillowSize; reasons: string[] } {
  const shoulder = toNumber(data.shoulderLength);
  if (!shoulder) return { size: "M", reasons: ["Missing shoulder length; defaulting to M"] };

  if (shoulder <= 36) return { size: "XS", reasons: [`Shoulder length ${shoulder}cm → XS`] };
  if (shoulder <= 40) return { size: "S", reasons: [`Shoulder length ${shoulder}cm → S`] };
  if (shoulder <= 46) return { size: "M", reasons: [`Shoulder length ${shoulder}cm → M`] };
  if (shoulder <= 52) return { size: "L", reasons: [`Shoulder length ${shoulder}cm → L`] };
  return { size: "XL", reasons: [`Shoulder length ${shoulder}cm → XL`] };
}

export function inferTierFromQuestions(
  data: Record<string, unknown>,
): { tier: PillowTier; reasons: string[] } {
  const acidReflux = String(data.acidReflux ?? "");
  const ear = String(data.earDiscomfortSideSleep ?? "");

  const reasons: string[] = [];
  let tier: PillowTier = "basic";
  if (acidReflux === "yes") {
    tier = "premium";
    reasons.push("Acid reflux = yes → prefer premium support/loft options");
  } else if (ear === "yes") {
    tier = "premium";
    reasons.push("Ear discomfort = yes → prefer premium comfort options");
  } else {
    reasons.push("No reflux/ear discomfort flags → default to basic");
  }
  return { tier, reasons };
}

export function ballparkFromMpConfigData(data: Record<string, unknown>): {
  suggested_size: PillowSize;
  suggested_tier: PillowTier;
} {
  const sizeGuess = inferSizeFromMeasurements(data);
  const tierGuess = inferTierFromQuestions(data);
  return { suggested_size: sizeGuess.size, suggested_tier: tierGuess.tier };
}
