import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { LOFT_ALLOWANCE_SETTING_KEY, type DimensionOverridesPayload } from "../dimension-overrides";
import { loadDimensionOverrides } from "../dimension-overrides.server";
import { SOLVER_DEFAULTS } from "../soft-body";
import {
  sameSoftBodySettings,
  SOFT_BODY_DEFAULTS,
  SOFT_BODY_RANGES,
  SOFT_BODY_SETTING_KEY,
  softBodyFromPayload,
  softBodySettings,
  softBodySettingsToStored,
  solverOptionsFor,
  type SoftBodySettings,
} from "../soft-body-settings";

/**
 * Soft cut settings (ADR 0025): one JSON site setting, read the same way by
 * every surface that draws the cut. Whatever is stored, a host gets a whole,
 * in-range settings object — never a half-parsed one.
 */

const NUMBER_KEYS = Object.keys(SOFT_BODY_RANGES) as (keyof typeof SOFT_BODY_RANGES)[];

const tuned: SoftBodySettings = {
  enabled: false,
  rigidity: 72,
  neckFirmness: 60,
  volumePct: 110,
  emptyCasePct: 45,
  smoothing: 3,
  gap: 2.5,
  steps: 30,
  animate: false,
};

describe("softBodySettings", () => {
  it("is the defaults when nothing usable is stored", () => {
    for (const value of [undefined, null, "", "not json", "{", "42", "null", "true", '"text"', 7, false]) {
      expect(softBodySettings(value), String(value)).toEqual(SOFT_BODY_DEFAULTS);
    }
  });

  it("keeps the defaults themselves as they are", () => {
    expect(softBodySettings(SOFT_BODY_DEFAULTS)).toEqual(SOFT_BODY_DEFAULTS);
    expect(softBodySettings(JSON.stringify(SOFT_BODY_DEFAULTS))).toEqual(SOFT_BODY_DEFAULTS);
  });

  it("reads JSON text and objects alike, filling what is missing from the defaults", () => {
    expect(softBodySettings(JSON.stringify(tuned))).toEqual(tuned);
    expect(softBodySettings(tuned)).toEqual(tuned);
    expect(softBodySettings('{"rigidity": 80}')).toEqual({ ...SOFT_BODY_DEFAULTS, rigidity: 80 });
  });

  it.each(NUMBER_KEYS)("clamps %s to its range", (key) => {
    const { min, max } = SOFT_BODY_RANGES[key];
    expect(softBodySettings({ [key]: min - 1000 })[key]).toBe(min);
    expect(softBodySettings({ [key]: max + 1000 })[key]).toBe(max);
    expect(softBodySettings({ [key]: min })[key]).toBe(min);
    expect(softBodySettings({ [key]: max })[key]).toBe(max);
  });

  it.each(NUMBER_KEYS)("rounds %s to its step", (key) => {
    const { min, step } = SOFT_BODY_RANGES[key];
    const on = min + 2 * step;
    expect(softBodySettings({ [key]: on })[key]).toBe(on);
    expect(softBodySettings({ [key]: on + 0.4 * step })[key]).toBe(on);
    expect(softBodySettings({ [key]: on + 0.6 * step })[key]).toBe(on + step);
  });

  it("snaps a half step: the gap moves in 0.5s", () => {
    expect(softBodySettings({ gap: 3.3 }).gap).toBe(3.5);
    expect(softBodySettings({ gap: 3.2 }).gap).toBe(3);
  });

  it("reads a numeric string and drops anything else that is not a finite number", () => {
    expect(softBodySettings({ rigidity: "60" }).rigidity).toBe(60);
    for (const bad of ["soft", "", " ", null, true, NaN, Infinity, {}, [5]]) {
      expect(softBodySettings({ rigidity: bad }).rigidity, String(bad)).toBe(SOFT_BODY_DEFAULTS.rigidity);
    }
  });

  it("takes booleans only as booleans", () => {
    expect(softBodySettings({ enabled: false, animate: false })).toMatchObject({ enabled: false, animate: false });
    expect(softBodySettings({ enabled: true, animate: true })).toMatchObject({ enabled: true, animate: true });
    for (const bad of ["false", 0, 1, null, "no"]) {
      expect(softBodySettings({ enabled: bad, animate: bad })).toMatchObject({
        enabled: SOFT_BODY_DEFAULTS.enabled,
        animate: SOFT_BODY_DEFAULTS.animate,
      });
    }
  });

  it("ignores keys it does not know", () => {
    expect(softBodySettings({ ...tuned, wobble: 3 })).toEqual(tuned);
  });
});

describe("softBodySettingsToStored", () => {
  it("round-trips through softBodySettings", () => {
    for (const s of [SOFT_BODY_DEFAULTS, tuned]) {
      expect(softBodySettings(softBodySettingsToStored(s))).toEqual(s);
    }
  });

  it("stores every key, validated, and nothing else", () => {
    const stored = JSON.parse(softBodySettingsToStored({ rigidity: 140, gap: 2.2 }));
    expect(Object.keys(stored).sort()).toEqual(Object.keys(SOFT_BODY_DEFAULTS).sort());
    expect(stored).toEqual({ ...SOFT_BODY_DEFAULTS, rigidity: 100, gap: 2 });
  });
});

describe("sameSoftBodySettings", () => {
  it("compares every key", () => {
    expect(sameSoftBodySettings(SOFT_BODY_DEFAULTS, { ...SOFT_BODY_DEFAULTS })).toBe(true);
    for (const key of Object.keys(SOFT_BODY_DEFAULTS) as (keyof SoftBodySettings)[]) {
      expect(sameSoftBodySettings(SOFT_BODY_DEFAULTS, { ...SOFT_BODY_DEFAULTS, [key]: tuned[key] }), key).toBe(false);
    }
  });
});

describe("solverOptionsFor", () => {
  it.each([
    [0, 0.01, 0.08],
    [50, 0.04, 0.2],
    [100, 0.07, 0.32],
  ])("maps rigidity %i to shape memory %f and skin %f", (rigidity, shapeMemory, skin) => {
    const o = solverOptionsFor({ ...SOFT_BODY_DEFAULTS, rigidity });
    expect(o.shapeMemory).toBeCloseTo(shapeMemory, 10);
    expect(o.skin).toBeCloseTo(skin, 10);
  });

  it("is the solver's own defaults at the default rigidity", () => {
    const o = solverOptionsFor(SOFT_BODY_DEFAULTS);
    expect(o.shapeMemory).toBeCloseTo(SOLVER_DEFAULTS.shapeMemory, 10);
    expect(o.skin).toBeCloseTo(SOLVER_DEFAULTS.skin, 10);
  });

  it("hands the Neck support's firmness to the solver as a share, its default the solver's own", () => {
    expect(solverOptionsFor(tuned).rollFirmness).toBeCloseTo(0.6, 10);
    expect(solverOptionsFor(SOFT_BODY_DEFAULTS).rollFirmness).toBeCloseTo(SOLVER_DEFAULTS.rollFirmness, 10);
  });

  it("carries steps and the empty case height as they are", () => {
    const o = solverOptionsFor(tuned, 2);
    expect(o.steps).toBe(30);
    expect(o.slump).toBeCloseTo(0.45, 10);
  });

  it("scales lengths, speeds and gravity with the cut, not the rest", () => {
    const one = solverOptionsFor(tuned);
    expect(one).toMatchObject({
      gap: tuned.gap,
      margin: SOLVER_DEFAULTS.margin,
      billow: SOLVER_DEFAULTS.billow,
      maxStep: SOLVER_DEFAULTS.maxStep,
      gravity: SOLVER_DEFAULTS.gravity,
    });
    const half = solverOptionsFor(tuned, 0.5);
    for (const key of ["gap", "margin", "billow", "maxStep", "gravity"] as const) {
      expect(half[key], key).toBeCloseTo((one[key] as number) * 0.5, 10);
    }
    for (const key of ["steps", "slump", "shapeMemory", "skin"] as const) {
      expect(half[key], key).toBe(one[key]);
    }
  });
});

describe("softBodyFromPayload", () => {
  const payload = (softBody: string | null): DimensionOverridesPayload => ({
    pouches: [],
    neck: [],
    loftAllowance: null,
    softBody,
  });

  it("is the defaults before the payload loads or without a stored row", () => {
    expect(softBodyFromPayload(null)).toEqual(SOFT_BODY_DEFAULTS);
    expect(softBodyFromPayload(undefined)).toEqual(SOFT_BODY_DEFAULTS);
    expect(softBodyFromPayload(payload(null))).toEqual(SOFT_BODY_DEFAULTS);
  });

  it("reads the stored text", () => {
    expect(softBodyFromPayload(payload(softBodySettingsToStored(tuned)))).toEqual(tuned);
    expect(softBodyFromPayload(payload("garbage"))).toEqual(SOFT_BODY_DEFAULTS);
  });

  it("reads a payload that predates the setting as the defaults", () => {
    const old = { pouches: [], neck: [], loftAllowance: "10" } as unknown as DimensionOverridesPayload;
    expect(softBodyFromPayload(old)).toEqual(SOFT_BODY_DEFAULTS);
  });
});

describe("loadDimensionOverrides delivers the soft cut settings", () => {
  type Call = { table: string; column?: string; keys?: string[] };

  /** A client whose site_settings holds `settings`; records each query it is asked. */
  const fakeAdmin = (settings: { key: string; value: string }[], error: string | null = null) => {
    const calls: Call[] = [];
    const client = {
      from(table: string) {
        const call: Call = { table };
        calls.push(call);
        const q = {
          select: () => q,
          in(column: string, keys: string[]) {
            call.column = column;
            call.keys = keys;
            return q;
          },
          then(resolve: (v: unknown) => void) {
            const data = table === "site_settings" ? settings.filter((s) => !call.keys || call.keys.includes(s.key)) : [];
            resolve({ data, error: error && table === "site_settings" ? { message: error } : null });
          },
        };
        return q;
      },
    };
    return { admin: client as unknown as SupabaseClient, calls };
  };

  it("reads both settings in one site_settings query and ships each by its key", async () => {
    const stored = softBodySettingsToStored(tuned);
    const { admin, calls } = fakeAdmin([
      { key: "landing_hero", value: "{}" },
      { key: SOFT_BODY_SETTING_KEY, value: stored },
      { key: LOFT_ALLOWANCE_SETTING_KEY, value: "20" },
    ]);
    const payload = await loadDimensionOverrides(admin);
    expect(payload).toEqual({ pouches: [], neck: [], loftAllowance: "20", softBody: stored });
    expect(softBodyFromPayload(payload)).toEqual(tuned);
    const site = calls.filter((c) => c.table === "site_settings");
    expect(site).toHaveLength(1);
    expect(site[0].column).toBe("key");
    expect(site[0].keys?.slice().sort()).toEqual([LOFT_ALLOWANCE_SETTING_KEY, SOFT_BODY_SETTING_KEY].sort());
  });

  it("ships null for a setting with no row", async () => {
    const { admin } = fakeAdmin([{ key: LOFT_ALLOWANCE_SETTING_KEY, value: "15" }]);
    const payload = await loadDimensionOverrides(admin);
    expect(payload.loftAllowance).toBe("15");
    expect(payload.softBody).toBeNull();
    expect(softBodyFromPayload(payload)).toEqual(SOFT_BODY_DEFAULTS);
  });

  it("throws on a database error, like the callers' other reads", async () => {
    const { admin } = fakeAdmin([], "permission denied");
    await expect(loadDimensionOverrides(admin)).rejects.toThrow("permission denied");
  });
});
