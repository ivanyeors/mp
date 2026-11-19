import { describe, expect, it } from "vitest";
import { bolsterPromises, pillowPromises, pointsPromise } from "../review-promises";

const terms = { readjustmentFee: 30, policy: { freeVisits: 1, freeWindowDays: 60 } };

describe("what the review promises", () => {
  it("Premium: the warranty and the free re-adjustment, from the live fee and window", () => {
    expect(pillowPromises("premium", { readjustmentFee: 35, policy: { freeVisits: 1, freeWindowDays: 45 } })).toEqual([
      "10-year warranty on the fillings",
      "1 free re-adjustment within 45 days of your purchase, then $35 per visit",
      "Filling changes at a re-adjustment are included (accessories excluded)",
    ]);
  });

  it("Premium with no free visit promises none", () => {
    const lines = pillowPromises("premium", { readjustmentFee: 30, policy: { freeVisits: 0, freeWindowDays: 60 } });
    expect(lines.join(" ")).not.toMatch(/free/);
    expect(lines).toContain("Re-adjustments at $30 per visit");
  });

  it("Basic never promises the warranty or a free visit", () => {
    const lines = pillowPromises("basic", terms).join(" ");
    expect(lines).not.toMatch(/warranty|free/);
    expect(lines).toMatch(/\$30 per visit/);
  });

  it("Mbolster carries the fillings warranty", () => {
    expect(bolsterPromises(terms)[0]).toBe("10-year warranty on the fillings");
  });

  it("points: on what is paid for products, in points and dollars", () => {
    expect(pointsPromise(480, 1)).toEqual({ points: "480 points", worth: "S$4.80" });
    expect(pointsPromise(479.99, 1.5)).toEqual({ points: "719 points", worth: "S$7.19" });
  });

  it("points: nothing promised when points are off, the rate is 0 or there is no price", () => {
    expect(pointsPromise(480, null)).toBeNull();
    expect(pointsPromise(480, 0)).toBeNull();
    expect(pointsPromise(null, 1)).toBeNull();
    expect(pointsPromise(0.5, 1)).toBeNull();
  });
});
