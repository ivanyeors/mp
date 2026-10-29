// Deterministic origin before anything imports the email shell.
process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { money } from "@/lib/email/format";
import type { EmailTransport, OutgoingEmail } from "@/lib/email/types";
import type { EmailRendition } from "@/lib/media-assets/email-renditions";
import { verifyUnsubscribeToken } from "@/lib/marketing-consent/unsubscribe";
import type { CampaignContent } from "../content";
import { EMPTY_CAMPAIGN_DRAFT, type Campaign } from "../rules";
import { emptyWorld, fakeCampaignsClient, type FakeWorld } from "./fake-db";

/**
 * Products in what a campaign sends (PRD-campaign-email-editor slice 07,
 * decision 3): the preview, the test send and every batch read each product
 * from the shop as it is sold at that moment, through the shop's columns, so
 * a price changed in Costings is the next email's and no campaign row
 * changes. A product no longer Listed fails the checks before a wave by name,
 * and stops a batch, so no wave sends a dead link.
 */

const h = vi.hoisted(() => ({ asked: [] as string[][], failed: new Map<string, string>() }));
vi.mock("@/lib/media-assets/email-renditions", () => ({
  ensureEmailRenditions: vi.fn(async (_admin: unknown, ids: string[]) => {
    h.asked.push([...ids]);
    const renditions = new Map<string, EmailRendition>();
    for (const id of ids) {
      if (h.failed.has(id)) continue;
      renditions.set(id, { assetId: id, url: `https://mpillow.supabase.co/storage/v1/object/public/media/email/${id}.jpg`, width: 1200, height: 1200, bytes: 80_000, hasAlpha: false });
    }
    return { renditions, failed: new Map([...h.failed].filter(([id]) => ids.includes(id))) };
  }),
}));

const { planWave, readCampaignRenderData, renderCampaignPreview, sendCampaignBatch, sendCampaignTest } = await import("../sender");
const { campaignProductsProblem, readCampaignProducts } = await import("../products");
const { CHECK_LABEL } = await import("../send-flow");

const ORIGIN = "https://custom.mpillow.com";
const SECRET = "campaign-test-secret";
const CAMPAIGN = "5a1d3c2e-7b4f-4e6a-9c8d-0f1e2d3c4b5a";
const BEA = "00000000-0000-4000-8000-000000000002";
const DAN = "00000000-0000-4000-8000-000000000004";

const COVER = "3b7e1f2a-9c4d-4a6b-8e1f-5d2c3b4a6e7f";
const NECK = "7c2a4e6b-1d3f-4b8a-9e2c-6f4d5a3b2c1e";
const CASE = "9e4b6d8a-2f1c-4e3a-8b7d-1c2e3f4a5b6d";
const GONE = "2d4f6a8c-1e3b-4d5f-8a7c-9e1b3d5f7a9c";
const COVER_PHOTO = "6f1c2b9e-3d4a-4e8b-9c1d-2a3b4c5d6e7f";
const NECK_PHOTO = "8a2d3c4b-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const NECK_PHOTO_URL = "https://mpillow.supabase.co/storage/v1/object/public/media/library/neck.webp";

const sgd = (n: number) => money(n, "SGD");
const variant = (id: string, price: number, over: Record<string, unknown> = {}) => ({
  id,
  sku: id,
  title: id,
  price,
  compare_at_price: null,
  currency: "SGD",
  is_active: true,
  position: 0,
  ...over,
});
const product = (id: string, slug: string, title: string, over: Record<string, unknown> = {}) => ({
  id,
  slug,
  product_type: "accessory",
  status: "active",
  content: { "en-US": { title, description: "", body: "" } },
  product_variants: [],
  product_images: [],
  ...over,
});

/** The shop: a cover in two sizes at two prices, a neck support on sale, a bolster case with one Variant and no photo. */
function shop(w: FakeWorld) {
  w.products = [
    product(COVER, "fibrecool-cover", "FibreCool Cover", {
      product_variants: [variant("cover-l", 49), variant("cover-s", 39)],
      product_images: [
        { id: "i2", url: "https://x.test/second.webp", alt_text: null, position: 1, media_asset_id: null },
        { id: "i1", url: "https://x.test/first.webp", alt_text: null, position: 0, media_asset_id: COVER_PHOTO },
      ],
    }),
    product(NECK, "cervical-neck-support", "Cervical Neck Support", {
      product_variants: [variant("neck", 45, { compare_at_price: 59 })],
      // A photo added before the Media Library: only its address.
      product_images: [{ id: "i3", url: NECK_PHOTO_URL, alt_text: null, position: 0, media_asset_id: null }],
    }),
    product(CASE, "camel-bolster-case", "Camel Bolster Case", { product_variants: [variant("case", 29.5)] }),
  ];
  w.mediaAssets = [{ id: NECK_PHOTO, hosted_url: NECK_PHOTO_URL }];
}

const CONTENT: CampaignContent = {
  v: 1,
  blocks: [
    { id: "intro", type: "text", paragraphs: [{ kind: "p", runs: [{ text: "Our covers are back." }] }] },
    { id: "grid", type: "products", products: [COVER, NECK, CASE], layout: "side_by_side", buttonLabel: "Shop now" },
  ],
  fallbacks: {},
};
const campaign = (content: CampaignContent = CONTENT): Campaign => ({
  ...EMPTY_CAMPAIGN_DRAFT,
  name: "December launch",
  subject: "Sleep cooler",
  content,
  audience: "subscribed",
  id: CAMPAIGN,
  createdAt: "2026-10-21T00:00:00Z",
  updatedAt: "2026-10-21T00:00:00Z",
  lockedAt: "2026-10-21T01:00:00Z",
  archivedAt: null,
  createdBy: null,
});

let world: FakeWorld;
let sent: OutgoingEmail[];

function setup() {
  sent = [];
  const transport: EmailTransport = {
    name: "resend",
    async send(email) {
      sent.push(email);
      return { id: `re_${sent.length}` };
    },
  };
  return {
    admin: fakeCampaignsClient(world) as unknown as SupabaseClient,
    transport,
    campaignFrom: "Mpillow <hello@hello.mpillow.com>",
    campaignDomain: "hello.mpillow.com",
    orderFrom: "orders@mpillow.com",
    replyTo: "Mpillow Support <support@mpillow.com>",
    origin: ORIGIN,
    unsubscribeSecret: SECRET,
    // The site answers one-click unsubscribe for links signed here.
    fetchImpl: vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname !== "/api/email/unsubscribe") return new Response("not found", { status: 404 });
      if (!verifyUnsubscribeToken(url.searchParams.get("u"), url.searchParams.get("t"), SECRET)) {
        return Response.json({ ok: false, error: "invalid_link" }, { status: 400 });
      }
      return Response.json({ ok: true });
    }) as unknown as typeof fetch,
    sleep: vi.fn(async () => undefined),
  };
}

beforeEach(() => {
  h.asked = [];
  h.failed = new Map();
  world = emptyWorld();
  world.reads = [];
  world.customers.push(
    { id: BEA, email: "bea@x.test", first_name: "Bea", marketing_email: "subscribed" },
    { id: DAN, email: "dan@x.test", first_name: "Dan", marketing_email: "subscribed" },
  );
  world.campaigns.push({ id: CAMPAIGN, audience: "subscribed" });
  shop(world);
});

const unlist = (id: string) => {
  const p = world.products!.find((x) => x.id === id)!;
  p.status = "draft";
};
const reprice = (variantId: string, price: number) => {
  for (const p of world.products!) for (const v of p.product_variants as { id: string; price: number }[]) if (v.id === variantId) v.price = price;
};

describe("reading a campaign's products from the shop", () => {
  it("reads each as the shop card shows it: its name, first photo and the cheapest active Variant's price", async () => {
    const read = await readCampaignProducts(setup().admin, CONTENT);
    expect(read).toEqual({
      products: {
        [COVER]: { title: "FibreCool Cover", slug: "fibrecool-cover", image: { asset: COVER_PHOTO }, price: 39, compareAt: null, from: true, currency: "SGD" },
        [NECK]: { title: "Cervical Neck Support", slug: "cervical-neck-support", image: { asset: NECK_PHOTO }, price: 45, compareAt: 59, from: false, currency: "SGD" },
        [CASE]: { title: "Camel Bolster Case", slug: "camel-bolster-case", image: null, price: 29.5, compareAt: null, from: false, currency: "SGD" },
      },
      unlisted: [],
      error: null,
    });
  });

  it("names every product that is not Listed: archived, all its Variants off, made in the configurator, or gone", async () => {
    unlist(NECK);
    for (const v of world.products!.find((p) => p.id === CASE)!.product_variants as { is_active: boolean }[]) v.is_active = false;
    world.products!.push(product(GONE, "custom-pillow", "Custom Pillow", { product_type: "pillow", product_variants: [variant("pillow", 199)] }));
    const content: CampaignContent = { ...CONTENT, blocks: [{ id: "grid", type: "products", products: [COVER, NECK, CASE], layout: "rows", buttonLabel: "Shop now" }, { id: "b", type: "buttons", buttons: [{ label: "Customise", target: "product", product: GONE, style: "primary" }] }] };
    const read = await readCampaignProducts(setup().admin, content);
    expect(Object.keys(read.products)).toEqual([COVER]);
    expect(read.unlisted).toEqual([
      { productId: NECK, title: "Cervical Neck Support" },
      { productId: CASE, title: "Camel Bolster Case" },
      { productId: GONE, title: "Custom Pillow" },
    ]);
    world.products = world.products!.filter((p) => p.id !== NECK);
    expect(campaignProductsProblem(await readCampaignProducts(setup().admin, content))).toBe(
      "A product in the email is no longer in the shop: remove it; Camel Bolster Case is no longer in the shop: remove it or list it again; Custom Pillow is no longer in the shop: remove it or list it again",
    );
  });

  it("reads nothing for an email with no product, and says so when the shop cannot be read", async () => {
    const plain: CampaignContent = { ...CONTENT, blocks: [CONTENT.blocks[0]] };
    expect(await readCampaignProducts(setup().admin, plain)).toEqual({ products: {}, unlisted: [], error: null });
    expect(world.reads).toEqual([]);
    const broken = { from: () => ({ select: () => ({ in: async () => ({ data: null, error: { message: "timeout" } }) }) }) } as unknown as SupabaseClient;
    expect(campaignProductsProblem(await readCampaignProducts(broken, CONTENT))).toBe("The shop's products couldn't be read: timeout");
  });

  it("makes the products' photos into email renditions with the blocks' images, and names the product whose photo cannot be", async () => {
    const shown = await readCampaignRenderData(setup().admin, CONTENT);
    expect(h.asked).toEqual([[COVER_PHOTO, NECK_PHOTO]]);
    expect(Object.keys(shown.images)).toEqual([COVER_PHOTO, NECK_PHOTO]);
    expect(shown.problem).toBeNull();
    h.failed = new Map([[NECK_PHOTO, "The Media Library's copy of it couldn't be read: its address answered 404."]]);
    expect((await readCampaignRenderData(setup().admin, CONTENT)).problem).toBe(
      "the photo of Cervical Neck Support has no copy an inbox can show: The Media Library's copy of it couldn't be read: its address answered 404.",
    );
  });
});

describe("a product's price in what is sent", () => {
  it("is the shop's price at that moment: a Costings change reaches the next preview and the next batch, and no campaign row changes", async () => {
    const c = campaign();
    const before = JSON.stringify(c);
    const s = setup();
    expect(await sendCampaignTest(c, { to: ["me@mpillow.com"], firstName: "Ivan" }, s)).toEqual({ sent: ["me@mpillow.com"], failed: [] });
    expect(sent[0].text).toContain(`FibreCool Cover\nfrom ${sgd(39)}`);
    expect(sent[0].text).toContain(`Cervical Neck Support\n${sgd(45)} (was ${sgd(59)})`);

    // Costings' save mirrors the new MSRP onto the Variant (price-sync); the campaign is not touched.
    reprice("cover-s", 35);
    reprice("cover-l", 35);
    const shown = await readCampaignRenderData(s.admin, c.content);
    expect(renderCampaignPreview(c, { origin: ORIGIN, firstName: "Ivan", ...shown }).text).toContain(`FibreCool Cover\n${sgd(35)}`);
    const r = await sendCampaignBatch(c, { wave: "W1", customerIds: [BEA, DAN] }, s);
    expect(r).toMatchObject({ sent: 2, stopped: null });
    for (const email of sent.slice(1)) {
      expect(email.text).toContain(`FibreCool Cover\n${sgd(35)}`);
      expect(email.html).toContain("/en-US/shop/fibrecool-cover?utm_source=email_campaign&amp;utm_medium=email&amp;utm_campaign=december-launch");
    }
    expect(JSON.stringify(c)).toBe(before);
    // Read from the shop, never written back: the fake has no campaigns table to write.
    expect(world.reads).not.toContain("email_campaigns");
  });
});

describe("a product that is no longer Listed", () => {
  it("fails the checks before a wave, by name, so the wave cannot start", async () => {
    const s = setup();
    const listed = await planWave(campaign(), { size: 10 }, s);
    expect(listed.readiness.checks.find((c) => c.key === "products")).toEqual({ key: "products", ok: true, detail: "the 3 products in the email are in the shop" });
    expect(listed.readiness.checks.filter((c) => !c.ok)).toEqual([]);
    expect(listed.readiness.ready).toBe(true);

    unlist(NECK);
    const r = await planWave(campaign(), { size: 10 }, s);
    expect(r.readiness.checks.find((c) => c.key === "products")).toEqual({
      key: "products",
      ok: false,
      detail: "Cervical Neck Support is no longer in the shop: remove it or list it again",
    });
    expect(r.readiness.ready).toBe(false);
    // The Send tab names it in words.
    expect(CHECK_LABEL.products).toBe("Every product is still in the shop");
  });

  it("stops a batch mid-wave before anyone is sent a dead link, and refuses a test", async () => {
    unlist(NECK);
    const r = await sendCampaignBatch(campaign(), { wave: "W1", customerIds: [BEA, DAN] }, setup());
    expect(r).toMatchObject({ sent: 0, failed: 0, stopped: "Cervical Neck Support is no longer in the shop: remove it or list it again" });
    expect(world.sends).toEqual([]);
    expect(await sendCampaignTest(campaign(), { to: ["me@mpillow.com"], firstName: "Ivan" }, setup())).toEqual({
      refused: "Cervical Neck Support is no longer in the shop: remove it or list it again",
    });
    expect(sent).toEqual([]);
  });

  it("is a hint in the preview, which still shows the rest", async () => {
    unlist(NECK);
    const s = setup();
    const shown = await readCampaignRenderData(s.admin, campaign().content);
    expect(shown.problem).toBe("Cervical Neck Support is no longer in the shop: remove it or list it again");
    const preview = renderCampaignPreview(campaign(), { origin: ORIGIN, firstName: "Ivan", ...shown });
    expect(preview.html).toContain("This product is no longer in the shop: remove it or list it again.");
    expect(preview.text).toContain("FibreCool Cover");
    expect(preview.text).not.toContain("Cervical Neck Support");
  });

  it("is not a check at all for an email with no product", async () => {
    const plain = campaign({ ...CONTENT, blocks: [CONTENT.blocks[0]] });
    const r = await planWave(plain, { size: 10 }, setup());
    expect(r.readiness.checks.map((c) => c.key)).not.toContain("products");
    expect(world.reads).not.toContain("products");
  });
});
