// @vitest-environment jsdom
process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import { describe, expect, it } from "vitest";
import { forceDarkMode } from "../base";
import { renderCampaignBlocksEmail, type CampaignBlockImages, type CampaignBlocksEmailData } from "../campaign-blocks";
import { escapeHtml } from "../html";
import { LIGHT } from "../theme";
import { EMAIL_BLOCK_SAMPLE_IMAGES, EMAIL_BLOCK_SAMPLES, SAMPLE_CUTOUT_ASSET, SAMPLE_PHOTO_ASSET } from "../__fixtures__/samples";
import { CONTENT_PLACEHOLDERS, emptyBlock, type CampaignContent, type EmailBlock } from "@/lib/email-campaigns/content";
import { renderCampaignPreview } from "@/lib/email-campaigns/sender";
import { EMPTY_CAMPAIGN_DRAFT } from "@/lib/email-campaigns/rules";

const ORIGIN = "https://custom.mpillow.com";
const UNSUB = `${ORIGIN}/en-US/unsubscribe?u=0f8fad5b-d9cb-469f-a165-70867728950e&t=abc`;
const one = (...blocks: EmailBlock[]): CampaignContent => ({ v: 1, blocks, fallbacks: {} });
const send = (content: CampaignContent, images: CampaignBlockImages = EMAIL_BLOCK_SAMPLE_IMAGES, over: Partial<CampaignBlocksEmailData> = {}) =>
  renderCampaignBlocksEmail({
    subject: "News",
    preheader: null,
    content,
    greeting: false,
    values: { first_name: "Ann", last_name: "Tan", points_balance: "1,250", your_pillow: "Premium Mpillow, size M" },
    buttonHref: (b) => (b.target === "url" ? b.url! : `${ORIGIN}/en-US/${b.target}`),
    unsubscribeUrl: UNSUB,
    images,
    ...over,
  });
const doc = (html: string) => new DOMParser().parseFromString(html, "text/html");
const imgs = (html: string) => [...doc(html).querySelectorAll<HTMLImageElement>(".mp-card img")];

describe("an image block", () => {
  it("is sent as its JPEG or PNG rendition, at most 1,200px, with width and height", () => {
    const html = send(EMAIL_BLOCK_SAMPLES.image).html;
    const shown = imgs(html);
    expect(shown.map((i) => i.getAttribute("src"))).toEqual([
      EMAIL_BLOCK_SAMPLE_IMAGES[SAMPLE_PHOTO_ASSET].url,
      EMAIL_BLOCK_SAMPLE_IMAGES[SAMPLE_CUTOUT_ASSET].url,
      EMAIL_BLOCK_SAMPLE_IMAGES[SAMPLE_PHOTO_ASSET].url,
    ]);
    for (const img of shown) {
      expect(img.getAttribute("src")).toMatch(/^https:\/\/.+\.(jpg|png)$/);
      expect(Number(img.getAttribute("width"))).toBeLessThanOrEqual(1200);
      expect(Number(img.getAttribute("height"))).toBeGreaterThan(0);
      expect(img.getAttribute("style")).toContain("display:block;max-width:100%;height:auto");
    }
    expect(shown.map((i) => [i.width, i.height])).toEqual([
      [542, 361],
      [408, 272],
      [440, 293],
    ]);
    expect(html).not.toContain(".webp");
  });

  it("says what it shows, or nothing with role=presentation when decorative, and links where it was told", () => {
    const [photo, cutout, flourish] = imgs(send(EMAIL_BLOCK_SAMPLES.image).html);
    expect(photo.getAttribute("alt")).toBe("A FibreCool cover on a made bed, in white");
    expect(photo.closest("a")?.getAttribute("href")).toBe(`${ORIGIN}/en-US/shop`);
    expect(cutout.closest("a")).toBeNull();
    expect(flourish.getAttribute("alt")).toBe("");
    expect(flourish.getAttribute("role")).toBe("presentation");
    expect(send(EMAIL_BLOCK_SAMPLES.image).text).toContain(`A FibreCool cover on a made bed, in white: ${ORIGIN}/en-US/shop`);
  });

  it("puts a transparent PNG on the light plate, which keeps its light fill in dark, and a photo on none", () => {
    const html = send(EMAIL_BLOCK_SAMPLES.image).html;
    const [photo, cutout] = imgs(html);
    expect(photo.closest(".mp-plate")).toBeNull();
    const plate = cutout.closest(".mp-plate")!;
    expect(plate.getAttribute("bgcolor")).toBe(LIGHT.card);
    const rule = `.mp-plate { background: ${LIGHT.card} !important; }`;
    const media = /@media \(prefers-color-scheme: dark\) \{([\s\S]*?)\n {4}\}/.exec(html)![1];
    expect(media).toContain(rule);
    expect(html).toContain(`[data-ogsc] ${rule}`);
    expect(forceDarkMode(html)).toContain(rule);
  });

  it("throws in a send without its rendition, rather than leave a hole; the preview draws a hint", () => {
    expect(() => send(EMAIL_BLOCK_SAMPLES.image, {})).toThrow(/No email rendition for image/);
    const preview = renderCampaignPreview({ ...EMPTY_CAMPAIGN_DRAFT, subject: "News", content: EMAIL_BLOCK_SAMPLES.image }, { origin: ORIGIN, firstName: "Ann" });
    expect(preview.html).toContain(escapeHtml(CONTENT_PLACEHOLDERS.imageUnavailable));
    const empty = one(emptyBlock("image", "i"));
    expect(renderCampaignPreview({ ...EMPTY_CAMPAIGN_DRAFT, subject: "News", content: empty }, { origin: ORIGIN, firstName: "Ann" }).html).toContain(CONTENT_PLACEHOLDERS.image);
    expect(imgs(send(empty).html)).toEqual([]);
  });
});

describe("a hero", () => {
  it("is the image, then its heading, line and button as real text and a real link below it", () => {
    const html = send(EMAIL_BLOCK_SAMPLES.hero).html;
    const hero = doc(html).querySelector('[data-block-id="hero"]')!;
    const parts = [...hero.querySelectorAll("img, h1, h2, p, a.mp-btn")].map((el) => el.tagName.toLowerCase() + (el.textContent?.trim() ? `: ${el.textContent.trim()}` : ""));
    expect(parts).toEqual(["img", "h1: Sleep cooler this December", "p: Our FibreCool covers are back, in every size.", "a: Shop the covers"]);
    const row = hero.querySelector("img")!.closest("td")!;
    expect(row.textContent?.trim()).toBe("");
    expect(hero.querySelector("a.mp-btn")!.getAttribute("href")).toBe(`${ORIGIN}/en-US/shop`);
    expect(hero.innerHTML).toContain(`<!--[if mso]>\n<v:roundrect`);
    expect(send(EMAIL_BLOCK_SAMPLES.hero).text).toContain("Sleep cooler this December\n\nOur FibreCool covers are back, in every size.\n\nShop the covers: https://custom.mpillow.com/en-US/shop");
  });

  it("is the email's title when it opens it, and a part's heading further down", () => {
    const d = doc(send(EMAIL_BLOCK_SAMPLES.hero).html);
    expect(d.querySelector('[data-block-id="hero"] h1')?.textContent).toBe("Sleep cooler this December");
    expect(d.querySelector('[data-block-id="second"] h2')?.textContent).toBe("Made to your measure");
    const greeted = send(EMAIL_BLOCK_SAMPLES.hero, EMAIL_BLOCK_SAMPLE_IMAGES, { greeting: true });
    expect(greeted.text.indexOf("Hi Ann,")).toBeGreaterThan(greeted.text.indexOf("Shop the covers"));
    expect(greeted.text.indexOf("Hi Ann,")).toBeLessThan(greeted.text.indexOf("Cool to the touch"));
  });

  it("leaves out a part it doesn't have, and the preview shows an empty one's placeholder", () => {
    const bare = one({ id: "h", type: "hero", image: { asset: SAMPLE_PHOTO_ASSET, alt: "A bed" } });
    const html = send(bare).html;
    expect(doc(html).querySelector('[data-block-id="h"]')!.querySelectorAll("h1, h2, p, a")).toHaveLength(0);
    const empty = one(emptyBlock("hero", "h"));
    const preview = renderCampaignPreview({ ...EMPTY_CAMPAIGN_DRAFT, subject: "News", content: empty }, { origin: ORIGIN, firstName: "Ann" }).html;
    for (const hint of [CONTENT_PLACEHOLDERS.image, CONTENT_PLACEHOLDERS.heading, CONTENT_PLACEHOLDERS.line]) expect(preview).toContain(escapeHtml(hint));
  });
});

describe("data-block-id", () => {
  it("names every block's outer element, in a send as in the preview, so a click in the preview finds its card", () => {
    const content: CampaignContent = {
      v: 1,
      blocks: (["hero", "image", "buttons", "text", "divider"] as const).flatMap((t) => EMAIL_BLOCK_SAMPLES[t].blocks.map((b) => ({ ...b, id: `${t}-${b.id}` }))),
      fallbacks: {},
    };
    const d = doc(send(content).html);
    const named = [...d.querySelectorAll(".mp-card [data-block-id]")];
    expect(named.map((el) => el.getAttribute("data-block-id"))).toEqual(content.blocks.map((b) => b.id));
    for (const el of named) expect(el.parentElement?.classList.contains("mp-card")).toBe(true);
    expect(d.querySelector('[data-block-id="buttons-pair"] .mp-btn-secondary')).not.toBeNull();
  });
});
