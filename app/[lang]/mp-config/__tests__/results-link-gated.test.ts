import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { roleHasPermission } from "@/lib/auth/permissions";

const DIR = join(process.cwd(), "app", "[lang]", "mp-config");

describe("mp-config completion dialog results link", () => {
  it("renders the /settings/results push only under canViewResults", () => {
    const src = readFileSync(join(DIR, "mp-config-client.tsx"), "utf8");
    expect(src).toMatch(/canViewResults \? \([\s\S]{0,400}\/settings\/results\/\$\{id\}/);
    expect(src).toMatch(
      /canViewResults \? to\(`\/settings\/results\/\$\{data\.resultId\}#assignment`\)/,
    );
  });

  it("derives canViewResults from the results permission server-side", () => {
    const src = readFileSync(join(DIR, "page.tsx"), "utf8");
    expect(src).toMatch(
      /canViewResults=\{Boolean\(staffCtx && hasPermission\(staffCtx, "results"\)\)\}/,
    );
  });

  it("excludes roles without the results permission", () => {
    expect(roleHasPermission("viewer", "results")).toBe(false);
    expect(roleHasPermission("staff", "results")).toBe(true);
  });
});
