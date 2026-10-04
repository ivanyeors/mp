import { describe, it, expect } from "vitest";
import {
  ADMIN_PERMISSIONS,
  ROLE_PERMISSIONS,
  roleHasPermission,
  permissionsForRole,
  parseBootstrapEmails,
  isBootstrapEmail,
  type AdminRole,
  type Permission,
} from "@/lib/auth/permissions";

describe("role → permission matrix", () => {
  it("grants owners and admins every settings area", () => {
    for (const perm of ADMIN_PERMISSIONS) {
      expect(roleHasPermission("owner", perm)).toBe(true);
      expect(roleHasPermission("admin", perm)).toBe(true);
    }
  });

  it("denies managers the privileged areas (staff, api-configs, audit-log)", () => {
    expect(roleHasPermission("manager", "staff")).toBe(false);
    expect(roleHasPermission("manager", "api-configs")).toBe(false);
    expect(roleHasPermission("manager", "audit-log")).toBe(false);
    // but allows day-to-day commerce
    expect(roleHasPermission("manager", "orders")).toBe(true);
    expect(roleHasPermission("manager", "products")).toBe(true);
  });

  it("limits staff to fulfilment-adjacent areas", () => {
    expect(roleHasPermission("staff", "orders")).toBe(true);
    expect(roleHasPermission("staff", "inventory")).toBe(true);
    expect(roleHasPermission("staff", "discounts")).toBe(false);
    expect(roleHasPermission("staff", "staff")).toBe(false);
  });

  it("limits viewers to read-oriented insight areas", () => {
    expect(roleHasPermission("viewer", "analytics")).toBe(true);
    expect(roleHasPermission("viewer", "orders")).toBe(true);
    expect(roleHasPermission("viewer", "products")).toBe(false);
  });

  it("opens the showroom model to managers, not to staff or viewers", () => {
    expect(roleHasPermission("manager", "showroom")).toBe(true);
    expect(roleHasPermission("staff", "showroom")).toBe(false);
    expect(roleHasPermission("viewer", "showroom")).toBe(false);
  });

  it("every permission in the matrix is a known permission", () => {
    const known = new Set<Permission>(ADMIN_PERMISSIONS);
    for (const role of Object.keys(ROLE_PERMISSIONS) as AdminRole[]) {
      for (const perm of permissionsForRole(role)) {
        expect(known.has(perm)).toBe(true);
      }
    }
  });

  // Cutover guarantee (#39): authorization is decided solely by the role →
  // permission matrix. There is no fallback role, wildcard, or shared-secret
  // path that yields access outside the matrix.
  it("grants nothing to a role that is not in the matrix", () => {
    const unknownRole = "intruder" as AdminRole;
    expect(permissionsForRole(unknownRole)).toEqual([]);
    for (const perm of ADMIN_PERMISSIONS) {
      expect(roleHasPermission(unknownRole, perm)).toBe(false);
    }
  });

  it("only owner and admin hold the privileged audit-log and staff permissions", () => {
    const privileged: Permission[] = ["staff", "audit-log", "api-configs"];
    for (const perm of privileged) {
      const granted = (Object.keys(ROLE_PERMISSIONS) as AdminRole[]).filter((role) =>
        roleHasPermission(role, perm),
      );
      expect(granted.sort()).toEqual(["admin", "owner"]);
    }
  });
});

describe("first-admin bootstrap allowlist", () => {
  it("parses and normalizes a comma-separated list", () => {
    expect(parseBootstrapEmails(" Owner@Example.com , staff@x.io ")).toEqual([
      "owner@example.com",
      "staff@x.io",
    ]);
    expect(parseBootstrapEmails("")).toEqual([]);
    expect(parseBootstrapEmails(undefined)).toEqual([]);
  });

  it("matches emails case-insensitively", () => {
    const allow = parseBootstrapEmails("owner@example.com");
    expect(isBootstrapEmail("OWNER@example.com", allow)).toBe(true);
    expect(isBootstrapEmail("intruder@example.com", allow)).toBe(false);
  });
});
