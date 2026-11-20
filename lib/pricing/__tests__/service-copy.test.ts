import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  copyMoney,
  interpolateServiceCopy,
  interpolateServiceCopyDeep,
  serviceCopyValues,
} from "@/lib/pricing/service-copy";

const values = serviceCopyValues(
  {
    measurement_premium: { msrp: 55, costPrice: null, currency: "SGD" },
    measurement_basic: { msrp: 30, costPrice: null, currency: "SGD" },
    readjustment: { msrp: 35.5, costPrice: null, currency: "SGD" },
  },
  { freeVisits: 1, freeWindowDays: 90 },
);

describe("service copy (ADR 0024)", () => {
  it("prints whole dollars without cents and keeps cents otherwise", () => {
    expect(copyMoney(30)).toBe("$30");
    expect(copyMoney(35.5)).toBe("$35.50");
  });

  it("fills every placeholder from the live fees", () => {
    expect(
      interpolateServiceCopy(
        "Free within {freeWindowDays} days, then {readjustmentFee}. Measuring: {measurementPremium} / {measurementBasic}.",
        values,
      ),
    ).toBe("Free within 90 days, then $35.50. Measuring: $55 / $30.");
  });

  it("walks a messages tree, leaving non-strings alone", () => {
    expect(
      interpolateServiceCopyDeep(
        { notes: ["{readjustmentFee} per visit"], strip: [{ label: "{freeWindowDays}-day readjustment" }], n: 3 },
        values,
      ),
    ).toEqual({ notes: ["$35.50 per visit"], strip: [{ label: "90-day readjustment" }], n: 3 });
  });
});

describe("no hard-coded service fees in policy copy", () => {
  const files = [
    "lib/i18n/messages/en-US.ts",
    "lib/i18n/messages/zh-CN.ts",
    "components/marketing/returns-warranty-page.tsx",
  ];
  it.each(files)("%s quotes no fee or window literally", (file) => {
    const src = readFileSync(join(process.cwd(), file), "utf8");
    const lines = src
      .split("\n")
      .filter((l) => /re-?adjust|measurement|复调|测量|adjustment/i.test(l))
      .filter((l) => /\$(30|50)\b|\b60[- ]?(days?|天)/.test(l));
    expect(lines).toEqual([]);
  });
});
