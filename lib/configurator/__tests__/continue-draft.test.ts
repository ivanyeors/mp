import { describe, expect, it } from "vitest";
import {
  continueDraftUrl,
  draftAnswersFrom,
  draftConfiguratorOf,
  resumeStepFor,
  stripContinueDraftQuery,
  type DraftAnswers,
} from "@/lib/configurator/continue-draft";

const ALL: DraftAnswers = {
  name: "Wei Ling",
  gender: "female",
  ageGroup: "35-44",
  bloodPressureLevel: "normal",
  earDiscomfortSideSleep: "no",
  bedFirmness: "medium-soft",
  acidReflux: "no",
  shoulderLength: "43.18",
  neckToBack: "10.16",
  headToBack: "-2.5",
  neckLength: "8.89",
  sleepPainAreas: ["neck"],
  sleepPositionType: ["side-and-back"],
  usesBolster: "no",
};

function without(...keys: Array<keyof DraftAnswers>): Partial<DraftAnswers> {
  const out: Partial<DraftAnswers> = { ...ALL };
  for (const k of keys) delete out[k];
  return out;
}

describe("draftAnswersFrom", () => {
  it("keeps the answers shaped as the form holds them", () => {
    expect(draftAnswersFrom({ ...ALL, notes: "x", configurator: "basic" })).toEqual(ALL);
  });

  it("leaves out a null, a stray type and an unknown yes/no, so form defaults stand", () => {
    expect(
      draftAnswersFrom({
        name: null,
        gender: 3,
        acidReflux: "maybe",
        usesBolster: "",
        sleepPainAreas: null,
        sleepPositionType: ["back", 2],
      }),
    ).toEqual({ usesBolster: "" });
  });

  it("reads nothing from a missing or non-object data", () => {
    expect(draftAnswersFrom(null)).toEqual({});
    expect(draftAnswersFrom(["name"])).toEqual({});
  });
});

describe("draftConfiguratorOf", () => {
  it("is basic only when recorded so", () => {
    expect(draftConfiguratorOf({ configurator: "basic" })).toBe("basic");
    expect(draftConfiguratorOf({ configurator: "full" })).toBe("full");
    expect(draftConfiguratorOf({})).toBe("full");
    expect(draftConfiguratorOf(null)).toBe("full");
  });
});

describe("resumeStepFor", () => {
  it("opens on the first question when there is no name", () => {
    expect(resumeStepFor("full", {})).toBe("name");
  });

  it("walks the configurator's own order to the first unanswered question", () => {
    expect(resumeStepFor("full", { name: "Wei Ling" })).toBe("age");
    expect(resumeStepFor("full", { name: "Wei Ling", gender: "female", ageGroup: "35-44" })).toBe("health");
    const health = without("shoulderLength", "neckToBack", "headToBack", "neckLength");
    expect(resumeStepFor("full", health)).toBe("shoulder-length");
    expect(resumeStepFor("full", { ...health, shoulderLength: "43.18" })).toBe("neck-to-back");
  });

  it("asks the health question again until every answer in it is there", () => {
    expect(resumeStepFor("full", { ...ALL, sleepPainAreas: [] })).toBe("health");
    expect(resumeStepFor("full", { ...ALL, usesBolster: "" })).toBe("health");
  });

  it("opens Basic on the preview after the shoulder, which is all it measures", () => {
    const basic = without("neckToBack", "headToBack", "neckLength");
    expect(resumeStepFor("basic", basic)).toBe("preview");
    expect(resumeStepFor("full", basic)).toBe("neck-to-back");
  });

  it("counts a head-to-back below zero, and refuses one that is not a number", () => {
    expect(resumeStepFor("full", ALL)).toBe("preview");
    expect(resumeStepFor("full", { ...ALL, headToBack: "abc" })).toBe("head-to-back");
  });

  it("never stops on the optional photos", () => {
    expect(resumeStepFor("full", ALL)).toBe("preview");
  });
});

describe("continueDraftUrl", () => {
  it("opens the configurator the Draft was started in, in English by default", () => {
    expect(
      continueDraftUrl({ origin: "https://custom.mpillow.com/", id: "d-1", token: "t 1", variant: "full" }),
    ).toBe("https://custom.mpillow.com/en-US/mp-config?draft=d-1&token=t+1");
    expect(
      continueDraftUrl({ origin: "https://custom.mpillow.com", id: "d-1", token: "t", variant: "basic", locale: "zh-CN" }),
    ).toBe("https://custom.mpillow.com/zh-CN/mp-basic?draft=d-1&token=t");
  });
});

describe("stripContinueDraftQuery", () => {
  it("drops the link's id and token and keeps the rest", () => {
    expect(stripContinueDraftQuery("?draft=d&token=t")).toBe("");
    expect(stripContinueDraftQuery("?draft=d&utm_source=email&token=t")).toBe("?utm_source=email");
  });
});
