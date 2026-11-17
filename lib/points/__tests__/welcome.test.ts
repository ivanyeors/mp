import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  grantWelcomeBonus,
  readWelcomeSteps,
  stepEndLabel,
  stepStartLabel,
  welcomeLeftShare,
  welcomeOffer,
  type WelcomeStep,
} from "@/lib/points/welcome";

const step = (n: number, o: Partial<WelcomeStep> = {}): WelcomeStep => ({
  step: n,
  until: `2026-12-${String(n).padStart(2, "0")}T00:00:00.000Z`,
  points: 1100 - n * 100,
  allocation: 500,
  claimed: 0,
  open: false,
  ...o,
});

const fake = (answer: { data?: unknown; error?: { message: string } | null }) =>
  ({ rpc: async () => ({ data: answer.data ?? null, error: answer.error ?? null }) }) as unknown as SupabaseClient;

describe("welcomeOffer", () => {
  it("names the open step, what is left at it, and the step after", () => {
    const offer = welcomeOffer([step(2), step(1, { open: true, claimed: 88 }), step(3)]);
    expect(offer.current?.step).toBe(1);
    expect(offer.left).toBe(412);
    expect(offer.next?.step).toBe(2);
    expect(offer.steps.map((s) => s.step)).toEqual([1, 2, 3]);
  });

  it("skips a later step that is already used up when naming what comes next", () => {
    const offer = welcomeOffer([step(1, { open: true }), step(2, { claimed: 500 }), step(3)]);
    expect(offer.next?.step).toBe(3);
  });

  it("has no next step on the last one", () => {
    expect(welcomeOffer([step(1, { claimed: 500 }), step(2, { open: true, claimed: 499 })]).next).toBeNull();
  });

  it("has nothing to offer when no step is open", () => {
    const offer = welcomeOffer([step(1, { claimed: 500 }), step(2, { claimed: 500 })]);
    expect(offer.current).toBeNull();
    expect(offer.left).toBe(0);
    expect(offer.next).toBeNull();
    expect(welcomeLeftShare(offer)).toBe(0);
  });

  it("never shows more left than a step holds, or less than none", () => {
    expect(welcomeOffer([step(1, { open: true, claimed: 700 })]).left).toBe(0);
    expect(welcomeLeftShare(welcomeOffer([step(1, { open: true, claimed: -5 })]))).toBe(1);
  });
});

describe("welcomeLeftShare", () => {
  it("is the share of the open step still unclaimed", () => {
    expect(welcomeLeftShare(welcomeOffer([step(1, { open: true, claimed: 125 })]))).toBe(0.75);
  });
});

describe("step labels, in Singapore time", () => {
  it("a step that ends at midnight ends with the day before", () => {
    expect(stepEndLabel("2026-12-01T00:00:00+08:00")).toBe("the end of 30 November");
    expect(stepEndLabel("2027-02-01T00:00:00+08:00")).toBe("the end of 31 January");
  });

  it("any other end is said to the minute", () => {
    expect(stepEndLabel("2026-12-31T23:59:00+08:00")).toBe("23:59 on 31 December");
  });

  it("the next step starts on that day, or at that minute", () => {
    expect(stepStartLabel("2026-12-15T00:00:00+08:00")).toBe("15 December");
    expect(stepStartLabel("2026-12-31T23:59:00+08:00")).toBe("23:59 on 31 December");
  });
});

describe("readWelcomeSteps", () => {
  it("reads the steps as SQL reports them", async () => {
    const steps = await readWelcomeSteps(
      fake({ data: [{ step: 1, until: "2026-12-01T00:00:00+08:00", points: 1000, allocation: 500, claimed: 88, is_open: true }] }),
    );
    expect(steps).toEqual([{ step: 1, until: "2026-11-30T16:00:00.000Z", points: 1000, allocation: 500, claimed: 88, open: true }]);
  });

  it("is no steps for an empty ladder, and throws on a failed read", async () => {
    expect(await readWelcomeSteps(fake({ data: [] }))).toEqual([]);
    await expect(readWelcomeSteps(fake({ error: { message: "down" } }))).rejects.toThrow(/welcome bonus steps/);
  });
});

describe("grantWelcomeBonus", () => {
  it("passes on a grant", async () => {
    expect(await grantWelcomeBonus(fake({ data: [{ granted: true, points: 800, step: 2, reason: "granted" }] }), "c1")).toEqual({
      granted: true,
      points: 800,
      reason: "granted",
    });
  });

  it("passes on why not", async () => {
    for (const reason of ["off", "partner", "migrated", "already", "ended"] as const) {
      expect(await grantWelcomeBonus(fake({ data: [{ granted: false, points: 0, step: null, reason }] }), "c1")).toEqual({
        granted: false,
        points: 0,
        reason,
      });
    }
  });

  it("reads an answer it does not know as nothing granted", async () => {
    expect((await grantWelcomeBonus(fake({ data: null }), "c1")).granted).toBe(false);
  });
});
