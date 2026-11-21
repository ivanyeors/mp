import { describe, it, expect } from "vitest";
import { simulationInputs } from "../catalog";
import { evaluateOrThrow } from "../evaluate";
import { DEFAULT_TEMPLATE_IDS, premiumHandGraph, premiumSampleInputs } from "../fixtures";

const graph = premiumHandGraph(DEFAULT_TEMPLATE_IDS);

describe("simulationInputs", () => {
  const run = (shoulderIn: string) =>
    evaluateOrThrow(
      "premium-mpillow",
      graph,
      simulationInputs("premium-mpillow", {
        ...premiumSampleInputs(),
        shoulder_length_cm: shoulderIn,
        neck_to_back_cm: "4",
        head_to_back_cm: "3",
        neck_length_cm: "4",
      }),
    ).size;

  it("reads measurements as inches, so different shoulders give different sizes", () => {
    expect(run("13")).toBe("XS");
    expect(run("15")).toBe("S");
    expect(run("16.5")).toBe("M");
    expect(run("22")).toBe("XL");
  });

  it("leaves blanks blank so missing inputs are still refused", () => {
    const inputs = simulationInputs("premium-mpillow", { shoulder_length_cm: "", sleep_position: "side" });
    expect(inputs.shoulder_length_cm).toBe("");
    expect(inputs.sleep_position).toBe("side");
  });
});
