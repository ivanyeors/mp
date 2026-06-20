/**
 * Admin RBAC permission catalog and role→permission matrix.
 *
 * Permissions correspond 1:1 with the settings areas in the admin back office.
 * The matrix is defined in code (not the database) so it is deterministic and
 * unit-testable; staff membership, role, and active status live in the
 * `admin_users` table.
 */

export const ADMIN_PERMISSIONS = [
  "api-configs",
  "products",
  "categories",
  "orders",
  "results",
  "customers",
  "discounts",
  "shipping",
  "inventory",
  "costings",
  "analytics",
  "page-builder",
  "blogs",
  "media",
  "staff",
  "audit-log",
] as const;

export type Permission = (typeof ADMIN_PERMISSIONS)[number];

export const ADMIN_ROLES = ["owner", "admin", "manager", "staff", "viewer"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

const ALL: Permission[] = [...ADMIN_PERMISSIONS];

/**
 * Role → granted permissions. Owners and admins have full access (admins can
 * also manage staff and view the audit log). Managers run day-to-day commerce
 * but cannot touch API configs, staff, or the audit log. Staff handle
 * fulfilment-adjacent areas. Viewers get read-oriented insight areas.
 */
export const ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
  owner: ALL,
  admin: ALL,
  manager: [
    "products",
    "categories",
    "orders",
    "results",
    "customers",
    "discounts",
    "shipping",
    "inventory",
    "costings",
    "analytics",
    "page-builder",
    "blogs",
    "media",
  ],
  staff: ["orders", "results", "customers", "inventory"],
  viewer: ["orders", "analytics"],
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
