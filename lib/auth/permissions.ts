export type PermissionSurface = "admin-panel" | "telegram";

export type PermissionGroup =
  | "General"
  | "CRM"
  | "Inventory"
  | "Store"
  | "Landing site"
  | "Insights"
  | "Showroom"
  | "Integration"
  | "Telegram";

type CatalogEntry = {
  readonly key: string;
  readonly label: string;
  readonly group: PermissionGroup;
  readonly href?: string;
  readonly surface: PermissionSurface;
  readonly requires?: readonly string[];
};

export const PERMISSION_CATALOG = [
  { key: "api-configs", label: "API configs", group: "General", href: "/settings/general", surface: "admin-panel" },
  { key: "appointments", label: "Appointments", group: "General", href: "/settings/appointments", surface: "admin-panel" },
  { key: "users", label: "Users & permissions", group: "General", href: "/settings/users", surface: "admin-panel" },
  { key: "docs", label: "Documentation", group: "General", href: "/settings/docs", surface: "admin-panel" },

  { key: "customers", label: "Customers", group: "CRM", href: "/settings/customers", surface: "admin-panel" },
  { key: "customers-edit", label: "Customers: make changes (Customers page)", group: "CRM", surface: "admin-panel", requires: ["customers"] },
  { key: "customer-import", label: "Customer import (Customers page)", group: "CRM", surface: "admin-panel", requires: ["customers", "customers-edit"] },
  { key: "results", label: "Results", group: "CRM", href: "/settings/results", surface: "admin-panel" },
  { key: "orders", label: "Orders", group: "CRM", href: "/settings/orders", surface: "admin-panel" },
  { key: "returns", label: "Returns / RMA", group: "CRM", href: "/settings/rma", surface: "admin-panel" },
  { key: "campaigns", label: "Email campaigns", group: "CRM", href: "/settings/campaigns", surface: "admin-panel", requires: ["media"] },
  { key: "email-templates", label: "Email templates", group: "CRM", href: "/settings/email-templates", surface: "admin-panel" },

  { key: "inventory", label: "Inventory", group: "Inventory", href: "/settings/inventory", surface: "admin-panel" },
  { key: "costings", label: "Costings", group: "Inventory", href: "/settings/costings", surface: "admin-panel" },

  { key: "products", label: "Products", group: "Store", href: "/settings/products", surface: "admin-panel", requires: ["media"] },
  { key: "categories", label: "Categories (Products tab)", group: "Store", surface: "admin-panel", requires: ["products"] },
  { key: "configure", label: "Configure", group: "Store", href: "/settings/inventory/configure", surface: "admin-panel" },
  { key: "rules-engine", label: "Rules Engine", group: "Store", href: "/settings/product-builder/rules-engine", surface: "admin-panel" },
  { key: "discounts", label: "Discounts", group: "Store", href: "/settings/discounts", surface: "admin-panel" },
  { key: "shipping", label: "Shipping", group: "Store", href: "/settings/shipping", surface: "admin-panel" },

  { key: "page-builder", label: "Page Builder", group: "Landing site", href: "/settings/page-builder", surface: "admin-panel", requires: ["media"] },
  { key: "partners", label: "Partners", group: "Landing site", href: "/settings/partners", surface: "admin-panel", requires: ["media"] },
  { key: "partner-applications", label: "Partner applications", group: "Landing site", href: "/settings/partner-applications", surface: "admin-panel" },
  { key: "partner-commissions", label: "Partner commissions", group: "Landing site", href: "/settings/partner-commissions", surface: "admin-panel" },
  { key: "blogs", label: "Blogs", group: "Landing site", href: "/settings/blogs", surface: "admin-panel", requires: ["media"] },
  { key: "faq", label: "FAQ", group: "Landing site", href: "/settings/faq", surface: "admin-panel" },
  { key: "forms", label: "Forms", group: "Landing site", href: "/settings/forms", surface: "admin-panel" },
  { key: "media", label: "Media", group: "Landing site", href: "/settings/media", surface: "admin-panel" },

  { key: "analytics", label: "Analytics", group: "Insights", href: "/settings/analytics", surface: "admin-panel" },
  { key: "audit-log", label: "Audit log", group: "Insights", href: "/settings/audit-log", surface: "admin-panel" },

  { key: "showroom", label: "Showroom model", group: "Showroom", href: "/settings/showroom", surface: "admin-panel" },

  { key: "shopify-link", label: "Shopify link", group: "Integration", href: "/settings/integrations/shopify", surface: "admin-panel" },

  { key: "telegram.google-review-reply", label: "Reply to Google reviews", group: "Telegram", surface: "telegram" },
  { key: "telegram.shop-review-moderate", label: "Moderate shop reviews", group: "Telegram", surface: "telegram" },
  { key: "telegram.shop-review-reply", label: "Reply to shop reviews", group: "Telegram", surface: "telegram" },
  { key: "telegram.social-inbox-reply", label: "Answer customer messages", group: "Telegram", surface: "telegram" },
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

export function deniedPageLabel(value: string | null | undefined): string | null {
  if (!isPermission(value)) return null;
  const entry = permissionEntry(value);
  return entry.surface === "admin-panel" ? entry.label : null;
}

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

export type RoleGrant = { readonly grants_all: boolean; readonly permissions: readonly string[] | null };

export function permissionsForRoleRow(role: RoleGrant): ReadonlySet<Permission> {
  if (role.grants_all) return new Set(ADMIN_PERMISSIONS);
  return new Set((role.permissions ?? []).filter(isPermission));
}

export function hasPermission(ctx: { readonly permissions: ReadonlySet<Permission> }, permission: Permission): boolean {
  return ctx.permissions.has(permission);
}

export const ADMIN_ROLES = ["owner", "admin", "manager", "staff", "viewer"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

const ALL: Permission[] = [...ADMIN_PERMISSIONS];

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
