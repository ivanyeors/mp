import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { roleHasPermission } from "@/lib/auth/permissions";

/**
 * The completion dialog ("Save without purchasing" → Measurement complete)
 * offers a jump into /settings/results, which `requireAdminPage("results")`
 * bounces for anyone who is not invited staff. The button must be gated on the
 * same permission so non-staff never see a link that only redirects them.
 */
const DIR = join(process.cwd(), "app", "[lang]", "mp-config");

describe("mp-config completion dialog results link", () => {
  it("renders the /settings/results push only under canViewResults", () => {
    const src = readFileSync(join(DIR, "mp-config-client.tsx"), "utf8");
    const gate = src.indexOf("canViewResults ?");
    const link = src.indexOf("/settings/results/");
    expect(gate).toBeGreaterThan(-1);
    expect(link).toBeGreaterThan(gate);
  });

  it("derives canViewResults from the results permission server-side", () => {
    const src = readFileSync(join(DIR, "page.tsx"), "utf8");
    expect(src).toMatch(
      /canViewResults=\{Boolean\(staffCtx && roleHasPermission\(staffCtx\.role, "results"\)\)\}/,
    );
  });

  it("excludes roles without the results permission", () => {
    expect(roleHasPermission("viewer", "results")).toBe(false);
    expect(roleHasPermission("staff", "results")).toBe(true);
  });
});
