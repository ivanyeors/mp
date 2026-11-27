import { existsSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest, type NextFetchEvent } from "next/server";
import { blogSlugFate } from "@/lib/blog-redirects";
import { shopifyRedirect } from "@/lib/shopify-redirects";

vi.mock("@/lib/supabase/middleware", () => ({ refreshSupabaseSession: vi.fn(async () => undefined) }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));

const { proxy } = await import("@/proxy");

type Row = { old: string; status: 301 | 302 | null; to: string };
const MAP: Row[] = JSON.parse(readFileSync("lib/__fixtures__/shopify-redirect-map.json", "utf8"));

const WWW = "https://www.mpillow.com";
const CUSTOM = "https://custom.mpillow.com";
const event = { waitUntil: () => undefined } as unknown as NextFetchEvent;

async function hit(url: string, site: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  process.env.NEXT_PUBLIC_SITE_URL = site;
  return proxy(new NextRequest(url, { method: init.method ?? "GET", headers: { "accept-language": "en-US", ...init.headers } }), event);
}

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

describe("the approved redirect map, after the switch", () => {
  it("has all 215 rows", () => {
    expect(MAP).toHaveLength(215);
  });

  it.each(MAP.filter((r) => r.status !== null).map((r) => [r.old, r] as const))(
    "%s",
    async (_, row) => {
      const res = await hit(`${WWW}${row.old}`, WWW);
      expect(res.status).toBe(row.status);
      expect(res.headers.get("location")).toBe(`${WWW}${row.to}`);
    },
  );

  it("leaves the home page to the language redirect, once Explore's launch has passed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-01-01T00:00:00+08:00"));
    try {
      const res = await hit(`${WWW}/`, WWW);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe(`${WWW}/en-US`);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("before the switch", () => {
  it("answers every old address on custom.mpillow.com, so it can be tested there now", async () => {
    for (const row of MAP.filter((r) => r.status !== null)) {
      const res = await hit(`${CUSTOM}${row.old}`, CUSTOM);
      expect([row.old, res.status, res.headers.get("location")]).toEqual([row.old, row.status, `${CUSTOM}${row.to}`]);
    }
  });

  it("keeps custom.mpillow.com where it is", async () => {
    expect((await hit(`${CUSTOM}/en-US/shop`, CUSTOM)).status).toBe(200);
  });

  it("never sends www.mpillow.com away, so the DNS can move first", async () => {
    expect((await hit(`${WWW}/en-US/shop`, CUSTOM)).status).toBe(200);
  });

  it("stays on a preview's own host", async () => {
    const res = await hit("https://mp-inv-git-x.vercel.app/pages/contact", CUSTOM);
    expect(res.headers.get("location")).toBe("https://mp-inv-git-x.vercel.app/en-US/support");
  });
});

describe("the move to www.mpillow.com", () => {
  it("sends custom., work. and the bare domain to the same address on www, query and all", async () => {
    for (const from of [CUSTOM, "https://work.mpillow.com", "https://mpillow.com"]) {
      const res = await hit(`${from}/en-US/shop/checkout/confirmation?session_id=cs_test_1`, WWW);
      expect(res.status).toBe(301);
      expect(res.headers.get("location")).toBe(`${WWW}/en-US/shop/checkout/confirmation?session_id=cs_test_1`);
    }
  });

  it("goes straight to the new page from an old address on another host: one hop", async () => {
    const res = await hit("https://mpillow.com/products/linen-case?variant=123&utm_source=ig", WWW);
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(`${WWW}/en-US/shop/natural-white-linen-pillow-case?utm_source=ig`);
  });

  it("leaves the API on custom.mpillow.com, for webhooks", async () => {
    const res = await hit(`${CUSTOM}/api/stripe/webhook`, WWW, { method: "POST" });
    expect(res.headers.get("location")).toBeNull();
  });

  it("keeps a write's method", async () => {
    expect((await hit(`${CUSTOM}/en-US/settings`, WWW, { method: "POST" })).status).toBe(308);
  });

  it("lets browsers re-check within the hour, in case the switch is rolled back", async () => {
    expect((await hit(`${CUSTOM}/en-US`, WWW)).headers.get("cache-control")).toBe("max-age=3600");
    expect((await hit(`${WWW}/pages/contact`, WWW)).headers.get("cache-control")).toBe("max-age=3600");
  });
});

describe("pattern rules", () => {
  const to = (path: string) => {
    const r = shopifyRedirect(path);
    return r && "to" in r ? [r.status, r.to] : r?.status ?? null;
  };

  it("matches trailing slashes and upper case in the same hop", () => {
    expect(to("/Pages/Contact/")).toEqual([301, "/en-US/support"]);
  });

  it("treats a product inside a collection as the product", () => {
    expect(to("/collections/all/products/linen-case")).toEqual([301, "/en-US/shop/natural-white-linen-pillow-case"]);
  });

  it("sends an unknown product or collection to the shop, any other page home (owner, 13 Nov 2026)", () => {
    expect(to("/products/discontinued-thing")).toEqual([301, "/en-US/shop"]);
    expect(to("/collections/sale")).toEqual([301, "/en-US/shop"]);
    expect(to("/pages/old-promo")).toEqual([301, "/en-US"]);
  });

  it("resolves a blog post's consolidation in the same hop, under any blog", () => {
    expect(to("/blogs/news/is-a-memory-foam-pillow-ideal")).toEqual([301, "/en-US/blog/how-to-choose-the-best-pillow-in-singapore"]);
    expect(to("/blogs/mpillow-blogs/why-are-you-yawning-so-much")).toEqual([301, "/en-US"]);
    expect(to("/blogs/mpillow-blogs/tagged/neck-pillow")).toEqual([301, "/en-US/blog"]);
  });

  it("answers 410 for feeds and Shopify's own sitemaps, and nothing for this site's own", () => {
    expect(to("/sitemap_products_1.xml")).toBe(410);
    expect(to("/products/linen-case.json")).toBe(410);
    expect(to("/blogs/mpillow-blogs.atom")).toBe(410);
    expect(to("/sitemap.xml")).toBeNull();
    expect(to("/robots.txt")).toBeNull();
  });

  it("sends a cart, checkout or order-status link to the account with a 302", () => {
    expect(to("/8579743840/orders/abc123/authenticate")).toEqual([302, "/en-US/account"]);
    expect(to("/checkouts/cn/abc")).toEqual([302, "/en-US/account"]);
    expect(to("/account/register")).toEqual([302, "/en-US/account"]);
    expect(to("/cart/add")).toEqual([302, "/en-US/shop/cart"]);
  });

  it("leaves this site's own addresses alone", () => {
    for (const path of ["/", "/en-US/shop", "/en-US/blog/x", "/account", "/account/orders", "/r/review", "/llms.txt"]) {
      expect(shopifyRedirect(path)).toBeNull();
    }
  });
});

describe("every destination exists", () => {
  const pages = new Set(MAP.map((r) => r.to.split("?")[0]));

  it("is a live blog post, not one that redirects again", () => {
    for (const page of pages) {
      const slug = page.match(/^\/en-US\/blog\/(.+)$/)?.[1];
      if (!slug) continue;
      expect([slug, existsSync(`data/blogs/${slug}.mdx`), blogSlugFate(slug)]).toEqual([slug, true, null]);
    }
  });

  it("is a page of this site", () => {
    for (const page of pages) {
      const first = page.match(/^\/en-US\/([^/]+)/)?.[1];
      if (!first || first === "blog" || first === "shop") continue;
      expect([page, existsSync(`app/[lang]/${first}`)]).toEqual([page, true]);
    }
  });
});

describe("addresses Search Console reported after the switch", () => {
  const REPORTED: [old: string, to: string][] = [
    ["/products/basic-mpillow", "/en-US/mp-config"],
    ["/products/cervical-neck-support", "/en-US/shop/cervical-neck-support"],
    ["/products/linen-natural-case", "/en-US/shop/natural-white-linen-pillow-case"],
    ["/products/singapore-batik-covers", "/en-US/shop/deep-blue-batik-cover"],
    ["/products/ultra-hygienic-bolster", "/en-US/mbolster-config"],
  ];
  const handle = (old: string) => old.slice("/products/".length);

  it.each(REPORTED)("%s goes to %s", (old, to) => {
    expect(shopifyRedirect(old)).toEqual({ status: 301, to });
    expect(shopifyRedirect(`/collections/all/products/${handle(old)}`)).toEqual({ status: 301, to });
    expect(shopifyRedirect(`${old.toUpperCase()}/`)).toEqual({ status: 301, to });
    expect(shopifyRedirect(`/Collections/Pillows/Products/${handle(old).toUpperCase()}/`)).toEqual({ status: 301, to });
  });

  it.each([
    ["/products/ultra-hygienic-bolster?variant=42864571515058&country=SG&currency=SGD&utm_source=google", "/en-US/mbolster-config?utm_source=google"],
    ["/products/singapore-batik-covers?pr_prod_strat=copurchase&pr_rec_pid=1&pr_seq=uniform", "/en-US/shop/deep-blue-batik-cover"],
    ["/collections/all/products/basic-mpillow?variant=1&utm_source=gsc&utm_medium=organic", "/en-US/mp-config?utm_source=gsc&utm_medium=organic"],
  ])("drops Shopify's parameters from %s and keeps the campaign's", async (old, to) => {
    const res = await hit(`${WWW}${old}`, WWW);
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(`${WWW}${to}`);
  });

  it("leaves the shop as the landing for what the owner sent there, and for unknown products", () => {
    for (const old of [
      "/products/mpillow-cover-sheet",
      "/products/bolster-case-and-protector",
      "/products/mpillow-vacuum-storage-bag-travel-smart-sleep-better-anywhere",
      "/products/mpillow-gift-voucher",
      "/products/translucent-waterproof-bag",
      "/products/services",
    ]) {
      expect([old, shopifyRedirect(old)]).toEqual([old, { status: 301, to: "/en-US/shop" }]);
    }
  });

  it("adds only addresses the approved map leaves undecided", () => {
    for (const [old] of REPORTED) {
      expect([old, MAP.some((r) => r.old === old)]).toEqual([old, false]);
    }
  });

  it("keeps the moved table in alphabetical order", () => {
    const source = readFileSync("lib/shopify-redirects.ts", "utf8");
    const start = source.indexOf("const MOVED");
    const keys = [...source.slice(start, source.indexOf("};", start)).matchAll(/^ {2}"([^"]+)":/gm)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(80);
    expect(keys).toEqual([...keys].sort());
  });
});
