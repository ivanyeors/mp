/**
 * Admin RBAC permission catalog and role→permission matrix (ADR 0023).
 *
 * The catalog is the set of things the code can check: one key per Admin Panel
 * page, plus each Telegram action. A guard naming a key that is not here fails
 * to compile, and the sidebar reads each page's key from here by href, so a
 * page cannot be listed under one key and guarded under another.
 *
 * The role→permission matrix is still defined in code; staff membership, role,
 * and active status live in the `admin_users` table.
 */

export type PermissionSurface = "admin-panel" | "telegram";

export type PermissionGroup =
  | "General"
  | "Inventory"
  | "Store"
  | "Landing Site"
  | "Insights"
  | "Showroom"
  | "Integration"
  | "Telegram";

type CatalogEntry = {
  readonly key: string;
  readonly label: string;
  readonly group: PermissionGroup;
  /** The sidebar page this key opens. Omitted for a tab of another page and for Telegram actions. */
  readonly href?: string;
  /** Further sidebar pages still served by this key until they are merged into its page. */
  readonly alsoAt?: readonly string[];
  readonly surface: PermissionSurface;
  /** Keys this page cannot work without (it calls their APIs); ticked with it. */
  readonly requires?: readonly string[];
};

export const PERMISSION_CATALOG = [
  { key: "api-configs", label: "API Configs", group: "General", href: "/settings/general", surface: "admin-panel" },
  { key: "appointments", label: "Appointments", group: "General", href: "/settings/appointments", surface: "admin-panel" },
  { key: "users", label: "Admin Users", group: "General", href: "/settings/admins", surface: "admin-panel" },

  { key: "inventory", label: "Inventory", group: "Inventory", href: "/settings/inventory", surface: "admin-panel" },
  { key: "costings", label: "Costings", group: "Inventory", href: "/settings/costings", surface: "admin-panel" },

  { key: "products", label: "Products", group: "Store", href: "/settings/products", surface: "admin-panel", requires: ["media"] },
  { key: "categories", label: "Categories (Products tab)", group: "Store", surface: "admin-panel", requires: ["products"] },
  { key: "configure", label: "Configure", group: "Store", href: "/settings/inventory/configure", surface: "admin-panel" },
  { key: "rules-engine", label: "Rules Engine", group: "Store", href: "/settings/product-builder/rules-engine", surface: "admin-panel" },
  { key: "customers", label: "Customers", group: "Store", href: "/settings/customers", surface: "admin-panel" },
  // Staff Management keeps the Results key until Users & permissions absorbs it (slice 04).
  { key: "results", label: "Results", group: "Store", href: "/settings/results", alsoAt: ["/settings/staff-management"], surface: "admin-panel" },
  { key: "orders", label: "Orders", group: "Store", href: "/settings/orders", surface: "admin-panel" },
  { key: "returns", label: "Returns / RMA", group: "Store", href: "/settings/rma", surface: "admin-panel" },
  { key: "discounts", label: "Discounts", group: "Store", href: "/settings/discounts", surface: "admin-panel" },
  { key: "shipping", label: "Shipping", group: "Store", href: "/settings/shipping", surface: "admin-panel" },

  { key: "page-builder", label: "Page Builder", group: "Landing Site", href: "/settings/page-builder", surface: "admin-panel", requires: ["media"] },
  { key: "partners", label: "Partners", group: "Landing Site", href: "/settings/partners", surface: "admin-panel", requires: ["media"] },
  { key: "partner-applications", label: "Partner applications", group: "Landing Site", href: "/settings/partner-applications", surface: "admin-panel" },
  { key: "partner-commissions", label: "Partner Commissions", group: "Landing Site", href: "/settings/partner-commissions", surface: "admin-panel" },
  { key: "blogs", label: "Blogs", group: "Landing Site", href: "/settings/blogs", surface: "admin-panel", requires: ["media"] },
  { key: "faq", label: "FAQ", group: "Landing Site", href: "/settings/faq", surface: "admin-panel" },
  { key: "forms", label: "Forms", group: "Landing Site", href: "/settings/forms", surface: "admin-panel" },
  { key: "media", label: "Media", group: "Landing Site", href: "/settings/media", surface: "admin-panel" },

  { key: "analytics", label: "Analytics", group: "Insights", href: "/settings/analytics", surface: "admin-panel" },
  { key: "audit-log", label: "Audit Log", group: "Insights", href: "/settings/audit-log", surface: "admin-panel" },

  { key: "showroom", label: "Showroom Model", group: "Showroom", href: "/settings/showroom", surface: "admin-panel" },

  { key: "shopify-link", label: "Shopify Link", group: "Integration", href: "/settings/integrations/shopify", surface: "admin-panel" },

  { key: "telegram.google-review-reply", label: "Reply to Google reviews", group: "Telegram", surface: "telegram" },
  { key: "telegram.shop-review-moderate", label: "Moderate shop reviews", group: "Telegram", surface: "telegram" },
] as const satisfies readonly CatalogEntry[];

export type Permission = (typeof PERMISSION_CATALOG)[number]["key"];
export type PermissionEntry = Omit<CatalogEntry, "key" | "requires"> & {
  readonly key: Permission;
  readonly requires?: readonly Permission[];
};

export const ADMIN_PERMISSIONS: readonly Permission[] = PERMISSION_CATALOG.map((e) => e.key);

const CATALOG_BY_KEY = new Map<Permission, PermissionEntry>(
  PERMISSION_CATALOG.map((e) => [e.key, e as PermissionEntry]),
);

export function permissionEntry(key: Permission): PermissionEntry {
  return CATALOG_BY_KEY.get(key)!;
}

export function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && CATALOG_BY_KEY.has(value as Permission);
}

export function catalogForSurface(surface: PermissionSurface): PermissionEntry[] {
  return [...CATALOG_BY_KEY.values()].filter((e) => e.surface === surface);
}

const KEY_BY_HREF = new Map<string, Permission>(
  PERMISSION_CATALOG.flatMap((e: CatalogEntry) =>
    [e.href, ...(e.alsoAt ?? [])].filter((h): h is string => !!h).map((h) => [h, e.key as Permission] as const),
  ),
);

/** The permission a sidebar page needs, or undefined for a page open to any Staff (General). */
export function permissionForHref(href: string): Permission | undefined {
  return KEY_BY_HREF.get(href);
}

/** Close a set under `requires`, so ticking a page also ticks what it calls. */
export function applyRequires(keys: Iterable<Permission>): Set<Permission> {
  const out = new Set<Permission>();
  const visit = (k: Permission) => {
    if (out.has(k)) return;
    out.add(k);
    for (const r of permissionEntry(k).requires ?? []) visit(r);
  };
  for (const k of keys) visit(k);
  return out;
}

export function isSubset(keys: Iterable<Permission>, of: Iterable<Permission>): boolean {
  const held = new Set(of);
  for (const k of keys) if (!held.has(k)) return false;
  return true;
}

export const ADMIN_ROLES = ["owner", "admin", "manager", "staff", "viewer"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

const ALL: Permission[] = [...ADMIN_PERMISSIONS];

/**
 * Role → granted permissions. Owners and admins have full access (admins can
 * also manage users and view the audit log). Managers run day-to-day commerce
 * but cannot touch API configs, users, the audit log, or Telegram. Staff handle
 * fulfilment-adjacent areas. Viewers get read-oriented insight areas.
 *
 * Each list is the pre-split matrix with every coarse key expanded to the pages
 * it used to gate (`lib/auth/__tests__/permissions.test.ts` proves no gain, no loss).
 */
export const ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
  owner: ALL,
  admin: ALL,
  manager: [
    "products",
    "categories",
    "configure",
    "rules-engine",
    "customers",
    "results",
    "appointments",
    "orders",
    "returns",
    "discounts",
    "shipping",
    "inventory",
    "costings",
    "shopify-link",
    "analytics",
    "page-builder",
    "partners",
    "partner-applications",
    "partner-commissions",
    "blogs",
    "faq",
    "forms",
    "media",
    "showroom",
  ],
  staff: ["orders", "returns", "results", "appointments", "customers", "inventory", "configure", "shopify-link"],
  viewer: ["orders", "returns", "analytics"],
};

export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === "string" && (ADMIN_ROLES as readonly string[]).includes(value);
}

export function permissionsForRole(role: AdminRole): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function roleHasPermission(role: AdminRole, permission: Permission): boolean {
  return permissionsForRole(role).includes(permission);
}

/**
 * Parse and normalize the first-admin bootstrap allowlist from an env value.
 */
export function parseBootstrapEmails(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isBootstrapEmail(email: string, allowlist: string[]): boolean {
  return allowlist.includes(email.trim().toLowerCase());
}
