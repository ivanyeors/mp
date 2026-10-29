// @vitest-environment jsdom
// Deterministic origin before anything imports the email shell.
process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import { describe, expect, it } from "vitest";
import { darkRules, renderEmailShell } from "../base";
import { renderCampaignBlocksEmail, type CampaignBlocksEmailData } from "../campaign-blocks";
import { button, buttonPair, columns, STACK_BELOW, type ButtonOptions } from "../components";
import { LAYOUT, TYPE } from "../theme";
import { EMAIL_BLOCK_SAMPLE_IMAGES, EMAIL_BLOCK_SAMPLES, SAMPLE_CUTOUT_ASSET, SAMPLE_PHOTO_ASSET } from "../__fixtures__/samples";
import { CONTENT_PLACEHOLDERS, emptyBlock, type CampaignContent, type EmailBlock } from "@/lib/email-campaigns/content";
import { CAMPAIGN_PLACEHOLDERS } from "@/lib/email-campaigns/rules";

/**
 * Image + text (PRD-campaign-email-editor slice 06): an image beside a
 * heading, a few lines and a button, in two columns that stack on a phone,
 * the image first whichever side it is on, by width alone, and that classic
 * Outlook keeps side by side in its ghost table. The column primitive under
 * it is the one two buttons side by side already use.
 *
 * Where the columns land is worked out from the shell's own numbers: the card
 * is 600px on a computer, and on a screen 620px wide or less it fills the
 * screen with smaller padding. The owner's inbox matrix (slice 12) checks the
 * real clients.
 */

const ORIGIN = "https://custom.mpillow.com";
const UNSUB = `${ORIGIN}/en-US/unsubscribe?u=0f8fad5b-d9cb-469f-a165-70867728950e&t=abc`;
const SHOP = `${ORIGIN}/en-US/shop?utm_source=email_campaign&utm_medium=email&utm_campaign=december-cooling-launch`;
const one = (...blocks: EmailBlock[]): CampaignContent => ({ v: 1, blocks, fallbacks: {} });
const send = (content: CampaignContent, over: Partial<CampaignBlocksEmailData> = {}) =>
  renderCampaignBlocksEmail({
    subject: "News",
    preheader: null,
    content,
    greeting: false,
    firstName: "Ann",
    values: { first_name: "Ann" },
    buttonHref: (b) => (b.target === "url" ? b.url! : SHOP),
    unsubscribeUrl: UNSUB,
    images: EMAIL_BLOCK_SAMPLE_IMAGES,
    ...over,
  });
const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");
const bytes = (html: string) => new TextEncoder().encode(html).length;

/** The document as classic Outlook reads it: its `[if mso]` copy shown, everything marked `[if !mso]` gone. */
const outlook = (html: string) =>
  parse(html.replace(/<!--\[if !mso\]><!-- -->[\s\S]*?<!--<!\[endif\]-->/g, "").replace(/<!--\[if mso\]>|<!\[endif\]-->/g, ""));

/** A block's row: the element that names it. */
const row = (html: string, id: string) => parse(html).querySelector<HTMLElement>(`[data-block-id="${id}"]`)!;

/** A block's row as the email sends it, byte for byte: from its opening `div` to its own close. */
function sentRow(html: string, id: string): string {
  const at = html.indexOf(`<div data-block-id="${id}">`);
  return html.slice(at, html.indexOf("\n</div>", at) + "\n</div>".length);
}

/** A row's columns, as every reader but classic Outlook lays them out: the inline-block divs in its cell. */
const columnsOf = (rowEl: Element) => [...rowEl.querySelectorAll<HTMLElement>(":scope > table > tbody > tr > td > div")];
const maxWidth = (el: HTMLElement) => Number(/max-width:(\d+)px/.exec(el.getAttribute("style") ?? "")![1]);

// The shell's phone layout, read from its own <style>.
const SHELL_STYLE = parse(renderEmailShell({ bodyHtml: "" })).querySelector("style")!.textContent!;
const PHONE_BELOW = Number(/@media only screen and \(max-width: (\d+)px\)/.exec(SHELL_STYLE)![1]);
const PHONE_PADDING = Number(/\.mp-pad \{ padding: (\d+)px/.exec(SHELL_STYLE)![1]);

/** The card's inner column on a screen `screen` px wide: what a row of columns has to fit in. */
function columnOn(screen: number): number {
  const card = Math.min(LAYOUT.containerWidth, screen - 2 * LAYOUT.outerPadding);
  const padding = screen <= PHONE_BELOW ? PHONE_PADDING : LAYOUT.cardPadding;
  return card - 2 * padding - 2;
}

/** Inline-blocks sit side by side while they fit the line, and stack, in their order, when they don't. */
const sideBySide = (cols: HTMLElement[], screen: number) => cols.reduce((n, c) => n + maxWidth(c), 0) <= columnOn(screen);

describe("the column primitive", () => {
  it("is hybrid: inline-block columns at most stackBelow / n wide, inside an MSO ghost table", () => {
    const html = columns(["<p>A</p>", "<p>B</p>", "<p>C</p>"], { stackBelow: 480 });
    const cols = columnsOf(parse(html).body);
    expect(cols).toHaveLength(3);
    for (const c of cols) {
      expect(c.getAttribute("style")).toBe("display:inline-block;width:100%;max-width:160px;vertical-align:top");
    }
    // The wrapper sets no size of its own for words: font-size:0 only closes the gaps between columns.
    expect(parse(html).querySelector("td")!.getAttribute("style")).toBe("text-align:center;font-size:0");
    const ghost = outlook(html).querySelectorAll("table table td");
    expect([...ghost].map((td) => [td.getAttribute("width"), td.getAttribute("valign"), td.textContent])).toEqual([
      ["33%", "top", "A"],
      ["33%", "top", "B"],
      ["33%", "top", "C"],
    ]);
  });

  it("stacks by width alone: no class, so no media query and no dark rule it could miss", () => {
    const html = columns(["<p>A</p>", "<p>B</p>"], { stackBelow: 480, reverse: true, valign: "middle", gap: 16, textAlign: "left" });
    expect(html).not.toContain("class=");
  });

  it("lays reversed columns out right to left, yet keeps them in order for a phone", () => {
    const html = columns(["<p>First</p>", "<p>Second</p>"], { stackBelow: 480, reverse: true });
    const doc = parse(html);
    expect(doc.querySelector("td")!.getAttribute("dir")).toBe("rtl");
    expect(columnsOf(doc.body).map((c) => [c.getAttribute("dir"), c.textContent])).toEqual([
      ["ltr", "First"],
      ["ltr", "Second"],
    ]);
    const ghost = outlook(html).querySelector("table table")!;
    expect(ghost.getAttribute("dir")).toBe("rtl");
    expect([...ghost.querySelectorAll("td")].map((td) => [td.getAttribute("dir"), td.textContent])).toEqual([
      ["ltr", "First"],
      ["ltr", "Second"],
    ]);
  });

  it("puts the gap half each side of every column, so stacked ones still line up, and aligns their words", () => {
    const html = columns(["<p>A</p>", "<p>B</p>"], { stackBelow: 480, gap: 16, textAlign: "left", valign: "middle" });
    const cols = columnsOf(parse(html).body);
    for (const c of cols) {
      expect(c.style.verticalAlign).toBe("middle");
      expect(c.firstElementChild!.getAttribute("style")).toBe("padding:0 8px;text-align:left");
    }
    expect([...outlook(html).querySelectorAll("table table td")].map((td) => td.getAttribute("valign"))).toEqual(["middle", "middle"]);
  });

  it("is what two buttons side by side are built on, byte for byte (their snapshots are unchanged)", () => {
    const pair: [ButtonOptions, ButtonOptions] = [
      { href: SHOP, label: "Shop the covers" },
      { href: `${ORIGIN}/en-US/faq`, label: "Read the care guide", variant: "secondary" },
    ];
    expect(buttonPair(pair)).toBe(columns(pair.map((b) => button({ ...b, maxWidth: STACK_BELOW / 2 })), { stackBelow: STACK_BELOW }));
  });
});

describe("an image + text block", () => {
  const sample = send(EMAIL_BLOCK_SAMPLES.split);

  it("sits side by side at 600px and stacks at 375px, the image first, whichever side it is on", () => {
    for (const id of ["left", "right"]) {
      const cols = columnsOf(row(sample.html, id));
      expect(cols).toHaveLength(2);
      // The 600px card on a computer, and a screen 600px wide.
      expect(sideBySide(cols, 1280)).toBe(true);
      expect(sideBySide(cols, 600)).toBe(true);
      // A phone: one column, in the row's order, so the image is on top.
      expect(sideBySide(cols, 375)).toBe(false);
      expect(cols[0].querySelector("img")).not.toBeNull();
      expect(cols[1].querySelector("h2")).not.toBeNull();
    }
    // Side by side, the right one reads right to left: its image on the right.
    expect(row(sample.html, "left").querySelector("td")!.hasAttribute("dir")).toBe(false);
    expect(row(sample.html, "right").querySelector("td")!.getAttribute("dir")).toBe("rtl");
  });

  it("holds two columns in classic Outlook, the image on its side", () => {
    const doc = outlook(sample.html);
    for (const [id, dir] of [
      ["left", null],
      ["right", "rtl"],
    ] as const) {
      const ghost = doc.querySelector(`[data-block-id="${id}"] table table`)!;
      expect(ghost.getAttribute("dir")).toBe(dir);
      const cells = [...ghost.querySelectorAll(":scope > tbody > tr > td")];
      expect(cells.map((td) => td.getAttribute("width"))).toEqual(["50%", "50%"]);
      expect(cells[0].querySelector("img")).not.toBeNull();
      expect(cells[1].querySelector("h2")).not.toBeNull();
      // Its button is a button there too.
      if (id === "left") expect(cells[1].innerHTML).toContain("v:roundrect");
    }
  });

  it("shows the image's rendition at its column's width, the cut-out on its light plate", () => {
    const [photo] = row(sample.html, "left").querySelectorAll("img");
    expect(photo.getAttribute("src")).toBe(EMAIL_BLOCK_SAMPLE_IMAGES[SAMPLE_PHOTO_ASSET].url);
    expect([photo.getAttribute("width"), photo.getAttribute("height")]).toEqual(["224", "149"]);
    expect(photo.getAttribute("alt")).toBe("A FibreCool cover on a made bed, in white");
    const cutout = row(sample.html, "right").querySelector("img")!;
    expect(cutout.getAttribute("src")).toBe(EMAIL_BLOCK_SAMPLE_IMAGES[SAMPLE_CUTOUT_ASSET].url);
    expect(cutout.closest(".mp-plate")).not.toBeNull();
    expect(photo.closest(".mp-plate")).toBeNull();
  });

  it("keeps the text side's words at the body size and line height of every text block, stacked too", () => {
    const text = send(one({ id: "t", type: "text", paragraphs: [{ kind: "p", runs: [{ text: "Cool to the touch." }] }] })).html;
    const body = row(text, "t").querySelector("p")!.getAttribute("style");
    const beside = columnsOf(row(sample.html, "left"))[1].querySelector("p")!.getAttribute("style");
    expect(beside).toBe(body);
    expect(beside).toContain(`font-size:${TYPE.body.size}px;line-height:${TYPE.body.lh}px`);
    // Nothing in the shell's <style> resizes words on a phone, so stacking never shrinks them.
    expect(SHELL_STYLE).not.toMatch(/font-size|line-height/);
  });

  it("is a small row: under 3 KB with a photo, a heading and two lines with a link, so six are far from Gmail's clip", () => {
    const goal: EmailBlock = {
      id: "row",
      type: "split",
      image: { asset: SAMPLE_PHOTO_ASSET, alt: "A FibreCool cover on a made bed, in white" },
      side: "right",
      heading: "Why FibreCool",
      paragraphs: [
        { kind: "p", runs: [{ text: "Cool to the touch, all night, in every size we make." }] },
        { kind: "p", runs: [{ text: "Machine washable: read the " }, { text: "care guide", href: `${ORIGIN}/en-US/faq` }, { text: "." }] },
      ],
    };
    expect(bytes(sentRow(send(one(goal)).html, "row"))).toBeLessThan(3 * 1024);
    // A button adds the Outlook-safe one every email uses (its VML and its
    // table, about 1.6 KB): the row around it stays under 3 KB.
    const withButton = { ...goal, button: { label: "Shop the covers", target: "shop", style: "primary" } } as EmailBlock;
    const cta = button({ href: SHOP, label: "Shop the covers", align: "left", maxWidth: STACK_BELOW / 2 - LAYOUT.gutter });
    const sent = sentRow(send(one(withButton)).html, "row");
    expect(sent).toContain(cta);
    expect(bytes(sent) - bytes(cta)).toBeLessThan(3 * 1024);
    // Six rows, each with its button, are a third of the way to the clip, the shell included.
    const six = send(one(...Array.from({ length: 6 }, (_, i) => ({ ...withButton, id: `row-${i}` }))));
    expect(bytes(six.html)).toBeLessThan(102 * 1024 * 0.4);
  });

  it("needs no setting for light and dark: its classes all have dark rules, and its columns have none to need", () => {
    const ruled = new Set(darkRules().flatMap(([sel]) => sel.match(/\.mp-[a-z0-9-]+/g) ?? []).map((c) => c.slice(1)));
    for (const id of ["left", "right"]) {
      const el = row(sample.html, id);
      const classes = [...el.querySelectorAll("[class]")].flatMap((e) => [...e.classList]);
      expect(classes.length).toBeGreaterThan(0);
      expect(classes.filter((c) => !ruled.has(c) && c !== "mp-btn-table")).toEqual([]);
      for (const c of columnsOf(el)) expect(c.hasAttribute("class")).toBe(false);
    }
  });

  it("reads as its words in the plain text: the heading, the lines and the button, never the picture", () => {
    expect(sample.text).toContain(
      [
        "Why FibreCool",
        "",
        "Cool to the touch, all night. Read the care guide.",
        `care guide: ${ORIGIN}/en-US/faq`,
        "",
        `Shop the covers: ${SHOP}`,
        "",
        "Made to your measure",
        "",
        "Hi Ann, your fitting sets its height.",
        "",
        "- Three heights",
        "- Two firmnesses",
      ].join("\n"),
    );
    expect(sample.text).not.toContain("A FibreCool cover on a made bed");
  });

  it("draws every empty part's placeholder in the preview, still in two columns", () => {
    const placeholders = { ...CAMPAIGN_PLACEHOLDERS, ...CONTENT_PLACEHOLDERS };
    const html = send(one(emptyBlock("split", "s")), { placeholders }).html;
    const cols = columnsOf(row(html, "s"));
    expect(cols).toHaveLength(2);
    expect(cols[0].textContent).toContain(CONTENT_PLACEHOLDERS.image);
    expect(cols[1].textContent).toContain(CONTENT_PLACEHOLDERS.heading);
    expect(cols[1].textContent).toContain(CONTENT_PLACEHOLDERS.text);
    expect(cols[1].textContent).toContain(CAMPAIGN_PLACEHOLDERS.buttonLabel);
  });

  it("throws in a send that has no rendition for its image, rather than leave a hole", () => {
    expect(() => send(EMAIL_BLOCK_SAMPLES.split, { images: {} })).toThrow(/No email rendition/);
  });
});
