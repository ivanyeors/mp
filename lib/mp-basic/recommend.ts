/** mp-basic sizing — placeholder shoulder→size only; tier always basic. */

import {
  inferSizeFromMeasurements,
  type PillowSize,
  type PillowTier,
} from "@/lib/results/instore-ballpark";

export type BasicMpillowInput = {
  shoulderLength: string;
  /** Accepted for future rules; not used in v1 sizing. */
  name?: string;
  gender?: string;
  ageGroup?: string;
  bloodPressureLevel?: string;
  bedFirmness?: string;
  earDiscomfortSideSleep?: string;
  acidReflux?: string;
  sleepPainAreas?: string[];
  sleepPositionType?: string[];
  usesBolster?: string;
};

export type BasicMpillowRecommendation = {
  recommended_size: PillowSize;
  recommended_kind: PillowTier;
  reasons: string[];
  summary: string;
  explanation: string;
};

// ponytail: placeholder — shoulder thresholds only; swap this module when real basic rules land
export function recommendBasicMpillow(input: BasicMpillowInput): BasicMpillowRecommendation {
  const { size, reasons } = inferSizeFromMeasurements({ shoulderLength: input.shoulderLength });
  const recommended_kind: PillowTier = "basic";
  reasons.push("Basic Mpillow flow — tier locked to basic");

  return {
    recommended_size: size,
    recommended_kind,
    reasons,
    summary: `Size ${size} — Basic`,
    explanation: `Based on your shoulder measurement, we recommend Size ${size} Basic Mpillow. ${reasons.join(". ")}.`,
  };
}
