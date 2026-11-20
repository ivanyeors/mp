import { describe, expect, it } from "vitest";
import { samePermissions, togglePermission } from "@/lib/auth/permission-matrix";
import type { Permission } from "@/lib/auth/permissions";

const set = (...k: Permission[]) => new Set<Permission>(k);

describe("togglePermission", () => {
  it("ticking a page ticks what it requires and says why", () => {
    const r = togglePermission(set("orders"), "page-builder", true);
    expect(r).toEqual({
      ok: true,
      next: set("orders", "page-builder", "media"),
      note: "Also turned on Media — Page Builder uses it.",
    });
  });

  it("ticking a page whose requirement is already held adds no note", () => {
    expect(togglePermission(set("media"), "blogs", true)).toMatchObject({ ok: true, note: null });
  });

  it("follows requires chains", () => {
    const r = togglePermission(set(), "categories", true);
    expect(r.ok && [...r.next].sort()).toEqual(["categories", "media", "products"]);
  });

  it("blocks unticking a page another ticked page uses", () => {
    expect(togglePermission(set("media", "page-builder", "blogs"), "media", false)).toEqual({
      ok: false,
      reason: "Page Builder, Blogs use Media. Untick them first.",
    });
  });

  it("unticks a page nothing else needs", () => {
    const r = togglePermission(set("media", "page-builder"), "page-builder", false);
    expect(r).toEqual({ ok: true, next: set("media"), note: null });
  });

  it("unticking Customers also unticks Customers: make changes, and says why", () => {
    const r = togglePermission(set("orders", "customers", "customers-edit"), "customers", false);
    expect(r).toEqual({
      ok: true,
      next: set("orders"),
      note: "Also turned off Customers: make changes (Customers page) — it needs Customers.",
    });
  });

  it("unticking Customers: make changes leaves the role view-only", () => {
    const r = togglePermission(set("customers", "customers-edit"), "customers-edit", false);
    expect(r).toEqual({ ok: true, next: set("customers"), note: null });
  });

  it("ticking Customers: make changes ticks Customers", () => {
    const r = togglePermission(set(), "customers-edit", true);
    expect(r.ok && [...r.next].sort()).toEqual(["customers", "customers-edit"]);
  });

  it("a page's tabs go with it; a page that uses it still blocks", () => {
    const r = togglePermission(set("media", "products", "categories"), "products", false);
    expect(r).toMatchObject({ ok: true, next: set("media") });
    expect(togglePermission(set("media", "products", "categories"), "media", false)).toEqual({
      ok: false,
      reason: "Products, Categories (Products tab) use Media. Untick them first.",
    });
  });

  it("samePermissions ignores order", () => {
    expect(samePermissions(["a", "b"], ["b", "a"])).toBe(true);
    expect(samePermissions(["a"], ["a", "b"])).toBe(false);
  });
});
