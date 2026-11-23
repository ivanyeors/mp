import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { permissionsForRole, type Permission } from "@/lib/auth/permissions";

type Row = Record<string, unknown>;

const PRODUCT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VARIANT = { id: "v1", product_id: PRODUCT_ID, title: "M", price: 39, cost_price: 12.5, is_active: true };

const h = vi.hoisted(() => ({
  permissions: new Set<string>(),
  inserts: [] as Row[],
  updates: [] as Row[],
}));

vi.mock("@/lib/auth/admin", () => {
  const ctx = () => ({ userId: "u1", email: "ops@example.com", permissions: h.permissions });
  return {
    requireAdmin: vi.fn(async (permission: string) =>
      h.permissions.has(permission) ? null : NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    ),
    adminCanSeeCost: vi.fn(async () => h.permissions.has("costings")),
    requireAdminPage: vi.fn(async () => ctx()),
  };
});
vi.mock("@/lib/ecommerce/products", () => ({
  attachStockAvailable: async (rows: unknown[]) => rows,
  CUSTOM_COMPOSED_PRODUCT_TYPES: ["pillow", "bolster"],
}));
vi.mock("@/lib/ecommerce/categories", () => ({ getCategoryTree: async () => [] }));
vi.mock("@/lib/ai/page-availability", () => ({ readAiWritingAvailability: async () => ({}) }));
vi.mock("@/lib/ecommerce/admin/coupons", () => ({ getAdminCoupon: async () => ({ ok: false }) }));
vi.mock("@/lib/stripe/sync", () => ({ syncProductToStripeSafe: vi.fn(async () => undefined) }));
vi.mock("@/app/[lang]/settings/products/products-client", () => ({ ProductsClient: () => null }));
vi.mock("@/app/[lang]/settings/products/[id]/product-editor-client", () => ({ ProductEditorClient: () => null }));
vi.mock("@/app/[lang]/settings/discounts/[id]/discount-editor-client", () => ({ DiscountEditorClient: () => null }));

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      let columns = "*";
      let op = "select";
      let payload: Row | null = null;
      const product = () => ({ id: PRODUCT_ID, slug: "silk-cover", product_variants: [{ ...VARIANT }], product_images: [] });
      const answer = async () => {
        if (table === "products" && columns === "is_auto_generated") return { data: { is_auto_generated: false }, error: null };
        if (table === "products") return { data: product(), error: null };
        if (op === "insert") {
          h.inserts.push(payload!);
          return { data: { id: "v2", price: 0, ...payload }, error: null };
        }
        if (op === "update") {
          h.updates.push(payload!);
          return { data: { ...VARIANT, ...payload }, error: null };
        }
        return { data: [{ ...VARIANT }], error: null, count: 1 };
      };
      const q = {
        select: (cols = "*") => {
          if (op === "select") columns = cols;
          return q;
        },
        insert: (row: Row) => ((op = "insert"), (payload = row), q),
        update: (row: Row) => ((op = "update"), (payload = row), q),
        eq: () => q,
        in: () => q,
        not: () => q,
        ilike: () => q,
        order: () => q,
        range: async () => ({ data: [product()], error: null, count: 1 }),
        single: answer,
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => answer().then(resolve, reject),
      };
      return q;
    },
  }),
}));

const listRoute = await import("@/app/api/shop/products/route");
const productRoute = await import("@/app/api/shop/products/[id]/route");
const variantsRoute = await import("@/app/api/shop/products/[id]/variants/route");
const variantRoute = await import("@/app/api/shop/products/[id]/variants/[variantId]/route");
const { default: ProductsPage } = await import("@/app/[lang]/settings/products/page");
const { default: ProductEditorPage } = await import("@/app/[lang]/settings/products/[id]/page");
const { default: DiscountEditorPage } = await import("@/app/[lang]/settings/discounts/[id]/page");

const MARKETING: Permission[] = ["products", "categories", "media", "page-builder", "blogs"];
const signInWith = (permissions: Iterable<Permission>) => {
  h.permissions = new Set(permissions);
};

const productParams = { params: Promise.resolve({ id: PRODUCT_ID }) };
const variantParams = { params: Promise.resolve({ id: PRODUCT_ID, variantId: "v1" }) };
const send = (method: "POST" | "PATCH", body: Row) =>
  new Request("http://x/api/shop/products/variants", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const variantsIn = (json: { rows?: Row[]; row?: Row }) => {
  const rows = json.rows ?? [json.row!];
  return rows.flatMap((r) => (r.product_variants as Row[] | undefined) ?? [r]);
};

type PageElement = { props: Record<string, unknown> };

beforeEach(() => {
  vi.clearAllMocks();
  h.inserts = [];
  h.updates = [];
});

describe("a role with products but not costings (Marketing)", () => {
  beforeEach(() => signInWith(MARKETING));

  it.each([
    ["GET /api/shop/products", () => listRoute.GET(new Request("http://x/api/shop/products"))],
    ["GET /api/shop/products/[id]", () => productRoute.GET(new Request("http://x"), productParams)],
    ["GET /api/shop/products/[id]/variants", () => variantsRoute.GET(new Request("http://x"), productParams)],
  ])("%s sends no variant cost", async (_name, run) => {
    const res = await run();
    expect(res.status).toBe(200);
    const json = await res.json();
    const variants = variantsIn(json);
    expect(variants.length).toBeGreaterThan(0);
    for (const v of variants) expect(v).not.toHaveProperty("cost_price");
    expect(variants[0]!.price).toBe(39);
  });

  it("the Products page and product editor get no variant cost, and the editor is told to hide it", async () => {
    const list = (await ProductsPage({
      params: Promise.resolve({ lang: "en-US" }),
      searchParams: Promise.resolve({}),
    })) as PageElement;
    const listRows = (list.props.initialData as { products: { rows: Row[] } }).products.rows;
    expect((listRows[0]!.product_variants as Row[])[0]).not.toHaveProperty("cost_price");

    const editor = (await ProductEditorPage({ params: Promise.resolve({ lang: "en-US", id: PRODUCT_ID }) })) as PageElement;
    expect(editor.props.canSeeCost).toBe(false);
    const row = (editor.props.initialData as { product: { row: Row } }).product.row;
    expect((row.product_variants as Row[])[0]).not.toHaveProperty("cost_price");
  });

  it("refuses a new variant that carries a cost, and writes nothing", async () => {
    const res = await variantsRoute.POST(send("POST", { title: "L", price: 45, cost_price: 14 }), productParams);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Only staff with Costings access can set a cost price.");
    expect(h.inserts).toEqual([]);
  });

  it("adds a variant without a cost_price column and answers without one", async () => {
    const res = await variantsRoute.POST(send("POST", { title: "L", price: 45 }), productParams);
    expect(res.status).toBe(200);
    expect(h.inserts[0]).not.toHaveProperty("cost_price");
    expect((await res.json()).row).not.toHaveProperty("cost_price");
  });

  it("refuses an edit that sets a cost, and writes nothing", async () => {
    const res = await variantRoute.PATCH(send("PATCH", { title: "M", cost_price: 3 }), variantParams);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Only staff with Costings access can set a cost price.");
    expect(h.updates).toEqual([]);
  });

  it("keeps the stored cost when an edit clears it or leaves it out", async () => {
    for (const body of [{ title: "Medium", cost_price: null }, { title: "Medium" }]) {
      const res = await variantRoute.PATCH(send("PATCH", body), variantParams);
      expect(res.status).toBe(200);
      expect((await res.json()).row).not.toHaveProperty("cost_price");
    }
    expect(h.updates).toEqual([{ title: "Medium" }, { title: "Medium" }]);
  });
});

describe("a role with products and costings (Manager) keeps today's behaviour", () => {
  beforeEach(() => signInWith(permissionsForRole("manager")));

  it.each([
    ["GET /api/shop/products", () => listRoute.GET(new Request("http://x/api/shop/products"))],
    ["GET /api/shop/products/[id]", () => productRoute.GET(new Request("http://x"), productParams)],
    ["GET /api/shop/products/[id]/variants", () => variantsRoute.GET(new Request("http://x"), productParams)],
  ])("%s sends the variant cost", async (_name, run) => {
    const json = await (await run()).json();
    expect(variantsIn(json)[0]!.cost_price).toBe(12.5);
  });

  it("the product editor gets the cost and shows it", async () => {
    const editor = (await ProductEditorPage({ params: Promise.resolve({ lang: "en-US", id: PRODUCT_ID }) })) as PageElement;
    expect(editor.props.canSeeCost).toBe(true);
    const row = (editor.props.initialData as { product: { row: Row } }).product.row;
    expect((row.product_variants as Row[])[0]!.cost_price).toBe(12.5);
  });

  it("sets a cost on a new variant", async () => {
    const res = await variantsRoute.POST(send("POST", { title: "L", price: 45, cost_price: 14 }), productParams);
    expect(res.status).toBe(200);
    expect(h.inserts[0]!.cost_price).toBe(14);
    expect((await res.json()).row.cost_price).toBe(14);
  });

  it("sets and clears a variant's cost", async () => {
    await variantRoute.PATCH(send("PATCH", { cost_price: 3 }), variantParams);
    await variantRoute.PATCH(send("PATCH", { cost_price: null }), variantParams);
    expect(h.updates).toEqual([{ cost_price: 3 }, { cost_price: null }]);
  });
});

describe("the Discounts editor", () => {
  it("never gets variant cost, whoever opens it", async () => {
    signInWith(permissionsForRole("owner"));
    const page = (await DiscountEditorPage({ params: Promise.resolve({ lang: "en-US", id: "new" }) })) as PageElement;
    const rows = (page.props.initialData as { products: { rows: Row[] } }).products.rows;
    expect((rows[0]!.product_variants as Row[])[0]).not.toHaveProperty("cost_price");
  });
});
