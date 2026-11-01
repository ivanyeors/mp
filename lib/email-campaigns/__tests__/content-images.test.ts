import { describe, expect, it } from "vitest";
import {
  CampaignContentPreviewSchema,
  CampaignContentSchema,
  contentSignsIn,
  contentWords,
  emptyBlock,
  imageAssetsIn,
  type CampaignContent,
  type EmailBlock,
} from "../content";
import { CampaignDraftSchema, EMPTY_CAMPAIGN_DRAFT } from "../rules";

/**
 * The image and hero blocks (PRD-campaign-email-editor slice 05): a Media
 * Asset by id, never a URL; alt text required unless decorative; a link to a
 * page of the site or an https link; a hero's heading, line and button each
 * optional, and written when kept.
 */

const PHOTO = "6f1c2b9e-3d4a-4e8b-9c1d-2a3b4c5d6e7f";
const CUTOUT = "8a2d3c4b-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const one = (b: unknown) => ({ v: 1, blocks: [b], fallbacks: {} });
const issues = (c: unknown) => CampaignContentSchema.safeParse(c).error?.issues.map((i) => [i.path.join("."), i.message]) ?? [];
const image = (over: Record<string, unknown> = {}) => ({ id: "i", type: "image", image: { asset: PHOTO, alt: "A cover on a bed" }, width: "full", ...over });

describe("an image block", () => {
  it("takes a Media Asset, its alt text, a link and a width", () => {
    const ok = image({ link: { target: "shop" }, width: "inset" });
    expect(CampaignContentSchema.parse(one(ok))).toEqual(one(ok));
    expect(CampaignContentSchema.safeParse(one(image({ link: { target: "url", url: "https://custom.mpillow.com/en-US/faq" } }))).success).toBe(true);
    expect(CampaignContentSchema.safeParse(one(image({ image: { asset: PHOTO, alt: "", decorative: true } }))).success).toBe(true);
  });

  it("asks on save for an image, and for alt text unless it is decorative", () => {
    expect(issues(one(emptyBlock("image", "i")))).toEqual([
      ["blocks.0.image.asset", "Choose an image."],
      ["blocks.0.image.alt", "Describe the image for anyone who can't see it, or mark it decorative."],
    ]);
    expect(issues(one(image({ image: { asset: PHOTO, alt: "   " } })))).toEqual([
      ["blocks.0.image.alt", "Describe the image for anyone who can't see it, or mark it decorative."],
    ]);
    // The preview draws it as it is.
    expect(CampaignContentPreviewSchema.safeParse(one(emptyBlock("image", "i"))).success).toBe(true);
  });

  it("is a field error on Save, keyed where the editor shows it", () => {
    const draft = { ...EMPTY_CAMPAIGN_DRAFT, name: "December", subject: "Sleep cooler", content: one(image({ image: { asset: PHOTO, alt: "" } })) };
    const r = CampaignDraftSchema.safeParse(draft);
    expect(r.error?.issues.map((i) => i.path.join("."))).toEqual(["content.blocks.0.image.alt"]);
  });

  it("needs alt text when linked: it is what the link says", () => {
    expect(issues(one(image({ image: { asset: PHOTO, alt: "", decorative: true }, link: { target: "shop" } })))).toEqual([
      ["blocks.0.image.alt", "A linked image needs alt text: it is what the link says."],
    ]);
  });

  it("holds no URL of its own, refuses anything but an asset id, and caps the alt text", () => {
    expect(issues(one(image({ image: { asset: "https://evil.example/pixel.gif", alt: "x" } })))).toEqual([["blocks.0.image.asset", "Choose an image."]]);
    expect(CampaignContentPreviewSchema.safeParse(one(image({ image: { asset: "https://evil.example/pixel.gif", alt: "x" } }))).success).toBe(false);
    expect(CampaignContentSchema.safeParse(one(image({ image: { asset: PHOTO.toUpperCase(), alt: "x" } }))).success).toBe(false);
    expect(CampaignContentSchema.safeParse(one(image({ src: "https://evil.example/pixel.gif" }))).success).toBe(false);
    expect(CampaignContentSchema.safeParse(one(image({ image: { asset: PHOTO, alt: "x", url: "https://evil.example" } }))).success).toBe(false);
    expect(issues(one(image({ image: { asset: PHOTO, alt: "x".repeat(151) } })))).toEqual([["blocks.0.image.alt", "At most 150 characters."]]);
    expect(issues(one(image({ image: { asset: PHOTO, alt: "<b>Sale</b>" } })))).toEqual([["blocks.0.image.alt", "Words only: no HTML tags."]]);
    expect(issues(one(image({ image: { asset: PHOTO, alt: "For {first_name}" } })))[0][0]).toBe("blocks.0.image.alt");
  });

  it("links to a page of the site or an https link, never the sign-in", () => {
    expect(issues(one(image({ link: { target: "url", url: "http://custom.mpillow.com" } })))).toEqual([
      ["blocks.0.link.url", "The image's link must be a full https:// address."],
    ]);
    expect(issues(one(image({ link: { target: "shop", url: "https://custom.mpillow.com" } })))).toEqual([["blocks.0.link.url", "Only a link has a link of its own."]]);
    expect(CampaignContentSchema.safeParse(one(image({ link: { target: "sign_in" } }))).success).toBe(false);
    expect(CampaignContentSchema.safeParse(one(image({ width: "wide" }))).success).toBe(false);
  });
});

describe("a hero", () => {
  const hero = (over: Record<string, unknown> = {}) => ({
    id: "h",
    type: "hero",
    image: { asset: PHOTO, alt: "A cover on a bed" },
    heading: "Sleep cooler",
    line: "In every size.",
    button: { label: "Shop the covers", target: "shop", style: "primary" },
    ...over,
  });

  it("takes an image with a heading, a line and a button, each of which may be left out", () => {
    expect(CampaignContentSchema.parse(one(hero()))).toEqual(one(hero()));
    expect(CampaignContentSchema.safeParse(one({ id: "h", type: "hero", image: { asset: PHOTO, alt: "A bed" } })).success).toBe(true);
  });

  it("starts with every part, on its placeholder, and asks for what is kept", () => {
    expect(emptyBlock("hero", "h")).toEqual({
      id: "h",
      type: "hero",
      image: { asset: "", alt: "" },
      heading: "",
      line: "",
      button: { label: "", target: "shop", style: "primary" },
    });
    expect(issues(one(emptyBlock("hero", "h")))).toEqual([
      ["blocks.0.image.asset", "Choose an image."],
      ["blocks.0.image.alt", "Describe the image for anyone who can't see it, or mark it decorative."],
      ["blocks.0.heading", "Write the heading, or remove it."],
      ["blocks.0.line", "Write the line, or remove it."],
      ["blocks.0.button.label", "Give the button a label."],
    ]);
  });

  it("holds its words to words: no tags, only Variables in braces, the limits", () => {
    expect(issues(one(hero({ heading: "x".repeat(121) })))).toEqual([["blocks.0.heading", "At most 120 characters."]]);
    expect(issues(one(hero({ line: "x".repeat(201) })))).toEqual([["blocks.0.line", "At most 200 characters."]]);
    // Its heading and line take Variables as a heading block's does (slice 13).
    expect(issues(one(hero({ heading: "{first_name}, sleep cooler", line: "For {first_name} {last_name}" })))).toEqual([]);
    expect(issues(one(hero({ line: "For {frist_name}" })))).toEqual([
      ["blocks.0.line", "{frist_name} is not a Variable: the Variables are {first_name}, {last_name}, {points_balance} and {your_pillow}."],
    ]);
    expect(CampaignContentSchema.safeParse(one(hero({ heading: "<h1>Sale</h1>" }))).success).toBe(false);
    expect(CampaignContentSchema.safeParse(one(hero({ text: "on the image" }))).success).toBe(false);
  });
});

describe("reading the images", () => {
  const content: CampaignContent = {
    v: 1,
    blocks: [
      { id: "h", type: "hero", image: { asset: PHOTO, alt: "A bed" }, heading: "Sleep cooler", button: { label: "Sign in", target: "sign_in", style: "primary" } },
      { id: "i", type: "image", image: { asset: CUTOUT, alt: "", decorative: true }, width: "inset" },
      { id: "j", type: "image", image: { asset: PHOTO, alt: "Again" }, width: "full" },
      emptyBlock("image", "k") as EmailBlock,
    ],
    fallbacks: {},
  };

  it("lists each Media Asset the blocks place once, in order", () => {
    expect(imageAssetsIn(content)).toEqual([PHOTO, CUTOUT]);
  });

  it("reads alt text as words, but a decorative image's none", () => {
    expect(contentWords(content)).toEqual(["A bed", "Sleep cooler", "Sign in", "Again"]);
  });

  it("knows a hero's button signs in", () => {
    expect(contentSignsIn(content)).toBe(true);
    expect(contentSignsIn({ ...content, blocks: content.blocks.slice(1) })).toBe(false);
  });
});
