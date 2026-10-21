/**
 * Admin RBAC permission catalog and role→permission matrix (ADR 0023).
 *
 * The catalog is the set of things the code can check: one key per Admin Panel
 * page, plus each Telegram action. A guard naming a key that is not here fails
 * to compile, and the sidebar reads each page's key from here by href, so a
 * page cannot be listed under one key and guarded under another.
 *
 * Which roles hold which keys is data: `admin_roles.permissions`, edited on
 * Users & permissions → Roles and read per request by `getAdminContext`.
 * `ROLE_PERMISSIONS` below is only the seed those rows started from.
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
  readonly surface: PermissionSurface;
  /** Keys this page cannot work without (it calls their APIs); ticked with it. */
  readonly requires?: readonly string[];
};

export const PERMISSION_CATALOG = [
  { key: "api-configs", label: "API Configs", group: "General", href: "/settings/general", surface: "admin-panel" },
  { key: "appointments", label: "Appointments", group: "General", href: "/settings/appointments", surface: "admin-panel" },
  { key: "users", label: "Users & permissions", group: "General", href: "/settings/users", surface: "admin-panel" },

  { key: "inventory", label: "Inventory", group: "Inventory", href: "/settings/inventory", surface: "admin-panel" },
  { key: "costings", label: "Costings", group: "Inventory", href: "/settings/costings", surface: "admin-panel" },

  { key: "products", label: "Products", group: "Store", href: "/settings/products", surface: "admin-panel", requires: ["media"] },
  { key: "categories", label: "Categories (Products tab)", group: "Store", surface: "admin-panel", requires: ["products"] },
  { key: "configure", label: "Configure", group: "Store", href: "/settings/inventory/configure", surface: "admin-panel" },
  { key: "rules-engine", label: "Rules Engine", group: "Store", href: "/settings/product-builder/rules-engine", surface: "admin-panel" },
  { key: "customers", label: "Customers", group: "Store", href: "/settings/customers", surface: "admin-panel" },
  // Seeing the Customers page is `customers`; every change on it is this key (CRM slice 10).
  { key: "customers-edit", label: "Customers: make changes (Customers page)", group: "Store", surface: "admin-panel", requires: ["customers"] },
  // Importing is a change, so it sits on `customers-edit` (migration slice 02, CRM slice 10).
  { key: "customer-import", label: "Customer import (Customers page)", group: "Store", surface: "admin-panel", requires: ["customers", "customers-edit"] },
  // Sending marketing email to the customer list (PRD-email-marketing). Its own key, held by
  // Owner and Admin only, as `customer-import` is: Manager and Staff hold `customers`.
  { key: "campaigns", label: "Email campaigns", group: "Store", href: "/settings/campaigns", surface: "admin-panel" },
  { key: "results", label: "Results", group: "Store", href: "/settings/results", surface: "admin-panel" },
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
    e.href ? [[e.href, e.key as Permission] as const] : [],
  ),
);

/**
 * The permission a sidebar page needs, or undefined for a page open to any Staff (General).
 *
 * A page's own sub-route with no catalog entry of its own (Costings → Service fees at
 * `/settings/costings/services`) is guarded by that page: the longest catalog href that
 * is a whole-segment prefix wins, so an exact entry (`/settings/inventory/configure` →
 * `configure`) always beats its parent (`/settings/inventory` → `inventory`).
 */
export function permissionForHref(href: string): Permission | undefined {
  const exact = KEY_BY_HREF.get(href);
  if (exact) return exact;
  let best: { href: string; key: Permission } | null = null;
  for (const [pageHref, key] of KEY_BY_HREF) {
    if (href.startsWith(`${pageHref}/`) && pageHref.length > (best?.href.length ?? 0)) {
      best = { href: pageHref, key };
    }
  }
  return best?.key;
}

/**
 * The page label for a `?denied=<key>` value, or null when it is not an
 * Admin Panel page key (so a crafted value renders nothing).
 */
export function deniedPageLabel(value: string | null | undefined): string | null {
  if (!isPermission(value)) return null;
  const entry = permissionEntry(value);
  return entry.surface === "admin-panel" ? entry.label : null;
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

/** What a role row stores: built-in roles grant every key, custom roles list theirs. */
export type RoleGrant = { readonly grants_all: boolean; readonly permissions: readonly string[] | null };

/**
 * The keys a role row grants. `grants_all` means every catalog key, including
 * ones added after the role was saved; a stored key the catalog no longer has
 * is ignored, so retiring a page never breaks a role.
 */
export function permissionsForRoleRow(role: RoleGrant): ReadonlySet<Permission> {
  if (role.grants_all) return new Set(ADMIN_PERMISSIONS);
  return new Set((role.permissions ?? []).filter(isPermission));
}

/** Whether a resolved Member (see `getAdminContext`) holds `permission`. */
export function hasPermission(ctx: { readonly permissions: ReadonlySet<Permission> }, permission: Permission): boolean {
  return ctx.permissions.has(permission);
}

/**
 * Legacy role names (the `admin_users.role` text column, dropped in slice 11).
 * Nothing reads them at runtime any more; they name the seed below.
 */
export const ADMIN_ROLES = ["owner", "admin", "manager", "staff", "viewer"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

const ALL: Permission[] = [...ADMIN_PERMISSIONS];

/**
 * The code matrix the `admin_roles` rows were seeded from
 * (`supabase/migrations/20261004100000_admin_roles.sql`; the old `staff` role
 * is seeded as Fulfilment), plus the keys later data migrations gave them
 * (`20261020102000_customers_edit_permission.sql`: `customers-edit` to every
 * role holding `customers`). Not read at runtime: a test keeps the seed, the
 * data migrations and this list equal, and `permissions.test.ts` proves it is
 * the pre-split matrix with every coarse key expanded (no gain, no loss).
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
    "customers-edit",
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
  staff: ["orders", "returns", "results", "appointments", "customers", "customers-edit", "inventory", "configure", "shopify-link"],
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
