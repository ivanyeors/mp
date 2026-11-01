import { describe, expect, it } from "vitest";
import {
  CampaignContentPreviewSchema,
  CampaignContentSchema,
  CONTENT_LIMITS,
  contentSignsIn,
  contentWords,
  emptyBlock,
  imageAssetsIn,
  variablesUsed,
  type CampaignContent,
} from "../content";
import { CampaignDraftSchema, EMPTY_CAMPAIGN_DRAFT } from "../rules";

/**
 * The image + text block (PRD-campaign-email-editor slice 06): an image, as
 * slice 05 places one, that always says what it shows; the side it sits on;
 * a heading; a few lines of a text block's runs; and an optional button.
 */

const PHOTO = "6f1c2b9e-3d4a-4e8b-9c1d-2a3b4c5d6e7f";
const one = (b: unknown) => ({ v: 1, blocks: [b], fallbacks: {} });
const issues = (c: unknown) => CampaignContentSchema.safeParse(c).error?.issues.map((i) => [i.path.join("."), i.message]) ?? [];
const lines = (text: string) => [{ kind: "p", runs: [{ text }] }];
const split = (over: Record<string, unknown> = {}) => ({
  id: "s",
  type: "split",
  image: { asset: PHOTO, alt: "A FibreCool cover on a bed" },
  side: "left",
  heading: "Why FibreCool",
  paragraphs: lines("Cool to the touch, all night."),
  button: { label: "Shop the covers", target: "shop", style: "primary" },
  ...over,
});

describe("an image + text block", () => {
  it("takes an image, a side, a heading, the words and a button, which may be left out", () => {
    expect(CampaignContentSchema.parse(one(split()))).toEqual(one(split()));
    expect(CampaignContentSchema.parse(one(split({ side: "right" })))).toEqual(one(split({ side: "right" })));
    const plain: Record<string, unknown> = split();
    delete plain.button;
    expect(CampaignContentSchema.parse(one(plain))).toEqual(one(plain));
    // The words are a text block's runs: bold, a link, a Variable, bullets.
    const rich = split({
      paragraphs: [
        { kind: "p", runs: [{ text: "Hi " }, { var: "first_name" }, { text: ", read the " }, { text: "care guide", href: "https://custom.mpillow.com/en-US/faq", bold: true }] },
        { kind: "bullets", items: [[{ text: "Cool" }], [{ text: "Washable" }]] },
      ],
    });
    expect(CampaignContentSchema.safeParse(one(rich)).success).toBe(true);
  });

  it("starts with the image on the left and every part on its placeholder, and asks for each on Save", () => {
    expect(emptyBlock("split", "s")).toEqual({
      id: "s",
      type: "split",
      image: { asset: "", alt: "" },
      side: "left",
      heading: "",
      paragraphs: [],
      button: { label: "", target: "shop", style: "primary" },
    });
    expect(issues(one(emptyBlock("split", "s")))).toEqual([
      ["blocks.0.image.asset", "Choose an image."],
      ["blocks.0.image.alt", "Describe the image for anyone who can't see it."],
      ["blocks.0.heading", "Write the heading."],
      ["blocks.0.button.label", "Give the button a label."],
      ["blocks.0.paragraphs", "Write the text."],
    ]);
    // The preview draws it as it is.
    expect(CampaignContentPreviewSchema.safeParse(one(emptyBlock("split", "s"))).success).toBe(true);
  });

  it("always says what its image shows: beside words it is never decorative", () => {
    expect(CampaignContentSchema.safeParse(one(split({ image: { asset: PHOTO, alt: "", decorative: true } }))).success).toBe(false);
    expect(CampaignContentPreviewSchema.safeParse(one(split({ image: { asset: PHOTO, alt: "A cover", decorative: true } }))).success).toBe(false);
    const draft = { ...EMPTY_CAMPAIGN_DRAFT, name: "December", subject: "Sleep cooler", content: one(split({ image: { asset: PHOTO, alt: " " } })) };
    expect(CampaignDraftSchema.safeParse(draft).error?.issues.map((i) => i.path.join("."))).toEqual(["content.blocks.0.image.alt"]);
  });

  it("keeps its words to a few lines beside the image, so the row stays small", () => {
    const most = "x".repeat(CONTENT_LIMITS.splitText);
    expect(CampaignContentSchema.safeParse(one(split({ paragraphs: lines(most) }))).success).toBe(true);
    expect(issues(one(split({ paragraphs: lines(`${most}x`) })))).toEqual([["blocks.0.paragraphs", `At most ${CONTENT_LIMITS.splitText} characters.`]]);
    const many = Array.from({ length: CONTENT_LIMITS.splitParagraphs + 1 }, () => lines("A line.")[0]);
    expect(issues(one(split({ paragraphs: many })))).toEqual([["blocks.0.paragraphs", `At most ${CONTENT_LIMITS.splitParagraphs} paragraphs beside an image.`]]);
  });

  it("holds its words to words: no tags, only Variables in braces, the heading's limit", () => {
    const unknown = (name: string) => `{${name}} is not a Variable: the Variables are {first_name}, {last_name}, {points_balance} and {your_pillow}.`;
    expect(issues(one(split({ heading: "x".repeat(121) })))).toEqual([["blocks.0.heading", "At most 120 characters."]]);
    // Its heading takes Variables as a heading block's does (slice 13).
    expect(issues(one(split({ heading: "For {first_name}" })))).toEqual([]);
    expect(issues(one(split({ heading: "For {frist_name}" })))).toEqual([["blocks.0.heading", unknown("frist_name")]]);
    expect(issues(one(split({ paragraphs: lines("Hi {frist_name}") })))).toEqual([["blocks.0.paragraphs", unknown("frist_name")]]);
    expect(CampaignContentSchema.safeParse(one(split({ heading: "<h2>Sale</h2>" }))).success).toBe(false);
    expect(CampaignContentSchema.safeParse(one(split({ paragraphs: lines("<img src=x>") }))).success).toBe(false);
  });

  it("refuses a side it doesn't have, and anything but its own fields", () => {
    expect(CampaignContentSchema.safeParse(one(split({ side: "top" }))).success).toBe(false);
    expect(CampaignContentSchema.safeParse(one(split({ link: { target: "shop" } }))).success).toBe(false);
    expect(CampaignContentPreviewSchema.safeParse(one(split({ image: { asset: "https://evil.example/pixel.gif", alt: "x" } }))).success).toBe(false);
  });
});

describe("reading an image + text", () => {
  const content: CampaignContent = {
    v: 1,
    blocks: [
      {
        id: "s",
        type: "split",
        image: { asset: PHOTO, alt: "A cover" },
        side: "right",
        heading: "Why FibreCool",
        paragraphs: [{ kind: "p", runs: [{ text: "Hi " }, { var: "first_name" }, { text: "." }] }],
        button: { label: "Sign in", target: "sign_in", style: "secondary" },
      },
    ],
    fallbacks: {},
  };

  it("counts its image as placed: its rendition is read, and the Media Library calls it Used", () => {
    expect(imageAssetsIn(content)).toEqual([PHOTO]);
  });

  it("reads its alt text, heading, words and button label, and the Variables in its words", () => {
    expect(contentWords(content)).toEqual(["A cover", "Why FibreCool", "Hi {first_name}.", "Sign in"]);
    expect(variablesUsed(content)).toEqual(["first_name"]);
  });

  it("knows its button signs in", () => {
    expect(contentSignsIn(content)).toBe(true);
    const shop = content.blocks.map((b) => (b.type === "split" ? { ...b, button: { label: "Shop", target: "shop" as const, style: "primary" as const } } : b));
    expect(contentSignsIn({ ...content, blocks: shop })).toBe(false);
  });
});
