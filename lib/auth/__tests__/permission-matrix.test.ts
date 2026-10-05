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

  it("samePermissions ignores order", () => {
    expect(samePermissions(["a", "b"], ["b", "a"])).toBe(true);
    expect(samePermissions(["a"], ["a", "b"])).toBe(false);
  });
});
