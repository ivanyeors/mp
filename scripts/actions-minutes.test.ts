import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAUSE_AT,
  minutesUsed,
  pauseAt,
  run,
  // @ts-expect-error -- plain .mjs script, no type declarations
} from "./actions-minutes.mjs";

const report = (usageItems: unknown[]) => ({ usageItems });
const linux = (quantity: number) => ({
  product: "actions",
  sku: "actions_linux",
  unitType: "minutes",
  quantity,
  grossAmount: quantity * 0.006,
});

const answer = (status: number, body: unknown) => async () =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

const base = { token: "t", owner: "ivanyeors", pauseAtValue: "", now: new Date("2026-11-22T12:00:00Z") };

describe("minutesUsed", () => {
  it("adds Actions minutes across days and repositories", () => {
    expect(minutesUsed(report([linux(1200), linux(400)]))).toBeCloseTo(1600);
  });

  it("counts a one-CPU ubuntu-slim minute as the third of a standard minute it costs", () => {
    const slim = { product: "actions", sku: "actions_linux_slim", unitType: "minutes", quantity: 300, grossAmount: 0.6 };
    expect(minutesUsed(report([linux(100), slim]))).toBeCloseTo(200);
  });

  it("leaves out storage and other products", () => {
    const items = [
      linux(100),
      { product: "actions", sku: "actions_storage", unitType: "GigabyteHours", quantity: 9000, grossAmount: 2 },
      { product: "packages", sku: "packages_storage", unitType: "GigabyteHours", quantity: 500, grossAmount: 1 },
      { product: "copilot", sku: "copilot_premium_request", unitType: "requests", quantity: 70, grossAmount: 2.8 },
    ];
    expect(minutesUsed(report(items))).toBeCloseTo(100);
  });

  it("reads both spellings of the product and unit", () => {
    const items = [
      { product: "Actions", sku: "Actions Linux", unitType: "Minutes", grossAmount: 0.06 },
      { product: "actions", sku: "actions_linux", unitType: "minutes", grossAmount: 0.12 },
    ];
    expect(minutesUsed(report(items))).toBeCloseTo(30);
  });

  it("counts gross use, not only what was billed past the allowance", () => {
    const item = { product: "actions", unitType: "minutes", grossAmount: 11.4, discountAmount: 11.4, netAmount: 0 };
    expect(minutesUsed(report([item]))).toBeCloseTo(1900);
  });

  it("refuses an answer it does not recognise rather than reading it as none used", () => {
    expect(() => minutesUsed({})).toThrow(/usageItems/);
    expect(() => minutesUsed(report([{ product: "actions", unitType: "minutes", quantity: 5 }]))).toThrow(/no grossAmount/);
    expect(() => minutesUsed(report([{ product: "actions", unitType: "minutes", grossAmount: null }]))).toThrow(/no grossAmount/);
  });
});

describe("pauseAt", () => {
  it("defaults when the variable is unset", () => {
    expect(pauseAt(undefined)).toEqual({ at: DEFAULT_PAUSE_AT });
    expect(pauseAt("")).toEqual({ at: DEFAULT_PAUSE_AT });
  });

  it("takes a whole number and refuses anything else", () => {
    expect(pauseAt("2700")).toEqual({ at: 2700 });
    expect(pauseAt("2,700").at).toBe(DEFAULT_PAUSE_AT);
    expect(pauseAt("2,700").problem).toMatch(/not a whole number/);
    expect(pauseAt("0").at).toBe(DEFAULT_PAUSE_AT);
  });
});

describe("run", () => {
  it("runs CI in full without a token, and asks GitHub nothing", async () => {
    let asked = false;
    const result = await run({ ...base, token: "", fetchImpl: async () => ((asked = true), new Response("{}")) });
    expect(result.pause).toBe(false);
    expect(asked).toBe(false);
  });

  it("asks for this month's usage of the owner's account", async () => {
    let url = "";
    let auth = "";
    await run({
      ...base,
      fetchImpl: async (u: string, init: { headers: Record<string, string> }) => {
        url = u;
        auth = init.headers.Authorization;
        return new Response(JSON.stringify(report([])));
      },
    });
    expect(url).toBe("https://api.github.com/users/ivanyeors/settings/billing/usage?year=2026&month=11");
    expect(auth).toBe("Bearer t");
  });

  it("pauses at the pause point, not one minute after it", async () => {
    const at = await run({ ...base, pauseAtValue: "1800", fetchImpl: answer(200, report([linux(1800)])) });
    const under = await run({ ...base, pauseAtValue: "1800", fetchImpl: answer(200, report([linux(1799)])) });
    expect(at.pause).toBe(true);
    expect(under.pause).toBe(false);
  });

  it("puts a warning on a paused run that says what did not run and how to merge", async () => {
    const result = await run({ ...base, fetchImpl: answer(200, report([linux(2800)])) });
    const warning = result.lines.find((l: string) => l.startsWith("::warning title=CI paused"));
    expect(warning).toMatch(/2800 of this month's Actions minutes are used \(CI pauses at 2700\)/);
    expect(warning).toMatch(/did not run/);
    expect(warning).toMatch(/auto-merge will not merge/);
  });

  it("runs CI in full, with a warning, when GitHub refuses or answers nonsense", async () => {
    for (const fetchImpl of [
      answer(403, "Resource not accessible by personal access token"),
      answer(200, "not json"),
      answer(200, { message: "moved" }),
      async () => {
        throw new Error("network down");
      },
    ]) {
      const result = await run({ ...base, fetchImpl });
      expect(result.pause).toBe(false);
      expect(result.lines.some((l: string) => l.startsWith("::warning title=Could not read Actions minutes"))).toBe(true);
    }
  });
});
