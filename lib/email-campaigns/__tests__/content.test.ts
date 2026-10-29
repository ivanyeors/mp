import { describe, expect, it } from "vitest";
import {
  BLOCK_BUTTON_TARGETS,
  CampaignContentPreviewSchema,
  CampaignContentSchema,
  CONTENT_LIMITS,
  CONTENT_PLACEHOLDERS,
  contentFromLegacy,
  contentSignsIn,
  contentWords,
  EMAIL_BLOCK_TYPES,
  emptyBlock,
  EMPTY_CAMPAIGN_CONTENT,
  fillVariables,
  newBlockId,
  SITE_BUTTON_PATHS,
  variablesUsed,
  type CampaignContent,
  type EmailBlock,
} from "../content";
import { FIRST_CAMPAIGN_DRAFT } from "../rules";
import {
  CAMPAIGN_VARIABLES,
  fallbackWords,
  SAMPLE_RECIPIENT,
  unknownVariablesIn,
  VARIABLE_KEYS,
  variableFallback,
  variableValue,
  variableValues,
  withSampleValues,
} from "../variables";

/**
 * The content model (PRD-campaign-email-editor slice 03): one schema for the
 * editor, the database and Claude's output, with the limits in code, and
 * nothing in it that could become markup.
 */

const CONTENT: CampaignContent = {
  v: 1,
  blocks: [
    { id: "title", type: "heading", level: 1, text: "Sleep cooler this December" },
    {
      id: "intro",
      type: "text",
      paragraphs: [
        { kind: "p", runs: [{ text: "Hi " }, { var: "first_name" }, { text: ", our " }, { text: "FibreCool", bold: true }, { text: " covers. " }, { text: "Care", href: "https://custom.mpillow.com/en-US/faq", italic: true }] },
        { kind: "bullets", items: [[{ text: "Cool" }], [{ text: "Washable" }]] },
      ],
    },
    {
      id: "buttons",
      type: "buttons",
      buttons: [
        { label: "Shop the covers", target: "shop", style: "primary" },
        { label: "Our story", target: "url", url: "https://custom.mpillow.com/en-US/our-story", style: "secondary" },
      ],
    },
    {
      id: "photo",
      type: "image",
      image: { asset: "6f1c2b9e-3d4a-4e8b-9c1d-2a3b4c5d6e7f", alt: "A FibreCool cover on a bed" },
      link: { target: "url", url: "https://custom.mpillow.com/en-US/shop" },
      width: "inset",
    },
    {
      id: "hero",
      type: "hero",
      image: { asset: "8a2d3c4b-5e6f-4a7b-8c9d-0e1f2a3b4c5d", alt: "", decorative: true },
      heading: "Made to measure",
      line: "In every size.",
      button: { label: "Book a fitting", target: "book_fitting", style: "secondary" },
    },
    {
      id: "beside",
      type: "split",
      image: { asset: "6f1c2b9e-3d4a-4e8b-9c1d-2a3b4c5d6e7f", alt: "A cover, folded" },
      side: "right",
      heading: "Why FibreCool",
      paragraphs: [{ kind: "p", runs: [{ text: "Cool all night." }] }],
    },
    { id: "shop", type: "products", products: ["3b7e1f2a-9c4d-4a6b-8e1f-5d2c3b4a6e7f"], layout: "rows", buttonLabel: "Shop now" },
    { id: "line", type: "divider" },
    { id: "room", type: "spacer", size: "l" },
  ],
  fallbacks: { first_name: "there" },
};

/** The content with one block replaced by `b` (anything, as a crafted payload would be). */
const withBlock = (b: unknown) => ({ ...CONTENT, blocks: [b] });
const refused = (c: unknown) => CampaignContentSchema.safeParse(c).success === false && CampaignContentPreviewSchema.safeParse(c).success === false;

describe("CampaignContentSchema", () => {
  it("takes every v1 block type, as it is", () => {
    expect(CampaignContentSchema.parse(CONTENT)).toEqual(CONTENT);
    expect(new Set(CONTENT.blocks.map((b) => b.type))).toEqual(new Set(EMAIL_BLOCK_TYPES));
  });

  it("refuses markup: a tag in any words, whoever typed it", () => {
    const run = (text: string) => withBlock({ id: "t", type: "text", paragraphs: [{ kind: "p", runs: [{ text }] }] });
    expect(refused(run("<script>alert(1)</script>"))).toBe(true);
    expect(refused(run("<img src=x onerror=alert(1)>"))).toBe(true);
    expect(refused(withBlock({ id: "h", type: "heading", level: 1, text: "<b>Sale</b>" }))).toBe(true);
    expect(refused(withBlock({ id: "b", type: "buttons", buttons: [{ label: "<i>Go</i>", target: "shop", style: "primary" }] }))).toBe(true);
    expect(refused({ ...CONTENT, fallbacks: { first_name: "<script>" } })).toBe(true);
    // Words that only look like a comparison are words.
    expect(CampaignContentSchema.safeParse(run(`I <3 "pillows" & 2 < 3 > 1`)).success).toBe(true);
  });

  it("refuses a link that is not https: javascript:, data:, http and relative ones", () => {
    for (const href of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,x", "http://custom.mpillow.com", "/shop", "https://a b.com"]) {
      expect(refused(withBlock({ id: "t", type: "text", paragraphs: [{ kind: "p", runs: [{ text: "x", href }] }] })), href).toBe(true);
      expect(refused(withBlock({ id: "b", type: "buttons", buttons: [{ label: "Go", target: "url", url: href, style: "primary" }] })), href).toBe(true);
    }
  });

  it("refuses an unknown block type, an unknown field and an unknown Variable", () => {
    expect(refused(withBlock({ id: "x", type: "html", html: "<script>alert(1)</script>" }))).toBe(true);
    expect(refused(withBlock({ id: "x", type: "divider", html: "<hr>" }))).toBe(true);
    expect(refused(withBlock({ id: "x", type: "heading", level: 1, text: "Hi", style: "color:red" }))).toBe(true);
    expect(refused(withBlock({ id: "t", type: "text", paragraphs: [{ kind: "p", runs: [{ text: "x", color: "red" }] }] }))).toBe(true);
    expect(refused(withBlock({ id: "t", type: "text", paragraphs: [{ kind: "p", runs: [{ var: "favourite_colour" }] }] }))).toBe(true);
    expect(refused({ ...CONTENT, fallbacks: { favourite_colour: "blue" } })).toBe(true);
    expect(refused({ ...CONTENT, extra: true })).toBe(true);
    expect(refused({ ...CONTENT, v: 2 })).toBe(true);
  });

  it("holds the limits in code: 40 blocks, 120-character headings, two buttons, unique ids, the size", () => {
    const many = Array.from({ length: CONTENT_LIMITS.blocks + 1 }, (_, i) => ({ id: `d${i}`, type: "divider" }));
    expect(refused({ ...CONTENT, blocks: many })).toBe(true);
    expect(CampaignContentSchema.safeParse({ ...CONTENT, blocks: many.slice(0, CONTENT_LIMITS.blocks) }).success).toBe(true);
    expect(refused(withBlock({ id: "h", type: "heading", level: 1, text: "x".repeat(121) }))).toBe(true);
    expect(refused(withBlock({ id: "h", type: "heading", level: 3, text: "Hi" }))).toBe(true);
    const button = { label: "Go", target: "shop", style: "primary" };
    expect(refused(withBlock({ id: "b", type: "buttons", buttons: [button, button, button] }))).toBe(true);
    expect(refused(withBlock({ id: "b", type: "buttons", buttons: [{ ...button, label: "x".repeat(41) }] }))).toBe(true);
    expect(refused(withBlock({ id: "b", type: "buttons", buttons: [{ ...button, url: "https://custom.mpillow.com" }] }))).toBe(true);
    expect(refused({ ...CONTENT, blocks: [CONTENT.blocks[5], CONTENT.blocks[5]] })).toBe(true);
    expect(refused(withBlock({ id: "has space", type: "divider" }))).toBe(true);
    const long = "x".repeat(CONTENT_LIMITS.text);
    const big = Array.from({ length: 21 }, (_, i) => ({ id: `t${i}`, type: "text", paragraphs: [{ kind: "p", runs: [{ text: long }] }] }));
    expect(CampaignContentSchema.safeParse({ ...CONTENT, blocks: big }).error?.issues.map((i) => i.message)).toEqual(["The email is too long: make it shorter."]);
  });

  it("asks for every word on save, and previews a block with its fields empty", () => {
    for (const type of EMAIL_BLOCK_TYPES) {
      const b = emptyBlock(type);
      expect(CampaignContentPreviewSchema.safeParse(withBlock(b)).success, type).toBe(true);
    }
    const r = CampaignContentSchema.safeParse({ ...CONTENT, blocks: [emptyBlock("heading", "h"), emptyBlock("text", "t"), emptyBlock("buttons", "b")] });
    expect(r.error?.issues.map((i) => [i.path.join("."), i.message])).toEqual([
      ["blocks.0.text", "Write the heading."],
      ["blocks.1.paragraphs", "Write the text."],
      ["blocks.2.buttons.0.label", "Give the button a label."],
    ]);
    expect(CampaignContentSchema.safeParse(EMPTY_CAMPAIGN_CONTENT).error?.issues.map((i) => i.message)).toEqual(["Add a block to the email."]);
    expect(CampaignContentPreviewSchema.parse(EMPTY_CAMPAIGN_CONTENT)).toEqual(EMPTY_CAMPAIGN_CONTENT);
  });

  it("refuses on save a {name} that would reach the customer in braces: an unknown one in a heading or a text block, any in a button", () => {
    const text = (t: string) => withBlock({ id: "t", type: "text", paragraphs: [{ kind: "p", runs: [{ text: "Hi " }, { var: "first_name" }, { text: t }] }] });
    const issues = (c: unknown) => CampaignContentSchema.safeParse(c).error?.issues.map((i) => [i.path.join("."), i.message]);
    const unknown = (name: string) => `{${name}} is not a Variable: the Variables are {first_name}, {last_name} and {points_balance}.`;
    expect(issues(text(", our {frist_name} covers"))).toEqual([["blocks.0.paragraphs", unknown("frist_name")]]);
    // A heading takes Variables (slice 13), written as the subject writes them.
    expect(issues(withBlock({ id: "h", type: "heading", level: 1, text: "{first_name}, sleep cooler" }))).toBeUndefined();
    expect(issues(withBlock({ id: "h", type: "heading", level: 1, text: "{points_balance} points, {last_name}" }))).toBeUndefined();
    expect(issues(withBlock({ id: "h", type: "heading", level: 2, text: "Hi {firstname}" }))).toEqual([["blocks.0.text", unknown("firstname")]]);
    expect(issues(withBlock({ id: "h", type: "heading", level: 2, text: "Hi {a} and {b}" }))).toEqual([
      ["blocks.0.text", "{a} and {b} are not Variables: the Variables are {first_name}, {last_name} and {points_balance}."],
    ]);
    expect(issues(withBlock({ id: "b", type: "buttons", buttons: [{ label: "Shop, {first_name}", target: "shop", style: "primary" }] }))).toEqual([
      ["blocks.0.buttons.0.label", "{first_name} can go in a heading, a text block, the subject or the preview line, not here."],
    ]);
    // Braces around anything but a name are words.
    expect(CampaignContentSchema.safeParse(text(", {50% off} today")).success).toBe(true);
    // The preview still draws it, and a row saved before still opens.
    expect(CampaignContentPreviewSchema.safeParse(text(", our {frist_name} covers")).success).toBe(true);
    expect(CampaignContentPreviewSchema.safeParse(withBlock({ id: "h", type: "heading", level: 1, text: "{first_name}" })).success).toBe(true);
  });

  it("counts a text block that is only a Variable as written", () => {
    expect(CampaignContentSchema.safeParse(withBlock({ id: "t", type: "text", paragraphs: [{ kind: "p", runs: [{ var: "first_name" }] }] })).success).toBe(true);
    expect(CampaignContentSchema.safeParse(withBlock({ id: "t", type: "text", paragraphs: [{ kind: "p", runs: [{ text: "  " }] }] })).success).toBe(false);
  });
});

describe("new blocks", () => {
  it("start empty, on their placeholders, never with sample words", () => {
    expect(emptyBlock("heading", "a")).toEqual({ id: "a", type: "heading", level: 2, text: "" });
    expect(emptyBlock("text", "a")).toEqual({ id: "a", type: "text", paragraphs: [] });
    expect(emptyBlock("buttons", "a")).toEqual({ id: "a", type: "buttons", buttons: [{ label: "", target: "shop", style: "primary" }] });
    expect(emptyBlock("spacer", "a")).toEqual({ id: "a", type: "spacer", size: "m" });
    for (const hint of Object.values(CONTENT_PLACEHOLDERS)) expect(hint).not.toBe("");
  });

  it("get a stable id of their own", () => {
    const ids = new Set(Array.from({ length: 200 }, newBlockId));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]{12}$/);
  });
});

describe("reading the blocks", () => {
  it("reads every word a customer reads, for the points rule", () => {
    expect(contentWords(CONTENT)).toEqual([
      "Sleep cooler this December",
      "Hi {first_name}, our FibreCool covers. CareCoolWashable",
      "Shop the covers",
      "Our story",
      "A FibreCool cover on a bed",
      "Made to measure",
      "In every size.",
      "Book a fitting",
      "A cover, folded",
      "Why FibreCool",
      "Cool all night.",
      // A product's name and price are the shop's: only the block's own label is the campaign's.
      "Shop now",
    ]);
  });

  it("knows which Variables the blocks use, and whether a button signs in", () => {
    expect(variablesUsed(CONTENT)).toEqual(["first_name"]);
    expect(variablesUsed(EMPTY_CAMPAIGN_CONTENT)).toEqual([]);
    // The subject and preview line fill theirs from the same fallbacks.
    expect(variablesUsed(EMPTY_CAMPAIGN_CONTENT, ["{first_name}, sleep cooler this December", ""])).toEqual(["first_name"]);
    expect(variablesUsed(CONTENT, ["{first_name}, {last_name}"])).toEqual(["first_name", "last_name"]);
    expect(variablesUsed(EMPTY_CAMPAIGN_CONTENT, ["{last_name}", "{nickname}"])).toEqual(["last_name"]);
    // In every block's words alike: a heading's, a text block's.
    const heading = { ...EMPTY_CAMPAIGN_CONTENT, blocks: [{ id: "h", type: "heading" as const, level: 1 as const, text: "{points_balance} points" }] };
    expect(variablesUsed(heading, ["{first_name}"])).toEqual(["first_name", "points_balance"]);
    expect(contentSignsIn(CONTENT)).toBe(false);
    const signIn = { ...CONTENT, blocks: [{ id: "b", type: "buttons", buttons: [{ label: "Sign in", target: "sign_in", style: "primary" }] } as EmailBlock] };
    expect(contentSignsIn(signIn)).toBe(true);
  });

  it("sends every site target to a page that exists, and only `url` takes a link", () => {
    expect(Object.keys(SITE_BUTTON_PATHS).sort()).toEqual(BLOCK_BUTTON_TARGETS.filter((t) => t !== "sign_in" && t !== "product" && t !== "url").sort());
    expect(SITE_BUTTON_PATHS).toEqual({ shop: "/shop", book_fitting: "/appointments", customise_mpillow: "/mp-config", customise_mbolster: "/mbolster-config" });
  });
});

describe("contentFromLegacy (Convert to blocks)", () => {
  let n = 0;
  const id = () => `b${++n}`;

  it("turns the sign-in invitation into blocks that say the same, and pass the schema", () => {
    n = 0;
    const c = contentFromLegacy(FIRST_CAMPAIGN_DRAFT, id);
    expect(CampaignContentSchema.parse(c)).toEqual(c);
    expect(c.blocks.map((b) => b.type)).toEqual(["heading", "text", "heading", "text", "heading", "text", "buttons"]);
    expect(c.blocks[0]).toEqual({ id: "b1", type: "heading", level: 1, text: FIRST_CAMPAIGN_DRAFT.subject });
    expect(c.blocks[2]).toMatchObject({ type: "heading", level: 2, text: "Points for signing in" });
    expect(c.blocks[5]).toMatchObject({
      type: "text",
      paragraphs: [
        { kind: "bullets", items: [[{ text: "Saves your delivery addresses for a faster checkout" }], expect.anything(), expect.anything(), expect.anything()] },
        { kind: "p", runs: [{ text: "Questions? Just reply to this email." }] },
      ],
    });
    expect(c.blocks[6]).toMatchObject({ type: "buttons", buttons: [{ label: "Sign in and collect your points", target: "sign_in", style: "primary" }] });
    expect(c.fallbacks).toEqual({});
  });

  it("keeps a paragraph's lines apart and its links as links, reading as before", () => {
    const c = contentFromLegacy({
      subject: "",
      body: "One line\nanother, see https://custom.mpillow.com/en-US/faq.\n\n- https://x.test/y stays words",
      button: { target: "url", label: "Shop", url: "https://custom.mpillow.com/shop" },
    }, id);
    expect(c.blocks[0]).toMatchObject({
      type: "text",
      paragraphs: [
        {
          kind: "p",
          runs: [
            { text: "One line\nanother, see " },
            { text: "custom.mpillow.com/en-US/faq", href: "https://custom.mpillow.com/en-US/faq" },
            { text: "." },
          ],
        },
        { kind: "bullets", items: [[{ text: "https://x.test/y stays words" }]] },
      ],
    });
    expect(c.blocks[1]).toMatchObject({ type: "buttons", buttons: [{ target: "url", url: "https://custom.mpillow.com/shop" }] });
    expect(contentFromLegacy({ subject: "  ", body: "", button: null }, id)).toEqual(EMPTY_CAMPAIGN_CONTENT);
  });

  it("starts a new text block past the paragraph limit, so a long message still converts", () => {
    const body = Array.from({ length: CONTENT_LIMITS.paragraphs + 5 }, (_, i) => `Paragraph ${i}`).join("\n\n");
    const c = contentFromLegacy({ subject: "", body, button: null }, id);
    expect(c.blocks.map((b) => (b.type === "text" ? b.paragraphs.length : 0))).toEqual([CONTENT_LIMITS.paragraphs, 5]);
    expect(CampaignContentSchema.safeParse(c).success).toBe(true);
  });
});

describe("Variables", () => {
  it("has the first name, the last name and the points balance, each with a sample and default fallback words where there are any", () => {
    expect(VARIABLE_KEYS).toEqual(["first_name", "last_name", "points_balance"]);
    expect(CAMPAIGN_VARIABLES.first_name).toMatchObject({ label: "First name", sample: "Mei Ling", fallback: "there" });
    expect(CAMPAIGN_VARIABLES.last_name).toMatchObject({ label: "Last name", sample: "Tan", fallback: null });
    expect(CAMPAIGN_VARIABLES.points_balance).toMatchObject({ label: "Points balance", sample: "1,250", fallback: null, needsPoints: true });
    // The sample customer reads as each Variable's sample.
    expect(variableValues(SAMPLE_RECIPIENT, {})).toEqual({ first_name: "Mei Ling", last_name: "Tan", points_balance: "1,250" });
    expect(withSampleValues("{first_name}, you have {points_balance} points")).toBe("Mei Ling, you have 1,250 points");
  });

  it("fills a recipient's value on one line, at most 60 characters, or the fallback", () => {
    expect(variableValue("  Mei \n Ling ")).toBe("Mei Ling");
    expect(variableValue("x".repeat(80))).toHaveLength(60);
    expect(variableValue("   ")).toBeNull();
    const fallbacks = { first_name: "friend", last_name: "of ours", points_balance: "some" };
    expect(variableValues({ firstName: "Ann", lastName: "Lee", pointsBalance: 12500 }, fallbacks)).toEqual({
      first_name: "Ann",
      last_name: "Lee",
      points_balance: "12,500",
    });
    expect(variableValues({ firstName: null }, fallbacks)).toEqual({ first_name: "friend", last_name: "of ours", points_balance: "some" });
    // A balance of 0 is none: the fallback words, not "0".
    expect(variableValues({ firstName: "Ann", pointsBalance: 0 }, fallbacks).points_balance).toBe("some");
    expect(variableValues({ firstName: " " }, {})).toEqual({ first_name: "there", last_name: "", points_balance: "" });
    expect(variableFallback("first_name", { first_name: "  " })).toBe("there");
  });

  it("knows the fallback words a used Variable has: the campaign's, else the catalogue's, and none for an empty one", () => {
    expect(fallbackWords("first_name", {})).toBe("there");
    expect(fallbackWords("first_name", { first_name: "friend" })).toBe("friend");
    expect(fallbackWords("first_name", { first_name: " " })).toBeNull();
    expect(fallbackWords("last_name", {})).toBeNull();
    expect(fallbackWords("points_balance", { points_balance: "some" })).toBe("some");
  });

  it("names the {name}s of a subject that are not Variables", () => {
    expect(unknownVariablesIn("{first_name}, {last_name} and {points_balance}")).toEqual([]);
    expect(unknownVariablesIn("Hello {first_name} {nickname}")).toEqual(["nickname"]);
  });
});

describe("filling the blocks for one recipient", () => {
  const values = { first_name: "Mei Ling", last_name: "Tan", points_balance: "1,250" };
  it("fills every Variable run and every {name} in the blocks' words, and leaves links, labels and ids as written", () => {
    const content: CampaignContent = {
      v: 1,
      blocks: [
        { id: "h", type: "heading", level: 1, text: "{first_name}, {nickname}" },
        {
          id: "t",
          type: "text",
          paragraphs: [
            { kind: "p", runs: [{ var: "last_name" }, { text: " has {points_balance}", bold: true }, { text: "link", href: "https://custom.mpillow.com/?n={first_name}" }] },
            { kind: "bullets", items: [[{ var: "points_balance" }]] },
          ],
        },
        { id: "b", type: "buttons", buttons: [{ label: "For {first_name}", target: "url", url: "https://custom.mpillow.com/{first_name}", style: "primary" }] },
      ],
      fallbacks: {},
    };
    expect(fillVariables(content, values).blocks).toEqual([
      { id: "h", type: "heading", level: 1, text: "Mei Ling, {nickname}" },
      {
        id: "t",
        type: "text",
        paragraphs: [
          { kind: "p", runs: [{ text: "Tan" }, { text: " has 1,250", bold: true }, { text: "link", href: "https://custom.mpillow.com/?n={first_name}" }] },
          { kind: "bullets", items: [[{ text: "1,250" }]] },
        ],
      },
      { id: "b", type: "buttons", buttons: [{ label: "For {first_name}", target: "url", url: "https://custom.mpillow.com/{first_name}", style: "primary" }] },
    ]);
    // Nothing is changed in place.
    expect(content.blocks[0]).toMatchObject({ text: "{first_name}, {nickname}" });
  });

  it("fills the media blocks' words too, and leaves their alt text, labels and ids as written (wave 3 merge)", () => {
    const PHOTO = "6f1c2b9e-3d4a-4e8b-9c1d-2a3b4c5d6e7f";
    const SHOP = "0b6f1a52-3c1d-4e9a-8f7b-2d5c6e7f8a9b";
    const button = { label: "Shop, {first_name}", target: "shop", style: "primary" } as const;
    const content: CampaignContent = {
      v: 1,
      blocks: [
        { id: "hero", type: "hero", image: { asset: PHOTO, alt: "For {first_name}" }, heading: "{first_name}, sleep cooler", line: "{points_balance} points", button },
        {
          id: "split",
          type: "split",
          image: { asset: PHOTO, alt: "A bed" },
          side: "left",
          heading: "Why {last_name}",
          paragraphs: [{ kind: "p", runs: [{ text: "Hi " }, { var: "first_name" }] }],
          button,
        },
        { id: "p", type: "products", products: [SHOP], layout: "rows", buttonLabel: "Shop, {first_name}" },
      ],
      fallbacks: {},
    };
    expect(fillVariables(content, values).blocks).toEqual([
      { id: "hero", type: "hero", image: { asset: PHOTO, alt: "For {first_name}" }, heading: "Mei Ling, sleep cooler", line: "1,250 points", button },
      {
        id: "split",
        type: "split",
        image: { asset: PHOTO, alt: "A bed" },
        side: "left",
        heading: "Why Tan",
        paragraphs: [{ kind: "p", runs: [{ text: "Hi " }, { text: "Mei Ling" }] }],
        button,
      },
      { id: "p", type: "products", products: [SHOP], layout: "rows", buttonLabel: "Shop, {first_name}" },
    ]);
  });

  it("fills a value once: a name that looks like a Variable stays words", () => {
    const content: CampaignContent = { ...CONTENT, blocks: [{ id: "h", type: "heading", level: 2, text: "{first_name} {last_name}" }] };
    expect(fillVariables(content, { ...values, first_name: "{last_name}" }).blocks[0]).toMatchObject({ text: "{last_name} Tan" });
  });
});
