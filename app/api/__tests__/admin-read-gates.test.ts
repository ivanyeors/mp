import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { roleHasPermission, type AdminRole } from "@/lib/auth/permissions";

/**
 * Admin Panel reads that answered anonymously (#173). Only settings/** calls
 * them, so each GET now needs the permission its writes already use; public
 * pages read the same data through server-side libs. Uncalled admin GETs were
 * removed instead of gated.
 */

const h = vi.hoisted(() => ({
  role: null as AdminRole | null,
  from: vi.fn(),
  faqItems: vi.fn(),
  faqCategories: vi.fn(),
  partners: vi.fn(),
}));

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: vi.fn(async (permission: Parameters<typeof roleHasPermission>[1]) => {
    if (!h.role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return roleHasPermission(h.role, permission)
      ? null
      : NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }),
}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/cache/invalidate", () => ({ invalidateTag: vi.fn() }));
vi.mock("@/lib/media-assets", () => ({ touchLastUsed: vi.fn() }));
vi.mock("@/lib/media/replace", () => ({ landingAssetIdKey: (k: string) => `${k}_asset_id` }));
vi.mock("@/lib/faq", () => ({ getAllFaqItemsAdmin: h.faqItems, getAllFaqCategoriesAdmin: h.faqCategories }));
vi.mock("@/lib/partners", () => ({ listAdminLocationRows: h.partners }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => {
    const b = {
      from: (t: string) => (h.from(t), b),
      select: () => b,
      in: () => b,
      then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
    };
    return b;
  },
}));

const siteSettings = await import("@/app/api/site-settings/route");
const faqItems = await import("@/app/api/faq/items/route");
const faqCategories = await import("@/app/api/faq/categories/route");
const partners = await import("@/app/api/partners/route");

beforeEach(() => {
  vi.clearAllMocks();
  h.role = null;
  h.faqItems.mockResolvedValue([]);
  h.faqCategories.mockResolvedValue([]);
  h.partners.mockResolvedValue([]);
});

describe("anonymous callers are refused before any read", () => {
  it("GET /api/site-settings (every row, incl. ops email)", async () => {
    const res = await siteSettings.GET(new Request("http://x/api/site-settings"));
    expect(res.status).toBe(401);
    expect(h.from).not.toHaveBeenCalled();
  });

  it("GET /api/faq/items", async () => {
    const res = await faqItems.GET(new Request("http://x/api/faq/items"));
    expect(res.status).toBe(401);
    expect(h.faqItems).not.toHaveBeenCalled();
  });

  it("GET /api/faq/categories", async () => {
    const res = await faqCategories.GET();
    expect(res.status).toBe(401);
    expect(h.faqCategories).not.toHaveBeenCalled();
  });

  it("GET /api/partners (hidden partners included)", async () => {
    const res = await partners.GET();
    expect(res.status).toBe(401);
    expect(h.partners).not.toHaveBeenCalled();
  });
});

describe("staff holding page-builder still load the Admin Panel", () => {
  it.each([
    ["site-settings", () => siteSettings.GET(new Request("http://x/api/site-settings?keys=landing_hero"))],
    ["faq items", () => faqItems.GET(new Request("http://x/api/faq/items"))],
    ["faq categories", () => faqCategories.GET()],
    ["partners", () => partners.GET()],
  ])("%s → 200", async (_name, run) => {
    h.role = "manager";
    expect((await run()).status).toBe(200);
  });
});

it("uncalled admin GETs are gone", async () => {
  const category = await import("@/app/api/shop/categories/[id]/route");
  const images = await import("@/app/api/shop/products/[id]/images/route");
  expect("GET" in category).toBe(false);
  expect("GET" in images).toBe(false);
});
