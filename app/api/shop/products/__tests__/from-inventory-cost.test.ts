import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { checkPushPrices, costingGaps, unsyncedSizes, type FamilySize, type InventoryFamily } from "@/lib/ecommerce/inventory-families";
import { permissionsForRole, type Permission } from "@/lib/auth/permissions";

const h = vi.hoisted(() => ({
  permissions: new Set<string>(),
  push: vi.fn(),
}));

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: vi.fn(async (permission: string) =>
    h.permissions.has(permission) ? null : NextResponse.json({ error: "Forbidden" }, { status: 403 }),
  ),
  adminCanSeeCost: vi.fn(async () => h.permissions.has("costings")),
  getAdminContext: vi.fn(async () => ({ userId: "u1", email: "ops@example.com", permissions: h.permissions })),
}));
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction: vi.fn() }));
vi.mock("@/lib/ecommerce/shop-listings", () => ({
  listInventoryFamilies: vi.fn(async (): Promise<InventoryFamily[]> => [
    {
      key: "cover\u0000Silk",
      category: "cover",
      name: "Silk",
      title: "Silk Cover",
      sizes: [
        { itemId: 1, size: "M", costCents: 1250, msrpCents: 3900, productId: null },
        { itemId: 2, size: "L", costCents: 1475, msrpCents: 4200, productId: null },
      ],
      push: "new",
      productId: null,
      productSlug: null,
      productStatus: null,
    },
  ]),
  pushFamilyToProducts: h.push,
}));

const { GET, POST } = await import("@/app/api/shop/products/from-inventory/route");

const MARKETING: Permission[] = ["products", "media", "page-builder", "blogs"];
const signInWith = (permissions: Iterable<Permission>) => {
  h.permissions = new Set(permissions);
};

const pushRequest = (prices: unknown[]) =>
  POST(
    new Request("https://x.test/api/shop/products/from-inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_ids: [1], prices }),
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  h.push.mockResolvedValue({
    ok: true,
    productId: "p1",
    slug: "silk-cover",
    title: "Silk Cover",
    created: true,
    added: 1,
    productStatus: "draft",
    stripeWarnings: [],
  });
});

describe("a role with products but not costings (Marketing)", () => {
  beforeEach(() => signInWith(MARKETING));

  it("gets no size cost from GET", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.can_see_cost).toBe(false);
    const sizes = (json.rows as InventoryFamily[])[0]!.sizes;
    expect(sizes.map((s) => s.costCents)).toEqual([null, null]);
    expect(sizes.map((s) => s.msrpCents)).toEqual([3900, 4200]);
    expect(JSON.stringify(json)).not.toMatch(/1250|1475/);
  });

  it("can push after checking only the MSRP, and the cost it sends is not compared", async () => {
    const res = await pushRequest([{ item_id: 1, cost_cents: null, msrp_cents: 3900 }]);
    expect(res.status).toBe(200);
    expect(h.push).toHaveBeenCalledWith([1], [{ itemId: 1, costCents: null, msrpCents: 3900 }], false);
  });
});

describe("a role with products and costings (Manager) keeps today's behaviour", () => {
  beforeEach(() => signInWith(permissionsForRole("manager")));

  it("gets each size's cost from GET", async () => {
    const json = await (await GET()).json();
    expect(json.can_see_cost).toBe(true);
    expect((json.rows as InventoryFamily[])[0]!.sizes.map((s) => s.costCents)).toEqual([1250, 1475]);
  });

  it("has the confirmed cost compared on push", async () => {
    const res = await pushRequest([{ item_id: 1, cost_cents: 1250, msrp_cents: 3900 }]);
    expect(res.status).toBe(200);
    expect(h.push).toHaveBeenCalledWith([1], [{ itemId: 1, costCents: 1250, msrpCents: 3900 }], true);
  });
});

describe("the push price check", () => {
  const size: FamilySize = { itemId: 1, size: "M", costCents: 1250, msrpCents: 3900, productId: null };

  it("ignores the cost for a role without costings, so a push is no way to guess it", () => {
    expect(checkPushPrices("cover", [size], [{ itemId: 1, costCents: null, msrpCents: 3900 }], false)).toBeNull();
    expect(checkPushPrices("cover", [size], [{ itemId: 1, costCents: 999, msrpCents: 3900 }], false)).toBeNull();
  });

  it("still refuses a changed MSRP for a role without costings", () => {
    expect(checkPushPrices("cover", [size], [{ itemId: 1, costCents: null, msrpCents: 3000 }], false)?.reason).toBe("changed");
  });

  it("still refuses a size with no cost in Costings, whoever pushes", () => {
    const unpriced = { ...size, costCents: null };
    expect(checkPushPrices("cover", [unpriced], [{ itemId: 1, costCents: null, msrpCents: 3900 }], false)?.reason).toBe("not_synced");
  });

  it("refuses a changed cost for a role with costings, as before", () => {
    expect(checkPushPrices("cover", [size], [{ itemId: 1, costCents: 999, msrpCents: 3900 }], true)?.reason).toBe("changed");
  });

  it("reports only MSRP gaps to a role that cannot see cost", () => {
    const hidden = { costCents: null, msrpCents: 3900 };
    expect(costingGaps("cover", hidden, false)).toEqual([]);
    expect(costingGaps("cover", hidden, true)).toEqual(["cost"]);
    expect(unsyncedSizes("cover", [{ costCents: null, msrpCents: null }], false)).toHaveLength(1);
  });
});
