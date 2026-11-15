import { describe, expect, it } from "vitest";
import { draftProgress, isOnlineDraft, resultSourceKey } from "@/lib/results/draft-progress";

const health = {
  bloodPressureLevel: "normal",
  earDiscomfortSideSleep: "no",
  bedFirmness: "medium",
  acidReflux: "no",
  sleepPainAreas: ["neck"],
  sleepPositionType: ["side"],
  usesBolster: "no",
};

describe("draftProgress", () => {
  it("names the first question left, as the continue link reopens on it", () => {
    expect(draftProgress({ name: "Ada" })).toEqual({ step: "age", label: "Stopped at Age and gender", answered: 1, of: 7 });
    expect(draftProgress({ name: "Ada", gender: "female", ageGroup: "25-34", ...health })).toMatchObject({
      step: "shoulder-length",
      label: "Stopped at Shoulder",
      answered: 3,
    });
  });

  it("every question answered: they saw their recommendation", () => {
    const all = { name: "Ada", gender: "f", ageGroup: "25-34", ...health, shoulderLength: "40", neckToBack: "5", headToBack: "-1", neckLength: "8" };
    expect(draftProgress(all)).toEqual({ step: "preview", label: "Saw their recommendation", answered: 7, of: 7 });
  });

  it("counts the Basic configurator's own questions", () => {
    expect(draftProgress({ configurator: "basic", name: "Ada" })).toMatchObject({ answered: 1, of: 4 });
  });

  it("reads a missing or stray data as nothing answered", () => {
    expect(draftProgress(null)).toMatchObject({ step: "name", label: "Stopped at Name", answered: 0 });
    expect(draftProgress([1, 2])).toMatchObject({ step: "name" });
  });
});

describe("isOnlineDraft and resultSourceKey", () => {
  it("a guest's Draft, with the configurator its first question recorded, is Online", () => {
    const row = { status: null, source: "manual", data: { configurator: "full" } };
    expect(isOnlineDraft(row)).toBe(true);
    expect(resultSourceKey(row)).toBe("online_customization");
  });

  it("a Staff device's Draft stays In-store", () => {
    const row = { status: null, source: "manual", data: { name: "Anna" } };
    expect(isOnlineDraft(row)).toBe(false);
    expect(resultSourceKey(row)).toBe("manual");
  });

  it("once held, the stored source speaks for itself", () => {
    expect(resultSourceKey({ status: "held", source: "online_purchase", data: { configurator: "full" } })).toBe("online_purchase");
    expect(isOnlineDraft({ status: "held", source: "manual", data: { configurator: "full" } })).toBe(false);
  });

  it("an Assisted customisation stays Assisted", () => {
    expect(resultSourceKey({ status: null, source: "staff_assisted", data: { configurator: "full" } })).toBe("staff_assisted");
  });

  it("no source at all is In-store, as before", () => {
    expect(resultSourceKey({ status: null, source: null, data: {} })).toBe("manual");
  });
});
