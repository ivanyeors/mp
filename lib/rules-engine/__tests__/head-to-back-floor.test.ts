import { describe, it, expect } from "vitest";
import { normalizeMeasurementDraft } from "@/lib/configurator/measurement-draft";
import { evaluateOrThrow } from "../evaluate";
import { DEFAULT_TEMPLATE_IDS, premiumSampleInputs } from "../fixtures";
import {
  incompleteEngineInputs,
  wizardToEngineInputs,
  type WizardMeasurementData,
} from "../legacy-inputs";
import { premiumSeedGraph } from "../seeds";
import { HEAD_TO_BACK_MIN_CM, inchesToCm, roundCm } from "../units";

// A head resting on the wall line measures 0, which the configurator refused
// as "Enter a valid measurement". Head-to-back now accepts 0 and down to −3 in.
describe("head-to-back floor", () => {
  it("is −3 in", () => {
    expect(HEAD_TO_BACK_MIN_CM).toBe(roundCm(inchesToCm(-3)));
  });

  it("accepts 0 and anything down to the floor, in either unit", () => {
    expect(normalizeMeasurementDraft("in", "0", HEAD_TO_BACK_MIN_CM)).toBe("0");
    expect(normalizeMeasurementDraft("cm", "0", HEAD_TO_BACK_MIN_CM)).toBe("0");
    expect(normalizeMeasurementDraft("in", "-1.5", HEAD_TO_BACK_MIN_CM)).toBe("-3.81");
    expect(normalizeMeasurementDraft("in", "-3", HEAD_TO_BACK_MIN_CM)).toBe("-7.62");
    expect(normalizeMeasurementDraft("cm", "-7.62", HEAD_TO_BACK_MIN_CM)).toBe("-7.62");
  });

  it("refuses below the floor and half-typed negatives", () => {
    expect(normalizeMeasurementDraft("in", "-3.01", HEAD_TO_BACK_MIN_CM)).toBeNull();
    expect(normalizeMeasurementDraft("cm", "-7.63", HEAD_TO_BACK_MIN_CM)).toBeNull();
    expect(normalizeMeasurementDraft("in", "-", HEAD_TO_BACK_MIN_CM)).toBeNull();
    expect(normalizeMeasurementDraft("in", "-1.", HEAD_TO_BACK_MIN_CM)).toBeNull();
    expect(normalizeMeasurementDraft("in", "", HEAD_TO_BACK_MIN_CM)).toBeNull();
  });

  it("leaves the other measurements positive-only", () => {
    expect(normalizeMeasurementDraft("in", "0")).toBeNull();
    expect(normalizeMeasurementDraft("in", "-1")).toBeNull();
    expect(normalizeMeasurementDraft("in", "16.5")).toBe("41.91");
  });

  const wizard = (headToBack: string, shoulderLength = "42"): WizardMeasurementData => ({
    shoulderLength,
    neckToBack: "10",
    headToBack,
    neckLength: "10",
    gender: "female",
    ageGroup: "35-44",
    bloodPressureLevel: "normal",
    earDiscomfortSideSleep: "no",
    bedFirmness: "firm",
    acidReflux: "no",
    sleepPainAreas: ["none"],
    sleepPositionType: ["side"],
    usesBolster: "no",
  });

  it("counts 0 as answered when the wizard hands off to the engine", () => {
    const inputs = wizardToEngineInputs(wizard("0"));
    expect(inputs.head_to_back_cm).toBe(0);
    expect(incompleteEngineInputs("premium-mpillow", inputs)).toEqual([]);
    expect(wizardToEngineInputs(wizard("-7.62")).head_to_back_cm).toBe(-7.62);
  });

  it("still treats blank or below-floor head-to-back, and a 0 shoulder, as missing", () => {
    expect(wizardToEngineInputs(wizard("")).head_to_back_cm).toBeUndefined();
    expect(wizardToEngineInputs(wizard("  ")).head_to_back_cm).toBeUndefined();
    expect(wizardToEngineInputs(wizard("-8")).head_to_back_cm).toBeUndefined();
    expect(wizardToEngineInputs(wizard("0", "0")).shoulder_length_cm).toBeUndefined();
  });

  it("evaluates the Premium seed at 0 and at the floor", () => {
    const graph = premiumSeedGraph(DEFAULT_TEMPLATE_IDS);
    for (const head_to_back_cm of [0, HEAD_TO_BACK_MIN_CM]) {
      const result = evaluateOrThrow(
        "premium-mpillow",
        graph,
        premiumSampleInputs({ head_to_back_cm }),
      );
      expect(result.size).toBe("M");
    }
  });
});
