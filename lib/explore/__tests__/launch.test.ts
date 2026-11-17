import { describe, expect, it } from "vitest";
import { countdownParts, EXPLORE_LAUNCH_AT } from "@/lib/explore/launch";

const LAUNCH = Date.parse(EXPLORE_LAUNCH_AT);

describe("the launch", () => {
  it("is 23:59 on 31 December 2026 in Singapore", () => {
    expect(LAUNCH).toBe(Date.UTC(2026, 11, 31, 15, 59, 0));
  });
});

describe("countdownParts", () => {
  it("splits what is left into days, hours, minutes and seconds", () => {
    const left = (((3 * 24 + 4) * 60 + 5) * 60 + 6) * 1000;
    expect(countdownParts(LAUNCH - left, LAUNCH)).toEqual({ days: 3, hours: 4, minutes: 5, seconds: 6, done: false });
  });

  it("shows a started second as the second before it", () => {
    expect(countdownParts(LAUNCH - 1500, LAUNCH)).toMatchObject({ seconds: 1, done: false });
    expect(countdownParts(LAUNCH - 400, LAUNCH)).toMatchObject({ seconds: 0, done: false });
  });

  it("is done at the launch and stays done", () => {
    expect(countdownParts(LAUNCH, LAUNCH)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0, done: true });
    expect(countdownParts(LAUNCH + 86_400_000, LAUNCH)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0, done: true });
  });
});
