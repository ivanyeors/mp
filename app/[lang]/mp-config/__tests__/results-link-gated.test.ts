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
  /**
   * Pinned by shape rather than by "the file's first mention", because the file
   * also links the Result from Staff re-configuration — a surface the server
   * already gates on `results` before it renders at all
   * (`loadStaffEditResult`), so it carries no client-side `canViewResults`.
   */
  it("renders the /settings/results push only under canViewResults", () => {
    const src = readFileSync(join(DIR, "mp-config-client.tsx"), "utf8");
    // The completion dialog's "Results page" button.
    expect(src).toMatch(/canViewResults \? \([\s\S]{0,400}\/settings\/results\/\$\{id\}/);
    // The Assisted submit's hand-off into the assignment card.
    expect(src).toMatch(
      /canViewResults \? to\(`\/settings\/results\/\$\{data\.resultId\}#assignment`\)/,
    );
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
