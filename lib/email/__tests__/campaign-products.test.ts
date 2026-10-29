// @vitest-environment jsdom
// Deterministic origin before anything imports the email shell.
process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import { describe, expect, it } from "vitest";
import { darkRules, forceDarkMode, renderEmailShell } from "../base";
import { productPriceText, renderCampaignBlocksEmail, type CampaignBlockProducts, type CampaignBlocksEmailData } from "../campaign-blocks";
import { money } from "../format";
import { LAYOUT } from "../theme";
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

/**
 * The products block (PRD-campaign-email-editor slice 07): each product as
 * the shop sells it when the email is rendered, its photo, name and price,
 * then a button to its shop page with the campaign's UTMs. One per row, or
 * side by side through slice 06's column primitive, which stacks below 480px
 * by width alone, in Gmail's apps too. The price is never the campaign's:
 * the renderer takes it from `products`, which the sender reads from the shop.
 */

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
    firstName: "Ann",
    values: { first_name: "Ann" },
    // What the sender passes: each button resolved for the recipient, a product to its shop page.
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

/** The document as classic Outlook reads it: its `[if mso]` copy shown, everything marked `[if !mso]` gone. */
const outlook = (html: string) =>
  parse(html.replace(/<!--\[if !mso\]><!-- -->[\s\S]*?<!--<!\[endif\]-->/g, "").replace(/<!--\[if mso\]>|<!\[endif\]-->/g, ""));

// The shell's phone layout, read from its own <style>.
const SHELL_STYLE = parse(renderEmailShell({ bodyHtml: "" })).querySelector("style")!.textContent!;
const PHONE_BELOW = Number(/@media only screen and \(max-width: (\d+)px\)/.exec(SHELL_STYLE)![1]);
const PHONE_PADDING = Number(/\.mp-pad \{ padding: (\d+)px/.exec(SHELL_STYLE)![1]);

/**
 * The card's inner column on a screen `screen` px wide: what a row of columns
 * has to fit in. `mediaQueries` false is Gmail's apps for an account they
 * ignore media queries for: the card keeps its computer padding.
 */
function columnOn(screen: number, mediaQueries = true): number {
  const card = Math.min(LAYOUT.containerWidth, screen - 2 * LAYOUT.outerPadding);
  const padding = mediaQueries && screen <= PHONE_BELOW ? PHONE_PADDING : LAYOUT.cardPadding;
  return card - 2 * padding - 2;
}
const sideBySide = (cols: HTMLElement[], screen: number, mediaQueries = true) =>
  cols.reduce((n, c) => n + maxWidth(c), 0) <= columnOn(screen, mediaQueries);

const href = (slug: string) => `${ORIGIN}/en-US/shop/${slug}?${UTM}`;
/** As the HTML writes it. */
const hrefAttr = (slug: string) => href(slug).replace(/&/g, "&amp;");
/** Money as every email writes it (lib/email/format.ts): `SGD 39.00`, with a no-break space. */
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
    // The photo is a link to the same page, its alt what the link says.
    const photo = cols[0].querySelector("img")!;
    expect(photo.closest("a")!.getAttribute("href")).toBe(href("fibrecool-cover"));
    expect(photo.getAttribute("alt")).toBe("FibreCool Cover");
    // A product with no photo is its words alone.
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
    expect(three.map(maxWidth)).toEqual([160, 160, 160]);
    const two = columnsOf(row(send(one({ id: "two", type: "products", products: [SAMPLE_COVER_PRODUCT, SAMPLE_NECK_PRODUCT], layout: "side_by_side", buttonLabel: "Shop now" })).html, "two"));
    expect(two.map(maxWidth)).toEqual([240, 240]);
    for (const cols of [three, two]) {
      // No class on a column, so no media query decides it, and no dark rule can miss it.
      for (const c of cols) expect(c.hasAttribute("class")).toBe(false);
      expect(sideBySide(cols, 1280)).toBe(true);
      expect(sideBySide(cols, 600)).toBe(true);
      // A phone, with media queries and without (Gmail on Android for a non-Google account): one per row.
      for (const mediaQueries of [true, false]) {
        expect(sideBySide(cols, 375, mediaQueries)).toBe(false);
        expect(sideBySide(cols, 479, mediaQueries)).toBe(false);
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
      // The photo at the column's width: the cut-out's light plate is that wide, its picture inside the padding.
      expect((cols[0].querySelector(".mp-plate") ?? cols[0].querySelector("img"))!.getAttribute("width")).toBe("224");
      expect(cols[1].querySelector("h3")).not.toBeNull();
      expect(cols[1].querySelector("a.mp-btn")!.textContent).toBe("See it in the shop");
      expect(sideBySide(cols, 600)).toBe(true);
      expect(sideBySide(cols, 375, false)).toBe(false);
    }
  });
});

describe("a product's price", () => {
  it("is the shop's: from when its Variants differ, the compare-at struck through only when it is on sale", () => {
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
    // A send of an empty block draws nothing at all.
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
    // Forced dark is the same email with the shell's own rules on.
    expect(forceDarkMode(html)).toContain(".mp-muted");
  });
});
