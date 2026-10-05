import { describe, expect, it } from "vitest";
import { ADMIN_PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import {
  canAssignRole,
  canCreateRole,
  canDeleteRole,
  canEditRole,
  canUpdateMember,
  normalizeRolePermissions,
  type PolicyActor,
  type PolicyRole,
} from "@/lib/auth/role-policy";

const role = (key: string, permissions: Permission[], system = false): PolicyRole => ({
  id: `r-${key}`,
  key,
  name: key[0].toUpperCase() + key.slice(1),
  is_system: system,
  grants_all: system,
  permissions,
});

const OWNER = role("owner", [], true);
const ADMIN = role("admin", [], true);
const USERS_MGR = role("people", ["users", "orders", "results"]);
const ORDERS = role("orders", ["orders"]);
const MEDIA = role("media", ["media", "page-builder"]);
const ROLES = new Map([OWNER, ADMIN, USERS_MGR, ORDERS, MEDIA].map((r) => [r.id, r]));

const actor = (r: PolicyRole, memberId = "me"): PolicyActor => ({
  memberId,
  isOwner: r.key === "owner",
  grantsAll: r.grants_all,
  permissions: new Set<Permission>(r.grants_all ? ADMIN_PERMISSIONS : (r.permissions as Permission[])),
});

const member = (id: string, r: PolicyRole, isActive = true) => ({ id, roleId: r.id, isActive });

describe("canAssignRole", () => {
  it("only an Owner grants Owner", () => {
    expect(canAssignRole(actor(OWNER), OWNER).ok).toBe(true);
    expect(canAssignRole(actor(ADMIN), OWNER)).toMatchObject({ ok: false, status: 403, error: "Only an Owner can grant Owner." });
  });

  it("Owner and Admin may assign any other role", () => {
    for (const a of [OWNER, ADMIN]) {
      for (const r of [ADMIN, USERS_MGR, ORDERS, MEDIA]) expect(canAssignRole(actor(a), r).ok).toBe(true);
    }
  });

  it("a narrower manager may assign only roles within their own pages", () => {
    const me = actor(USERS_MGR);
    expect(canAssignRole(me, ORDERS).ok).toBe(true);
    expect(canAssignRole(me, USERS_MGR).ok).toBe(true);
    expect(canAssignRole(me, MEDIA)).toMatchObject({ ok: false, status: 403 });
    expect((canAssignRole(me, MEDIA) as { error: string }).error).toContain("Media, Page Builder");
    expect(canAssignRole(me, ADMIN)).toMatchObject({ ok: false, error: "Only an Owner or Admin can assign a role with every page." });
  });
});

describe("canUpdateMember", () => {
  it("refuses changing yourself", () => {
    const r = canUpdateMember(actor(OWNER, "m1"), member("m1", OWNER), { isActive: false }, ROLES, 2);
    expect(r).toMatchObject({ ok: false, status: 400, error: "You can't change your own role or deactivate yourself." });
  });

  it("protects the last active Owner from demotion and deactivation", () => {
    const target = member("m2", OWNER);
    expect(canUpdateMember(actor(OWNER), target, { roleId: ADMIN.id }, ROLES, 1)).toMatchObject({
      ok: false,
      error: "There must be at least one active Owner.",
    });
    expect(canUpdateMember(actor(OWNER), target, { isActive: false }, ROLES, 1).ok).toBe(false);
    expect(canUpdateMember(actor(OWNER), target, { isActive: false }, ROLES, 2).ok).toBe(true);
  });

  it("reactivating or keeping an Owner is never blocked by the owner count", () => {
    expect(canUpdateMember(actor(OWNER), member("m2", OWNER, false), { isActive: true }, ROLES, 1).ok).toBe(true);
  });

  it("only an Owner changes or removes an Owner", () => {
    expect(canUpdateMember(actor(ADMIN), member("m2", OWNER), { isActive: false }, ROLES, 3)).toMatchObject({
      ok: false,
      status: 403,
      error: "Only an Owner can change an Owner.",
    });
    expect(canUpdateMember(actor(ADMIN), member("m2", ORDERS), { roleId: OWNER.id }, ROLES, 3)).toMatchObject({
      ok: false,
      error: "Only an Owner can grant Owner.",
    });
  });

  it("subset rule: a narrower manager cannot touch a broader Member or hand out a broader role", () => {
    const me = actor(USERS_MGR);
    expect(canUpdateMember(me, member("m2", ORDERS), { isActive: false }, ROLES, 1).ok).toBe(true);
    expect(canUpdateMember(me, member("m2", ORDERS), { roleId: USERS_MGR.id }, ROLES, 1).ok).toBe(true);
    expect(canUpdateMember(me, member("m2", ADMIN), { isActive: false }, ROLES, 1)).toMatchObject({ ok: false, status: 403 });
    expect(canUpdateMember(me, member("m2", MEDIA), { roleId: ORDERS.id }, ROLES, 1)).toMatchObject({ ok: false, status: 403 });
    expect(canUpdateMember(me, member("m2", ORDERS), { roleId: MEDIA.id }, ROLES, 1)).toMatchObject({ ok: false, status: 403 });
  });

  it("refuses an unknown target role", () => {
    expect(canUpdateMember(actor(OWNER), member("m2", ORDERS), { roleId: "nope" }, ROLES, 1)).toMatchObject({
      ok: false,
      status: 400,
    });
  });
});

describe("roles", () => {
  it("normalizes: unknown keys refused, requires applied", () => {
    expect(normalizeRolePermissions(["faq", "nope"])).toMatchObject({ ok: false, status: 400 });
    expect(normalizeRolePermissions(["page-builder"])).toEqual({ ok: true, permissions: ["media", "page-builder"] });
    expect(normalizeRolePermissions(["categories"])).toEqual({ ok: true, permissions: ["categories", "media", "products"] });
  });

  it("built-in roles cannot be edited or deleted", () => {
    expect(canEditRole(actor(OWNER), ADMIN, ["orders"])).toMatchObject({ ok: false, status: 403 });
    expect(canDeleteRole(actor(OWNER), OWNER, 0)).toMatchObject({ ok: false, status: 403 });
  });

  it("a role with Members is not deleted", () => {
    expect(canDeleteRole(actor(OWNER), ORDERS, 2)).toMatchObject({
      ok: false,
      status: 409,
      error: "2 Members hold Orders. Move them to another role first.",
    });
    expect(canDeleteRole(actor(OWNER), ORDERS, 0).ok).toBe(true);
  });

  it("subset rule on create and edit", () => {
    const me = actor(USERS_MGR);
    expect(canCreateRole(me, ["orders"]).ok).toBe(true);
    expect(canCreateRole(me, ["orders", "media"])).toMatchObject({ ok: false, status: 403 });
    expect(canEditRole(me, ORDERS, ["orders", "results"]).ok).toBe(true);
    expect(canEditRole(me, ORDERS, ["orders", "faq"])).toMatchObject({ ok: false, status: 403 });
    // Cannot narrow a role that already holds pages they lack either.
    expect(canEditRole(me, MEDIA, ["media"])).toMatchObject({ ok: false, status: 403 });
    expect(canEditRole(actor(ADMIN), MEDIA, ["media", "faq"]).ok).toBe(true);
  });
});
