import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  hasPermission,
  permissionEntry,
  permissionsForRoleRow,
  ROLE_PERMISSIONS,
  type Permission,
} from "@/lib/auth/permissions";

/**
 * Customers → Import from Shopify is its own key (hazard 4): Owner and Admin
 * hold it through grants_all, Manager and Staff hold `customers` but not this,
 * so they get the denied page and never see the button.
 */

const h = vi.hoisted(() => ({ permissions: new Set<string>() }));

vi.mock("@/lib/auth/admin", () => ({
  requireAdminPage: vi.fn(async (permission: string) => {
    if (!h.permissions.has(permission)) throw new Error(`REDIRECT /settings?denied=${permission}`);
    return { permissions: h.permissions };
  }),
  assertAdmin: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: vi.fn() }));
vi.mock("@/lib/ecommerce/admin/customers", () => ({
  listAdminCustomers: vi.fn(async () => ({ ok: true, rows: [], total: 0, page: 1, limit: 20 })),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/settings/customers",
  useRouter: () => ({ push: vi.fn() }),
}));

const { default: ImportPage } = await import("../page");
const { default: CustomersPage } = await import("../../page");
const { CustomersClient } = await import("../../customers-client");
const { CustomerImportClient } = await import("../import-client");

/** What each seeded role row resolves to at runtime (`permissionsForRoleRow`). */
const ROLE_ROWS = {
  owner: { grants_all: true, permissions: [] },
  admin: { grants_all: true, permissions: [] },
  manager: { grants_all: false, permissions: ROLE_PERMISSIONS.manager },
  fulfilment: { grants_all: false, permissions: ROLE_PERMISSIONS.staff },
  viewer: { grants_all: false, permissions: ROLE_PERMISSIONS.viewer },
} as const;
type RoleKey = keyof typeof ROLE_ROWS;

const signInAs = (role: RoleKey) => {
  h.permissions = new Set(permissionsForRoleRow(ROLE_ROWS[role]));
};
const params = Promise.resolve({ lang: "en-US" });

beforeEach(() => vi.clearAllMocks());

describe("customer-import in the catalog", () => {
  it("is a tab of the Customers page that requires customers", () => {
    expect(permissionEntry("customer-import" as Permission)).toMatchObject({
      label: "Customer import (Customers page)",
      group: "Store",
      surface: "admin-panel",
      requires: ["customers"],
    });
    expect(permissionEntry("customer-import").href).toBeUndefined();
  });

  it("is held by Owner and Admin only", () => {
    for (const role of Object.keys(ROLE_ROWS) as RoleKey[]) {
      const held = permissionsForRoleRow(ROLE_ROWS[role]);
      expect(hasPermission({ permissions: held }, "customer-import"), role).toBe(role === "owner" || role === "admin");
    }
  });
});

describe("/settings/customers/import", () => {
  it.each(["manager", "fulfilment", "viewer"] as const)("sends %s to the denied page", async (role) => {
    signInAs(role);
    await expect(ImportPage({ params })).rejects.toThrow("REDIRECT /settings?denied=customer-import");
  });

  it.each(["owner", "admin"] as const)("opens for %s", async (role) => {
    signInAs(role);
    const page = (await ImportPage({ params })) as ReactElement;
    expect(page.type).toBe(CustomerImportClient);
  });

  it("says the file stays in the tab, and offers only a .csv pick", () => {
    const html = renderToStaticMarkup(<CustomerImportClient />);
    expect(html).toContain("The file stays in this tab. It is never uploaded or stored");
    expect(html).toMatch(/type="file"[^>]*accept=".csv"|accept=".csv"[^>]*type="file"/);
  });
});

describe("the Import from Shopify button on Customers", () => {
  it.each(Object.keys(ROLE_ROWS) as RoleKey[])("is offered to %s only when the role holds customer-import", async (role) => {
    signInAs(role);
    if (!h.permissions.has("customers")) {
      await expect(CustomersPage({ params })).rejects.toThrow("denied=customers");
      return;
    }
    const page = (await CustomersPage({ params })) as ReactElement<{ canImport: boolean }>;
    expect(page.props.canImport).toBe(role === "owner" || role === "admin");
  });

  it("renders only under canImport", () => {
    const initialData = { customers: { ok: true as const, rows: [], total: 0, page: 1, limit: 20 } };
    const withButton = renderToStaticMarkup(<CustomersClient initialData={initialData} canImport />);
    const without = renderToStaticMarkup(<CustomersClient initialData={initialData} canImport={false} />);
    expect(withButton).toContain("Import from Shopify");
    expect(withButton).toMatch(/href="[^"]*\/settings\/customers\/import"/);
    expect(without).not.toContain("Import from Shopify");
    expect(renderToStaticMarkup(<CustomersClient initialData={initialData} />)).not.toContain("Import from Shopify");
  });
});
