import { describe, it, expect } from "vitest";
import { simulationInputs } from "../catalog";
import { evaluateOrThrow } from "../evaluate";
import { DEFAULT_TEMPLATE_IDS, premiumHandGraph, premiumSampleInputs } from "../fixtures";

const graph = premiumHandGraph(DEFAULT_TEMPLATE_IDS);

// Regression: Simulate fed inch values to the engine as cm, so every realistic
// shoulder (12–22 in) fell under the XS band's 36 cm ceiling and always read XS.
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
    expect(run("13")).toBe("XS"); // 33.02 cm
    expect(run("15")).toBe("S"); // 38.1 cm
    expect(run("16.5")).toBe("M"); // 41.91 cm
    expect(run("22")).toBe("XL"); // 55.88 cm
  });

  it("leaves blanks blank so missing inputs are still refused", () => {
    const inputs = simulationInputs("premium-mpillow", { shoulder_length_cm: "", sleep_position: "side" });
    expect(inputs.shoulder_length_cm).toBe("");
    expect(inputs.sleep_position).toBe("side");
  });
});
