import { describe, expect, it } from "vitest";
import { permissionDiff } from "@/lib/auth/audit-diff";

describe("permissionDiff", () => {
  it("names added and removed pages by label", () => {
    expect(permissionDiff({ permissions: ["orders", "faq"] }, { permissions: ["faq", "media", "page-builder"] })).toEqual([
      { field: "permissions", added: ["Media", "Page Builder"], removed: ["Orders"] },
    ]);
  });

  it("treats a missing side as empty (create / delete)", () => {
    expect(permissionDiff(null, { permissions: ["orders"] })).toEqual([
      { field: "permissions", added: ["Orders"], removed: [] },
    ]);
    expect(permissionDiff({ actions: ["telegram.shop-review-moderate"] }, null)).toEqual([
      { field: "actions", added: [], removed: ["Moderate shop reviews"] },
    ]);
  });

  it("keeps an unknown key readable as itself, and returns null without arrays", () => {
    expect(permissionDiff({ permissions: ["retired"] }, { permissions: [] })?.[0].removed).toEqual(["retired"]);
    expect(permissionDiff({ status: "active" }, { status: "deactivated" })).toBeNull();
  });
});
