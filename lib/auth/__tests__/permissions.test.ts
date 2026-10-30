import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  ADMIN_PERMISSIONS,
  PERMISSION_CATALOG,
  ROLE_PERMISSIONS,
  applyRequires,
  catalogForSurface,
  isPermission,
  isSubset,
  permissionEntry,
  deniedPageLabel,
  permissionForHref,
  roleHasPermission,
  permissionsForRole,
  parseBootstrapEmails,
  isBootstrapEmail,
  type AdminRole,
  type Permission,
} from "@/lib/auth/permissions";

const ROLES = Object.keys(ROLE_PERMISSIONS) as AdminRole[];

describe("role → permission matrix", () => {
  it("grants owners and admins every permission, Telegram actions included", () => {
    for (const perm of ADMIN_PERMISSIONS) {
      expect(roleHasPermission("owner", perm)).toBe(true);
      expect(roleHasPermission("admin", perm)).toBe(true);
    }
  });

  it("denies managers the privileged areas (users, api-configs, audit-log)", () => {
    expect(roleHasPermission("manager", "users")).toBe(false);
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
    expect(roleHasPermission("staff", "users")).toBe(false);
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
    for (const role of ROLES) {
      for (const perm of permissionsForRole(role)) {
        expect(isPermission(perm)).toBe(true);
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

  it("only owner and admin hold the privileged permissions and the Telegram actions", () => {
    const privileged: Permission[] = [
      "users",
      "audit-log",
      "api-configs",
      "telegram.google-review-reply",
      "telegram.shop-review-moderate",
      "telegram.shop-review-reply",
      "telegram.social-inbox-reply",
    ];
    for (const perm of privileged) {
      const granted = ROLES.filter((role) => roleHasPermission(role, perm));
      expect(granted.sort()).toEqual(["admin", "owner"]);
    }
  });

  it("every role already holds what its pages require", () => {
    for (const role of ROLES) {
      const held = permissionsForRole(role);
      expect([...applyRequires(held)].sort()).toEqual([...new Set(held)].sort());
    }
  });

  // CRM slice 10: seeing Customers and changing them are separate keys.
  it("customers-edit is a Customers tab that requires customers", () => {
    expect(permissionEntry("customers-edit")).toMatchObject({ surface: "admin-panel", requires: ["customers"] });
    expect(permissionEntry("customers-edit").href).toBeUndefined();
    expect(permissionForHref("/settings/customers")).toBe("customers");
  });

  it("every seeded role that sees Customers can change them; viewer gains neither", () => {
    for (const role of ROLES) {
      if (roleHasPermission(role, "customers")) expect(roleHasPermission(role, "customers-edit"), role).toBe(true);
    }
    expect(roleHasPermission("manager", "customers-edit")).toBe(true);
    expect(roleHasPermission("staff", "customers-edit")).toBe(true);
    expect(roleHasPermission("viewer", "customers")).toBe(false);
    expect(roleHasPermission("viewer", "customers-edit")).toBe(false);
  });
});

/**
 * Slice 02 of the Users & permissions PRD split the coarse keys so each page
 * has its own. The matrix before the split is frozen here, with the split
 * itself, to prove the split moved nobody's access: each role now holds
 * exactly the expansion of what it held.
 */
describe("one key per page: the split changed no one's access", () => {
  const LEGACY_ROLE_PERMISSIONS: Record<AdminRole, string[] | "all"> = {
    owner: "all",
    admin: "all",
    manager: [
      "products", "categories", "orders", "results", "customers", "discounts", "shipping",
      "inventory", "costings", "analytics", "page-builder", "blogs", "media", "showroom",
    ],
    staff: ["orders", "results", "customers", "inventory"],
    viewer: ["orders", "analytics"],
  };

  const SPLIT: Record<string, Permission[]> = {
    staff: ["users"],
    // CRM slice 10: changing Customers moved to its own key; every holder kept both.
    customers: ["customers", "customers-edit"],
    results: ["results", "appointments"],
    inventory: ["inventory", "configure", "shopify-link"],
    orders: ["orders", "returns"],
    "page-builder": [
      "page-builder", "partners", "partner-applications", "partner-commissions", "faq", "forms", "rules-engine",
    ],
  };

  const expand = (keys: string[]) =>
    new Set(keys.flatMap((k) => SPLIT[k] ?? [k as Permission]));

  it.each(ROLES)("%s holds exactly the expansion of its old keys", (role) => {
    const legacy = LEGACY_ROLE_PERMISSIONS[role];
    const now = new Set(permissionsForRole(role));
    if (legacy === "all") {
      // Owners and admins held every key; they now hold every key in the catalog.
      expect([...now].sort()).toEqual([...ADMIN_PERMISSIONS].sort());
      return;
    }
    expect([...now].sort()).toEqual([...expand(legacy)].sort());
  });

  it("no key is named for more than one page", () => {
    expect(new Set(ADMIN_PERMISSIONS).size).toBe(ADMIN_PERMISSIONS.length);
  });

  it("the coarse 'staff' key is gone", () => {
    expect(isPermission("staff")).toBe(false);
  });
});

describe("permission catalog", () => {
  const NAV_SOURCE = readFileSync(
    join(process.cwd(), "components", "settings", "settings-sidebar-nav.tsx"),
    "utf8",
  );
  const navHrefs = [...NAV_SOURCE.matchAll(/href: "(\/settings[^"]*)"/g)].map((m) => m[1]);

  it("finds the sidebar entries", () => {
    expect(navHrefs.length).toBeGreaterThan(20);
  });

  it("every sidebar page except General resolves to a catalog key", () => {
    for (const href of navHrefs) {
      if (href === "/settings") continue;
      expect(permissionForHref(href), href).toBeDefined();
    }
  });

  it("a page's own sub-route inherits that page's key; an exact entry beats its parent", () => {
    expect(permissionForHref("/settings/costings/services")).toBe("costings");
    expect(permissionForHref("/settings/inventory/configure")).toBe("configure");
    expect(permissionForHref("/settings/inventory/configure/premium-m")).toBe("configure");
    expect(permissionForHref("/settings/inventory/other")).toBe("inventory");
    // Whole segments only, and General stays open.
    expect(permissionForHref("/settings/costingsx")).toBeUndefined();
    expect(permissionForHref("/settings")).toBeUndefined();
  });

  it("every Admin Panel page key is in the sidebar", () => {
    for (const entry of catalogForSurface("admin-panel")) {
      if (entry.href) expect(navHrefs, entry.key).toContain(entry.href);
    }
  });

  it("an Admin Panel key without a page of its own is a tab reached through one that has", () => {
    for (const entry of catalogForSurface("admin-panel")) {
      if (entry.href) continue;
      const parents = entry.requires ?? [];
      expect(parents.some((p) => permissionEntry(p).href), entry.key).toBe(true);
    }
  });

  it("no two keys claim the same page", () => {
    const hrefs = PERMISSION_CATALOG.flatMap((e) => ("href" in e ? [e.href] : []));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("every requires target is a catalog key", () => {
    for (const entry of PERMISSION_CATALOG) {
      for (const r of ("requires" in entry ? entry.requires : []) as readonly string[]) {
        expect(isPermission(r), `${entry.key} → ${r}`).toBe(true);
      }
    }
  });

  it("pages that pick images require Media", () => {
    for (const key of ["page-builder", "blogs", "partners", "products"] as Permission[]) {
      expect(applyRequires([key]).has("media"), key).toBe(true);
    }
  });

  it("Telegram actions are their own surface with no sidebar page", () => {
    const telegram = catalogForSurface("telegram");
    expect(telegram.map((e) => e.key).sort()).toEqual([
      "telegram.google-review-reply",
      "telegram.shop-review-moderate",
      "telegram.shop-review-reply",
      "telegram.social-inbox-reply",
    ]);
    for (const e of telegram) expect(e.href).toBeUndefined();
  });

  it("applyRequires closes over chains and isSubset compares sets", () => {
    expect([...applyRequires(["categories"])].sort()).toEqual(["categories", "media", "products"]);
    expect(isSubset(["faq"], ["faq", "forms"])).toBe(true);
    expect(isSubset(["faq", "media"], ["faq"])).toBe(false);
  });
});

describe("deniedPageLabel", () => {
  it("labels an Admin Panel page key and ignores anything else", () => {
    expect(deniedPageLabel("faq")).toBe("FAQ");
    expect(deniedPageLabel("users")).toBe("Users & permissions");
    expect(deniedPageLabel("telegram.google-review-reply")).toBeNull();
    expect(deniedPageLabel("<script>")).toBeNull();
    expect(deniedPageLabel(null)).toBeNull();
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

describe("admin_roles seed (slice 03)", () => {
  const migration = (name: string) => readFileSync(join(process.cwd(), "supabase", "migrations", name), "utf8");
  const SQL = migration("20261004100000_admin_roles.sql");
  const seeded = (key: string) => {
    const m = SQL.match(new RegExp(`\\('${key}',[^]*?array\\[([^\\]]*)\\]`));
    return m ? [...m[1].matchAll(/'([a-z.-]+)'/g)].map((k) => k[1]) : null;
  };

  /**
   * Data migrations that gave existing custom roles a new key, each as the rule
   * it applies to a stored permission list. A test below pins each rule to its
   * SQL, so the seed plus these is what a database migrated from scratch holds.
   */
  const CUSTOMERS_EDIT = migration("20261020102000_customers_edit_permission.sql");
  const afterDataMigrations = (keys: string[]) =>
    keys.includes("customers") && !keys.includes("customers-edit") ? [...keys, "customers-edit"] : keys;

  it.each([
    ["manager", "manager"],
    ["fulfilment", "staff"],
    ["viewer", "viewer"],
  ] as const)("seeds %s with the code matrix's %s list, after the data migrations", (key, legacy) => {
    expect(afterDataMigrations(seeded(key) ?? []).sort()).toEqual([...ROLE_PERMISSIONS[legacy]].sort());
  });

  it("the customers-edit migration adds the key to every custom role holding customers, once", () => {
    const sql = CUSTOMERS_EDIT.replace(/--.*$/gm, "").replace(/\s+/g, " ").trim();
    expect(sql).toBe(
      "update admin_roles set permissions = array_append(permissions, 'customers-edit') " +
        "where not grants_all and 'customers' = any(permissions) and not 'customers-edit' = any(permissions);",
    );
  });

  it("seeds owner and admin as grants_all system roles", () => {
    expect(SQL).toMatch(/\('owner', 'Owner', '[^']*', true, true, '\{\}'\)/);
    expect(SQL).toMatch(/\('admin', 'Admin', '[^']*', true, true, '\{\}'\)/);
  });

  it("every seeded key is a catalog key", () => {
    for (const key of ["manager", "fulfilment", "viewer"]) {
      for (const k of seeded(key) ?? []) expect(isPermission(k), `${key} → ${k}`).toBe(true);
    }
  });
});
