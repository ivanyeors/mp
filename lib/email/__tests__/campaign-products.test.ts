// @vitest-environment jsdom
process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import { describe, expect, it } from "vitest";
import { darkRules, forceDarkMode } from "../base";
import { productPriceText, renderCampaignBlocksEmail, type CampaignBlockProducts, type CampaignBlocksEmailData } from "../campaign-blocks";
import { money } from "../format";
import { LAYOUT } from "../theme";
import { sideBySide, stacked } from "./column-layout";
import {
  EMAIL_BLOCK_SAMPLE_IMAGES,
  EMAIL_BLOCK_SAMPLE_PRODUCTS,
  EMAIL_BLOCK_SAMPLES,
  SAMPLE_CASE_PRODUCT,
  SAMPLE_COVER_PRODUCT,
  SAMPLE_CUTOUT_ASSET,
  SAMPLE_NECK_PRODUCT,
  SAMPLE_PHOTO_ASSET,
} from "../__fixtures__/samples";
import { CONTENT_PLACEHOLDERS, emptyBlock, type CampaignContent, type EmailBlock } from "@/lib/email-campaigns/content";
import { CAMPAIGN_PLACEHOLDERS } from "@/lib/email-campaigns/rules";
import { blockButtonHref } from "@/lib/email-campaigns/sender";

const ORIGIN = "https://custom.mpillow.com";
const UNSUB = `${ORIGIN}/en-US/unsubscribe?u=0f8fad5b-d9cb-469f-a165-70867728950e&t=abc`;
const UTM = "utm_source=email_campaign&utm_medium=email&utm_campaign=december-cooling-launch";
const one = (...blocks: EmailBlock[]): CampaignContent => ({ v: 1, blocks, fallbacks: {} });
const send = (content: CampaignContent, over: Partial<CampaignBlocksEmailData> = {}) => {
  const products = over.products ?? EMAIL_BLOCK_SAMPLE_PRODUCTS;
  return renderCampaignBlocksEmail({
    subject: "News",
    preheader: null,
    content,
    greeting: false,
    values: { first_name: "Ann", last_name: "Tan", points_balance: "1,250", your_pillow: "Premium Mpillow, size M" },
    buttonHref: (b) => blockButtonHref(b, "December cooling launch", { origin: ORIGIN, locale: "en-US", claimUrl: null, products }),
    unsubscribeUrl: UNSUB,
    images: EMAIL_BLOCK_SAMPLE_IMAGES,
    products,
    ...over,
  });
};
const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");
const row = (html: string, id: string) => parse(html).querySelector<HTMLElement>(`[data-block-id="${id}"]`)!;
const columnsOf = (rowEl: Element) => [...rowEl.querySelectorAll<HTMLElement>(":scope > table > tbody > tr > td > div")];
const maxWidth = (el: HTMLElement) => Number(/max-width:(\d+)px/.exec(el.getAttribute("style") ?? "")![1]);

const outlook = (html: string) =>
  parse(html.replace(/<!--\[if !mso\]><!-- -->[\s\S]*?<!--<!\[endif\]-->/g, "").replace(/<!--\[if mso\]>|<!\[endif\]-->/g, ""));

const href = (slug: string) => `${ORIGIN}/en-US/shop/${slug}?${UTM}`;
const hrefAttr = (slug: string) => href(slug).replace(/&/g, "&amp;");
const sgd = (n: number) => money(n, "SGD");

describe("a products block, side by side", () => {
  const sample = send(EMAIL_BLOCK_SAMPLES.products);
  const grid = row(sample.html, "grid");

  it("shows each product's photo, name and price, then its button, each to its shop page with the campaign's UTMs", () => {
    const cols = columnsOf(grid);
    expect(cols.map((c) => c.querySelector("h3")!.textContent)).toEqual(["FibreCool Cover", "Cervical Neck Support", "Camel Bolster Case"]);
    expect(cols.map((c) => c.querySelector("p")!.textContent)).toEqual([`from ${sgd(39)}`, `${sgd(59)}\u00a0 ${sgd(45)}`, sgd(29.5)]);
    const slugs = ["fibrecool-cover", "cervical-neck-support", "camel-bolster-case"];
    cols.forEach((c, i) => {
      expect(c.querySelector<HTMLAnchorElement>("a.mp-btn")!.getAttribute("href")).toBe(href(slugs[i]));
      expect(c.querySelector("a.mp-btn")!.textContent).toBe("Shop now");
    });
    const photo = cols[0].querySelector("img")!;
    expect(photo.closest("a")!.getAttribute("href")).toBe(href("fibrecool-cover"));
    expect(photo.getAttribute("alt")).toBe("FibreCool Cover");
    expect(cols[2].querySelector("img")).toBeNull();
  });

  it("carries utm_source=email_campaign, utm_medium=email and utm_campaign=<name> on every product link", () => {
    const links = [...parse(sample.html).querySelectorAll<HTMLAnchorElement>('a[href*="/shop/"]')].map((a) => new URL(a.href));
    expect(links.length).toBeGreaterThanOrEqual(6);
    for (const u of links) {
      expect([u.searchParams.get("utm_source"), u.searchParams.get("utm_medium"), u.searchParams.get("utm_campaign")]).toEqual([
        "email_campaign",
        "email",
        "december-cooling-launch",
      ]);
    }
  });

  it("is three 160px columns, or two of 240px, that stack below 480px by width alone, Gmail's apps included", () => {
    const three = columnsOf(grid);
    expect(three.map((c) => /min-width:(\d+)px/.exec(c.getAttribute("style")!)![1])).toEqual(["160", "160", "160"]);
    const two = columnsOf(row(send(one({ id: "two", type: "products", products: [SAMPLE_COVER_PRODUCT, SAMPLE_NECK_PRODUCT], layout: "side_by_side", buttonLabel: "Shop now" })).html, "two"));
    expect(two.map(maxWidth)).toEqual([240, 240]);
    for (const cols of [three, two]) {
      for (const c of cols) expect(c.hasAttribute("class")).toBe(false);
      expect(sideBySide(cols, 1280)).toBe(true);
      expect(sideBySide(cols, 600)).toBe(true);
      for (const mediaQueries of [true, false]) {
        for (const screen of [320, 375, 390, 412, 430, 479]) expect(stacked(cols, screen, mediaQueries), `${cols.length} at ${screen}px`).toBe(true);
      }
    }
  });

  it("holds its columns in classic Outlook, each card whole in its own cell", () => {
    const ghost = outlook(sample.html).querySelector('[data-block-id="grid"] table table')!;
    const cells = [...ghost.querySelectorAll(":scope > tbody > tr > td")];
    expect(cells.map((td) => [td.getAttribute("width"), td.getAttribute("valign")])).toEqual([
      ["33%", "top"],
      ["33%", "top"],
      ["33%", "top"],
    ]);
    for (const td of cells) expect(td.innerHTML).toContain("v:roundrect");
  });

  it("shows each photo's rendition at its column's width, a cut-out on the light plate", () => {
    const [photo, cutout] = grid.querySelectorAll("img");
    expect(photo.getAttribute("src")).toBe(EMAIL_BLOCK_SAMPLE_IMAGES[SAMPLE_PHOTO_ASSET].url);
    expect(photo.getAttribute("width")).toBe(String(160 - LAYOUT.gutter));
    expect(photo.closest(".mp-plate")).toBeNull();
    expect(cutout.getAttribute("src")).toBe(EMAIL_BLOCK_SAMPLE_IMAGES[SAMPLE_CUTOUT_ASSET].url);
    expect(cutout.closest(".mp-plate")).not.toBeNull();
  });
});

describe("a products block, one per row", () => {
  const rows = row(send(EMAIL_BLOCK_SAMPLES.products).html, "rows");

  it("puts each photo beside its name, price and button, as an image + text does, and stacks on a phone", () => {
    const products = [...rows.querySelectorAll<HTMLElement>(":scope > table")];
    expect(products).toHaveLength(2);
    for (const p of products) {
      const cols = [...p.querySelectorAll<HTMLElement>(":scope > tbody > tr > td > div")];
      expect(cols.map(maxWidth)).toEqual([240, 240]);
      expect((cols[0].querySelector(".mp-plate") ?? cols[0].querySelector("img"))!.getAttribute("width")).toBe("224");
      expect(cols[1].querySelector("h3")).not.toBeNull();
      expect(cols[1].querySelector("a.mp-btn")!.textContent).toBe("See it in the shop");
      expect(sideBySide(cols, 600)).toBe(true);
      expect(stacked(cols, 375, false)).toBe(true);
    }
  });
});

describe("a product's price", () => {
  it("is the shop's: from with several active Variants, the compare-at struck through only when it is on sale", () => {
    expect(productPriceText({ price: 39, compareAt: null, from: true, currency: "SGD" })).toBe(`from ${sgd(39)}`);
    expect(productPriceText({ price: 45, compareAt: 59, from: false, currency: "SGD" })).toBe(`${sgd(45)} (was ${sgd(59)})`);
    expect(productPriceText({ price: 29.5, compareAt: null, from: false, currency: "SGD" })).toBe(sgd(29.5));
    expect(sgd(29.5).replace(/\s/g, " ")).toBe("SGD 29.50");
    const neck = [...row(send(EMAIL_BLOCK_SAMPLES.products).html, "grid").querySelectorAll("p")][1];
    const was = neck.querySelector("span")!;
    expect(was.textContent).toBe(sgd(59));
    expect(was.style.textDecoration).toBe("line-through");
    expect(neck.querySelector("strong")!.textContent).toBe(sgd(45));
  });

  it("follows the shop: a new price in `products` is the next render's, and the content holds none", () => {
    const content = one({ id: "p", type: "products", products: [SAMPLE_COVER_PRODUCT], layout: "side_by_side", buttonLabel: "Shop now" });
    const before = JSON.stringify(content);
    const repriced: CampaignBlockProducts = { [SAMPLE_COVER_PRODUCT]: { ...EMAIL_BLOCK_SAMPLE_PRODUCTS[SAMPLE_COVER_PRODUCT], price: 42, from: false } };
    expect(send(content).text).toContain(`from ${sgd(39)}`);
    const after = send(content, { products: repriced });
    expect(after.text).toContain(sgd(42));
    expect(after.text).not.toContain("39.00");
    expect(JSON.stringify(content)).toBe(before);
    expect(before).not.toMatch(/39|price/);
  });
});

describe("the plain-text part", () => {
  it("reads each product as its name, price and link", () => {
    const { text } = send(one({ id: "p", type: "products", products: [SAMPLE_NECK_PRODUCT, SAMPLE_CASE_PRODUCT], layout: "rows", buttonLabel: "Shop now" }));
    expect(text).toContain(
      [
        "Cervical Neck Support",
        `${sgd(45)} (was ${sgd(59)})`,
        `Shop now: ${href("cervical-neck-support")}`,
        "",
        "Camel Bolster Case",
        sgd(29.5),
        `Shop now: ${href("camel-bolster-case")}`,
        "",
      ].join("\n"),
    );
  });
});

describe("a product the shop does not sell now", () => {
  const content = one({ id: "p", type: "products", products: [SAMPLE_COVER_PRODUCT, SAMPLE_NECK_PRODUCT], layout: "side_by_side", buttonLabel: "Shop now" });
  const listedOnly: CampaignBlockProducts = { [SAMPLE_COVER_PRODUCT]: EMAIL_BLOCK_SAMPLE_PRODUCTS[SAMPLE_COVER_PRODUCT] };

  it("is never sent as a dead link: a send without it throws", () => {
    expect(() => send(content, { products: listedOnly })).toThrow(/Product 7c2a4e6b-1d3f-4b8a-9e2c-6f4d5a3b2c1e is not in the shop/);
  });

  it("is a hint in the preview, and so is an empty block", () => {
    const placeholders = { ...CAMPAIGN_PLACEHOLDERS, ...CONTENT_PLACEHOLDERS };
    const preview = send(content, { products: listedOnly, placeholders });
    expect(preview.html).toContain(CONTENT_PLACEHOLDERS.productUnavailable);
    expect(preview.html).toContain(hrefAttr("fibrecool-cover"));
    expect(send(one(emptyBlock("products", "p")), { placeholders }).html).toContain(CONTENT_PLACEHOLDERS.products);
    expect(row(send(one(emptyBlock("products", "p"))).html, "p")).toBeNull();
  });

  it("leaves a product button out rather than link nowhere", () => {
    const button = one({ id: "b", type: "buttons", buttons: [{ label: "Shop the neck support", target: "product", product: SAMPLE_NECK_PRODUCT, style: "primary" }] });
    expect(send(button).html).toContain(hrefAttr("cervical-neck-support"));
    expect(send(button, { products: listedOnly }).html).not.toContain("Shop the neck support");
  });
});

describe("light and dark", () => {
  it("draws the name, price and button only in classes the shell's dark list covers", () => {
    const { html } = send(EMAIL_BLOCK_SAMPLES.products);
    const ruled = new Set(darkRules().flatMap(([selector]) => selector.split(",").map((s) => s.trim().replace(/^\./, ""))));
    const classes = new Set([...row(html, "grid").querySelectorAll("[class]")].flatMap((el) => [...el.classList]));
    for (const c of ["mp-fg", "mp-muted", "mp-plate", "mp-btn-cell", "mp-btn"]) expect(classes).toContain(c);
    for (const c of classes) if (c !== "mp-btn-table") expect(ruled, c).toContain(c);
    expect(forceDarkMode(html)).toContain(".mp-muted");
  });
});
