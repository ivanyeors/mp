// Deterministic origin before anything imports the email shell.
process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeWorld } from "@/lib/email-campaigns/__tests__/fake-db";

/**
 * Products through the page's actions (PRD-campaign-email-editor slice 07):
 * the picker lists only the shop's Listed products, through the shop's own
 * query, each as the email will show it; a campaign's cards say which of its
 * products are no longer in the shop; the preview prices each from the shop.
 * All behind `campaigns`, and none writes anything.
 */

const COVER = "3b7e1f2a-9c4d-4a6b-8e1f-5d2c3b4a6e7f";
const NECK = "7c2a4e6b-1d3f-4b8a-9e2c-6f4d5a3b2c1e";
const GONE = "2d4f6a8c-1e3b-4d5f-8a7c-9e1b3d5f7a9c";

const row = (id: string, slug: string, title: string, over: Record<string, unknown> = {}) => ({
  id,
  slug,
  product_type: "accessory",
  status: "active",
  content: { "en-US": { title, description: "", body: "" } },
  product_variants: [{ id: `${slug}-v`, price: 39, compare_at_price: null, currency: "SGD", is_active: true, position: 0 }],
  product_images: [{ id: `${slug}-i`, url: `https://x.test/${slug}.webp`, alt_text: null, position: 0, media_asset_id: null }],
  ...over,
});

const h = vi.hoisted(() => ({ world: null as unknown as FakeWorld, asked: [] as unknown[], allowed: true }));
vi.mock("@/lib/auth/admin", () => ({
  assertAdmin: vi.fn(async (key: string) => {
    h.asked.push(key);
    if (!h.allowed) throw new Error("Not allowed");
    return { permissions: new Set(["campaigns"]), email: "owner@mpillow.com", memberId: "m1", userId: "u1" };
  }),
}));
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction: vi.fn() }));
vi.mock("@/lib/staff/working-as", () => ({ getWorkingAs: vi.fn(async () => ({ id: "s1", name: "Ivan Yeo" })) }));
vi.mock("@/lib/email-campaigns/setup", () => ({ campaignSenderSetup: () => ({ origin: "https://custom.mpillow.com" }) }));
vi.mock("@/lib/supabase/server", async () => {
  const { fakeCampaignsClient } = await import("@/lib/email-campaigns/__tests__/fake-db");
  return { supabaseAdmin: () => fakeCampaignsClient(h.world) };
});
// The shop's own query, as the shop page calls it.
vi.mock("@/lib/ecommerce/products", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ecommerce/products")>();
  return {
    ...actual,
    getProducts: vi.fn(async (opts: { status?: string; search?: string }) => ({
      products: (h.world.products ?? []).filter(
        (p) =>
          (!opts.status || p.status === opts.status) &&
          actual.isShopCatalogProduct(p as { product_type: string }) &&
          (!opts.search || String(p.slug).includes(opts.search.toLowerCase())),
      ),
      total: 0,
      page: 1,
      limit: 24,
    })),
  };
});

const { describeCampaignProducts, findCampaignProducts, previewCampaign } = await import("../actions");
const { getProducts } = await import("@/lib/ecommerce/products");
const { emptyWorld } = await import("@/lib/email-campaigns/__tests__/fake-db");

beforeEach(() => {
  vi.clearAllMocks();
  h.asked = [];
  h.allowed = true;
  h.world = emptyWorld();
  h.world.products = [
    row(COVER, "fibrecool-cover", "FibreCool Cover", {
      product_variants: [
        { id: "l", price: 49, compare_at_price: null, currency: "SGD", is_active: true, position: 0 },
        { id: "s", price: 39, compare_at_price: null, currency: "SGD", is_active: true, position: 1 },
      ],
    }),
    row(NECK, "cervical-neck-support", "Cervical Neck Support", { status: "draft" }),
    row("5b6c7d8e-9f0a-4b1c-8d2e-3f4a5b6c7d8e", "ear-comfort-pad", "Ear Comfort Pad", {
      product_variants: [{ id: "e", price: 12, compare_at_price: null, currency: "SGD", is_active: false, position: 0 }],
    }),
    row("6c7d8e9f-0a1b-4c2d-8e3f-4a5b6c7d8e9f", "custom-pillow", "Custom Pillow", { product_type: "pillow" }),
  ];
});

describe("the products picker", () => {
  it("lists only Listed shop products, each as the email will show it", async () => {
    const r = await findCampaignProducts("");
    expect(r).toEqual({
      ok: true,
      products: [{ id: COVER, title: "FibreCool Cover", photoUrl: "https://x.test/fibrecool-cover.webp", price: expect.stringMatching(/^from SGD.39\.00$/), listed: true }],
    });
    expect(getProducts).toHaveBeenCalledWith({ status: "active", search: undefined, limit: 24 });
    expect(h.asked).toEqual(["campaigns"]);
  });

  it("searches the shop the way the shop does, with what was typed", async () => {
    await findCampaignProducts("  fibre ");
    expect(getProducts).toHaveBeenCalledWith({ status: "active", search: "fibre", limit: 24 });
  });

  it("needs the campaigns permission", async () => {
    h.allowed = false;
    await expect(findCampaignProducts("")).rejects.toThrow("Not allowed");
    await expect(describeCampaignProducts([COVER])).rejects.toThrow("Not allowed");
    expect(getProducts).not.toHaveBeenCalled();
  });
});

describe("a campaign's product cards", () => {
  it("say which products are still in the shop, by name, and which are gone", async () => {
    expect(await describeCampaignProducts([COVER, NECK, GONE])).toEqual({
      ok: true,
      products: [
        expect.objectContaining({ id: COVER, title: "FibreCool Cover", listed: true }),
        { id: NECK, title: "Cervical Neck Support", photoUrl: "https://x.test/cervical-neck-support.webp", price: null, listed: false },
        { id: GONE, title: null, photoUrl: null, price: null, listed: false },
      ],
    });
  });

  it("refuses anything that is not a product id", async () => {
    expect(await describeCampaignProducts(["FibreCool"])).toEqual({ ok: false, error: "Those are not products from the shop." });
    expect(await describeCampaignProducts("x" as unknown as string[])).toEqual({ ok: false, error: "Those are not products from the shop." });
  });
});

describe("the preview", () => {
  it("prices each product from the shop now, and draws one no longer listed as a hint", async () => {
    const r = await previewCampaign({
      name: "December",
      subject: "Sleep cooler",
      preheader: "",
      body: "",
      content: { v: 1, blocks: [{ id: "p", type: "products", products: [COVER, NECK], layout: "rows", buttonLabel: "Shop now" }], fallbacks: {} },
      greeting: false,
      audience: "subscribed",
      segmentId: null,
      button: null,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.text).toMatch(/FibreCool Cover\nfrom SGD.39\.00\nShop now: https:\/\/custom\.mpillow\.com\/en-US\/shop\/fibrecool-cover\?utm_source=email_campaign/);
    expect(r.html).toContain("This product is no longer in the shop: remove it or list it again.");
  });
});
