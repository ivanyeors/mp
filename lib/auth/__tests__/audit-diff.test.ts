import { describe, expect, it } from "vitest";
import { entityTypesFor, permissionDiff } from "@/lib/auth/audit-diff";

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

describe("entityTypesFor", () => {
  it("covers the pre-ADR-0023 names, so a chip shows the whole history", () => {
    expect(entityTypesFor("member")).toEqual(["member", "admin_user"]);
    expect(entityTypesFor("telegram_link")).toEqual(["telegram_link", "telegram_operator"]);
    expect(entityTypesFor("role")).toEqual(["role"]);
  });

  it("ignores an unknown chip", () => {
    expect(entityTypesFor("orders")).toBeNull();
    expect(entityTypesFor(undefined)).toBeNull();
  });
});
