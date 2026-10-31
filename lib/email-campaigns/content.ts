/**
 * A campaign's content: a list of typed Email blocks (PRD-campaign-email-editor
 * decision 1, slice 03; ADR 0036). Pure, and safe in the browser.
 *
 * One shape for the editor, the `email_campaigns.content` column and Claude's
 * structured output (slice 09), checked by one schema on every write. It is
 * words and choices, never markup: only the server renders it, with our own
 * components (lib/email/campaign-blocks.ts), and every word is escaped there.
 *
 * Flat, never recursive: a text block is paragraphs of runs, and a run is some
 * words with their marks, or one Variable. Structured outputs can hold neither
 * a recursive schema nor a length, and the database cannot see inside JSON
 * well, so the limits live here, in code.
 *
 * A campaign written before the editor has a plain-text `body` instead, and
 * keeps it (decision 5); `contentFromLegacy` is *Convert to blocks*.
 */
import { z } from "zod";
import { bodyLineParts, linkLabel, parseCampaignBody } from "@/lib/email/campaign-body";
import { fillCopy, placeholdersIn } from "@/lib/email/copy";
import { isVariableKey, unknownVariablesIn, VARIABLE_KEYS, VARIABLE_MAX, type VariableKey } from "./variables";

export const EMAIL_BLOCK_TYPES = ["heading", "text", "buttons", "image", "hero", "split", "products", "divider", "spacer"] as const;
export type EmailBlockType = (typeof EMAIL_BLOCK_TYPES)[number];

/** Each block type's name, as the editor's palette and cards and the checks before a wave call it. */
export const EMAIL_BLOCK_LABEL: Record<EmailBlockType, string> = {
  heading: "Heading",
  text: "Text",
  buttons: "Buttons",
  image: "Image",
  hero: "Hero",
  split: "Image + text",
  products: "Products",
  divider: "Divider",
  spacer: "Spacer",
};

/**
 * Where a block's button goes. The sender resolves each to an absolute URL on
 * the live origin with the campaign's UTMs: Staff never type a site link.
 * `sign_in` is the recipient's own Claim link when they have one, else their
 * account, as the single button does today; `product` is one Storefront
 * product's shop page (slice 07), which the button names by id; `url` is a
 * link Staff type, https only.
 */
export const BLOCK_BUTTON_TARGETS = ["sign_in", "shop", "book_fitting", "customise_mpillow", "customise_mbolster", "product", "url"] as const;
export type BlockButtonTarget = (typeof BLOCK_BUTTON_TARGETS)[number];

export type SiteButtonTarget = Exclude<BlockButtonTarget, "sign_in" | "product" | "url">;

/** Each site target's page, before the locale. */
export const SITE_BUTTON_PATHS: Record<SiteButtonTarget, string> = {
  shop: "/shop",
  book_fitting: "/appointments",
  customise_mpillow: "/mp-config",
  customise_mbolster: "/mbolster-config",
};

export const BLOCK_BUTTON_TARGET_LABEL: Record<BlockButtonTarget, string> = {
  sign_in: "Sign in to their account",
  shop: "The shop",
  book_fitting: "Book a fitting",
  customise_mpillow: "Customise an Mpillow",
  customise_mbolster: "Customise an Mbolster",
  product: "A product",
  url: "A link",
};

export const BUTTON_STYLES = ["primary", "secondary"] as const;
export const SPACER_SIZES = ["s", "m", "l"] as const;

/**
 * Where an image can link (slice 05): a page of the site, or a link Staff
 * type. Never the sign-in, which only a button offers.
 */
export const IMAGE_LINK_TARGETS = ["shop", "book_fitting", "customise_mpillow", "customise_mbolster", "url"] as const satisfies readonly BlockButtonTarget[];
export type ImageLinkTarget = (typeof IMAGE_LINK_TARGETS)[number];

/** An image's width (slice 05): the column's full width, or inset with room either side. Always centred. */
export const IMAGE_WIDTHS = ["full", "inset"] as const;
export type ImageWidth = (typeof IMAGE_WIDTHS)[number];

/** Which side an image + text's image sits on beside its words (slice 06). On a phone it comes first either way. */
export const SPLIT_SIDES = ["left", "right"] as const;
export type SplitSide = (typeof SPLIT_SIDES)[number];

/**
 * How a products block lays out its products (slice 07): one per row, the
 * photo beside its name, or side by side as a grid. Both stack on a phone.
 */
export const PRODUCT_LAYOUTS = ["rows", "side_by_side"] as const;
export type ProductLayout = (typeof PRODUCT_LAYOUTS)[number];

/** What a product's button says unless Staff say otherwise (slice 07). */
export const PRODUCT_BUTTON_LABEL = "Shop now";

export const CONTENT_VERSION = 1;

export const CONTENT_LIMITS = {
  blocks: 40,
  heading: 120,
  buttonLabel: 40,
  url: 500,
  /** The words of one text block: a legacy body's limit, so every body converts. */
  text: 10000,
  paragraphs: 50,
  items: 30,
  runs: 200,
  /** An image's alt text: what a screen reader says, and what shows with images off. */
  alt: 150,
  /** A hero's one line under its heading. */
  line: 200,
  /** An image + text's words beside the image: a few lines, so the row stays small (slice 06). */
  splitText: 500,
  splitParagraphs: 4,
  /** The products one block shows (slice 07): a row of three is as narrow as a phone's columns go. */
  products: 3,
  /** A campaign's subject and preview line, in English (rules.ts) and in its 中文 version (slice 17). */
  subject: 150,
  preheader: 200,
  /** The stored JSON, in UTF-8 bytes; the table refuses 256,000. */
  bytes: 200_000,
} as const;

/**
 * What an empty block field shows in the editor's preview, dashed and muted
 * (decision 7). Hint text, never a value: never saved, tested or sent.
 */
export const CONTENT_PLACEHOLDERS = {
  heading: "e.g. Sleep cooler this December",
  text: "Write a few lines.",
  empty: "Add a block to start the email: a heading, some text, a button.",
  image: "Choose an image from the Media Library.",
  /** An image chosen whose email copy could not be read or made. */
  imageUnavailable: "This image can't be shown in an email. Choose it again, or another.",
  line: "e.g. Our coolest covers, back in every size.",
  products: "Choose up to three products from the shop.",
  /** A product chosen that is no longer Listed, or no longer exists. */
  productUnavailable: "This product is no longer in the shop: remove it or list it again.",
} as const;

/** Pure — whether `value` is an absolute https link with no spaces. */
export function isHttpsUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && Boolean(u.hostname) && !/\s/.test(value);
  } catch {
    return false;
  }
}

// Anything shaped like a tag. Words are escaped when rendered anyway; refusing
// a tag here keeps pasted markup, or a model's, out of the stored email.
const TAG = /<\/?[a-z!][^<>]*>/i;
const noTags = (v: string) => !TAG.test(v);
const NO_TAGS = "Words only: no HTML tags.";

const most = (max: number) => `At most ${max.toLocaleString("en-SG")} characters.`;

const httpsLink = z
  .string()
  .max(CONTENT_LIMITS.url, most(CONTENT_LIMITS.url))
  .refine(isHttpsUrl, "A link must be a full https:// address.");

/** Some words, with their marks. `\n` is a line break inside the paragraph. */
const TextRunSchema = z.strictObject({
  text: z.string().min(1).max(CONTENT_LIMITS.text, most(CONTENT_LIMITS.text)).refine(noTags, NO_TAGS),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  href: httpsLink.optional(),
});

/** One Variable, filled per recipient. */
const VariableRunSchema = z.strictObject({ var: z.enum(VARIABLE_KEYS) });

export const RunSchema = z.union([TextRunSchema, VariableRunSchema]);

const runs = z.array(RunSchema).min(1).max(CONTENT_LIMITS.runs);

export const ParagraphSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("p"), runs }),
  z.strictObject({ kind: z.literal("bullets"), items: z.array(runs).min(1).max(CONTENT_LIMITS.items) }),
]);

export type Run = z.output<typeof RunSchema>;
export type TextRun = z.output<typeof TextRunSchema>;
export type Paragraph = z.output<typeof ParagraphSchema>;

/** A block's id: stable for its life, so the editor can follow it as it moves. */
const BlockId = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, "A block id is 1 to 40 letters, digits, - or _.");

/** A Media Asset's id (`media_assets.id`), as Postgres writes a uuid: lower case. */
const ASSET_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A Storefront product's id (`products.id`): the same lower-case uuid. */
const PRODUCT_ID = ASSET_ID;

/**
 * A field of words, in English or in the 中文 version (slice 17). Saving
 * needs every word (`required`); the preview takes them empty.
 */
function wordsSchemas({ required }: { required: boolean }) {
  // Words that take Variables (a heading, a hero's line) name only the catalogue's; the rest
  // (a button label) are sent as written: a `{name}` there would reach the customer in braces.
  const words = (max: number, empty: string, { variables = false }: { variables?: boolean } = {}) => {
    const s = (required ? z.string().trim().min(1, empty) : z.string().trim()).max(max, most(max)).refine(noTags, NO_TAGS);
    if (!required) return s;
    return s.superRefine((v, ctx) => {
      const unfilled = variables ? unknownVariableMessage(v) : sentAsWrittenMessage(v);
      if (unfilled) ctx.addIssue({ code: "custom", message: unfilled });
    });
  };

  // Words that may be left empty, sent as written as a heading is.
  const optionalWords = (max: number) => {
    const s = z.string().trim().max(max, most(max)).refine(noTags, NO_TAGS);
    if (!required) return s;
    return s.superRefine((v, ctx) => {
      const unfilled = sentAsWrittenMessage(v);
      if (unfilled) ctx.addIssue({ code: "custom", message: unfilled });
    });
  };
  return { words, optionalWords };
}

/**
 * A text block's words, wherever they sit (a text block, an image + text, or
 * either in the 中文 version): at most `max` characters, written on Save, and
 * no `{name}` that is not a Variable, which the box kept as words and would
 * be sent in braces.
 */
const textChecks =
  ({ required }: { required: boolean }) =>
  (max: number) =>
  (b: { paragraphs: readonly ParagraphOf<WordsRun>[] }, ctx: z.RefinementCtx) => {
    const all = paragraphRuns(b.paragraphs);
    const length = all.reduce((n, r) => n + ("text" in r ? r.text.length : 0), 0);
    if (length > max) ctx.addIssue({ code: "custom", path: ["paragraphs"], message: most(max) });
    if (required && !all.some((r) => "var" in r || r.text.trim())) {
      ctx.addIssue({ code: "custom", path: ["paragraphs"], message: "Write the text." });
    }
    const unknown = required ? unknownVariableMessage(textWords(b.paragraphs)) : null;
    if (unknown) ctx.addIssue({ code: "custom", path: ["paragraphs"], message: unknown });
  };

/**
 * The block types. Saving needs every word (`required`); the preview takes
 * them empty, so a new block shows its placeholders.
 */
function blockSchema({ required }: { required: boolean }) {
  const { words, optionalWords } = wordsSchemas({ required });

  // An image from the Media Library (slice 05): its asset, empty until one is
  // chosen, and its alt text, or `decorative` for one that says nothing a
  // reader would miss (empty alt, role="presentation"). The email shows the
  // asset's email rendition, which the sender reads at render; the content
  // holds no URL of its own.
  const asset = required
    ? z.string().regex(ASSET_ID, "Choose an image.")
    : z.string().refine((v) => v === "" || ASSET_ID.test(v), "An image is a Media Asset's id.");
  const image = z
    .strictObject({ asset, alt: optionalWords(CONTENT_LIMITS.alt), decorative: z.boolean().optional() })
    .superRefine((im, ctx) => {
      if (required && !im.decorative && !im.alt) {
        ctx.addIssue({ code: "custom", path: ["alt"], message: "Describe the image for anyone who can't see it, or mark it decorative." });
      }
    });
  // Beside words (slice 06) an image is part of what they say: it always says
  // what it shows, so it has no `decorative`.
  const describedImage = z.strictObject({ asset, alt: optionalWords(CONTENT_LIMITS.alt) }).superRefine((im, ctx) => {
    if (required && !im.alt) ctx.addIssue({ code: "custom", path: ["alt"], message: "Describe the image for anyone who can't see it." });
  });

  const imageLink = z
    .strictObject({
      target: z.enum(IMAGE_LINK_TARGETS),
      url: z.string().trim().max(CONTENT_LIMITS.url, most(CONTENT_LIMITS.url)).optional(),
    })
    .superRefine((l, ctx) => {
      if (l.target === "url") {
        if (!l.url || !isHttpsUrl(l.url)) ctx.addIssue({ code: "custom", path: ["url"], message: "The image's link must be a full https:// address." });
      } else if (l.url !== undefined) {
        ctx.addIssue({ code: "custom", path: ["url"], message: "Only a link has a link of its own." });
      }
    });

  // A product a button goes to (slice 07), empty until one is chosen: the
  // button names it by id, and the sender reads its shop page at render.
  const product = required
    ? z.string().regex(PRODUCT_ID, "Choose a product.")
    : z.string().refine((v) => v === "" || PRODUCT_ID.test(v), "A product is a Storefront product's id.");

  const button = z
    .strictObject({
      label: words(CONTENT_LIMITS.buttonLabel, "Give the button a label."),
      target: z.enum(BLOCK_BUTTON_TARGETS),
      url: z.string().trim().max(CONTENT_LIMITS.url, most(CONTENT_LIMITS.url)).optional(),
      product: product.optional(),
      style: z.enum(BUTTON_STYLES),
    })
    .superRefine((b, ctx) => {
      if (b.target === "url") {
        if (!b.url || !isHttpsUrl(b.url)) {
          ctx.addIssue({ code: "custom", path: ["url"], message: "The button's link must be a full https:// address." });
        }
      } else if (b.url !== undefined) {
        ctx.addIssue({ code: "custom", path: ["url"], message: "Only a link button has a link of its own." });
      }
      if (b.target === "product") {
        if (b.product === undefined) ctx.addIssue({ code: "custom", path: ["product"], message: "Choose a product." });
      } else if (b.product !== undefined) {
        ctx.addIssue({ code: "custom", path: ["product"], message: "Only a product button has a product of its own." });
      }
    });

  const paragraphChecks = textChecks({ required });

  return z.discriminatedUnion("type", [
    z.strictObject({
      id: BlockId,
      type: z.literal("heading"),
      level: z.union([z.literal(1), z.literal(2)]),
      text: words(CONTENT_LIMITS.heading, "Write the heading.", { variables: true }),
    }),
    z
      .strictObject({
        id: BlockId,
        type: z.literal("text"),
        paragraphs: z.array(ParagraphSchema).max(CONTENT_LIMITS.paragraphs),
      })
      .superRefine(paragraphChecks(CONTENT_LIMITS.text)),
    z.strictObject({
      id: BlockId,
      type: z.literal("buttons"),
      buttons: z.array(button).min(1, "Add a button.").max(2, "At most two buttons side by side."),
    }),
    z
      .strictObject({
        id: BlockId,
        type: z.literal("image"),
        image,
        link: imageLink.optional(),
        width: z.enum(IMAGE_WIDTHS),
      })
      .superRefine((b, ctx) => {
        // A linked image's alt is the link's words.
        if (required && b.link && b.image.decorative) {
          ctx.addIssue({ code: "custom", path: ["image", "alt"], message: "A linked image needs alt text: it is what the link says." });
        }
      }),
    // The image, then its words as real text below it: never text on the image
    // (decision 6). Each part but the image may be left out; one kept is written.
    z.strictObject({
      id: BlockId,
      type: z.literal("hero"),
      image,
      // Its heading and line take Variables as a heading block's does (slice 13).
      heading: words(CONTENT_LIMITS.heading, "Write the heading, or remove it.", { variables: true }).optional(),
      line: words(CONTENT_LIMITS.line, "Write the line, or remove it.", { variables: true }).optional(),
      button: button.optional(),
    }),
    // An image beside a heading, a few lines and an optional button, in two
    // columns that stack on a phone, the image first (slice 06).
    z
      .strictObject({
        id: BlockId,
        type: z.literal("split"),
        image: describedImage,
        side: z.enum(SPLIT_SIDES),
        heading: words(CONTENT_LIMITS.heading, "Write the heading.", { variables: true }),
        paragraphs: z.array(ParagraphSchema).max(CONTENT_LIMITS.splitParagraphs, `At most ${CONTENT_LIMITS.splitParagraphs} paragraphs beside an image.`),
        button: button.optional(),
      })
      .superRefine(paragraphChecks(CONTENT_LIMITS.splitText)),
    // Up to three Storefront products, by id only (slice 07, decision 3): the
    // name, photo and price are the shop's, read when the email is rendered,
    // so a price is never typed, copied or kept here.
    z
      .strictObject({
        id: BlockId,
        type: z.literal("products"),
        products: (required ? z.array(z.string().regex(PRODUCT_ID, "Choose a product.")).min(1, "Choose a product.") : z.array(product)).max(
          CONTENT_LIMITS.products,
          `At most ${CONTENT_LIMITS.products} products in one block.`,
        ),
        layout: z.enum(PRODUCT_LAYOUTS),
        buttonLabel: words(CONTENT_LIMITS.buttonLabel, "Give the button a label."),
      })
      .superRefine((b, ctx) => {
        b.products.forEach((p, i) => {
          if (p && b.products.indexOf(p) !== i) ctx.addIssue({ code: "custom", path: ["products", i], message: "That product is in this block already." });
        });
      }),
    z.strictObject({ id: BlockId, type: z.literal("divider") }),
    z.strictObject({ id: BlockId, type: z.literal("spacer"), size: z.enum(SPACER_SIZES) }),
  ]);
}

// ---------------------------------------------------------------------------
// The 中文 version (slice 17)
// ---------------------------------------------------------------------------

/**
 * The 中文 version's language (PRD-campaign-email-editor decision 11): the
 * `customers.locale` of a Customer who reads the site in Chinese, who gets it
 * when the campaign has one.
 */
export const CHINESE = "zh-CN" as const;

/**
 * Some 中文 words with their marks. A link is its place among the English
 * block's links (`paragraphLinks`), never an address: the links are the
 * English's, so a link Staff change in English changes in 中文 too.
 */
const ChineseTextRunSchema = z.strictObject({
  text: z.string().min(1).max(CONTENT_LIMITS.text, most(CONTENT_LIMITS.text)).refine(noTags, NO_TAGS),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  link: z.number().int().min(0).max(CONTENT_LIMITS.runs).optional(),
});
const chineseRuns = z.array(z.union([ChineseTextRunSchema, VariableRunSchema])).min(1).max(CONTENT_LIMITS.runs);
const ChineseParagraphSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("p"), runs: chineseRuns }),
  z.strictObject({ kind: z.literal("bullets"), items: z.array(chineseRuns).min(1).max(CONTENT_LIMITS.items) }),
]);

/** The English words a 中文 block was made from, as a fingerprint (chinese-version.ts `wordsFingerprint`). */
const Fingerprint = z.string().regex(/^[0-9a-z]{1,16}$/, "A fingerprint is a few letters and digits.");

/**
 * One block's 中文 words, by its type: only what a customer reads (a
 * heading's text, a text block's runs, button labels, alt text, a hero's and
 * an image + text's heading, line and button label, a products block's
 * label). Everything else, the order, images, products, targets, links and
 * options, is the English block's: one layout, two sets of words. A part the
 * English block has but these leave out reads as empty.
 */
function chineseWordsSchema({ required }: { required: boolean }) {
  const { words } = wordsSchemas({ required });
  const from = Fingerprint;
  const label = () => words(CONTENT_LIMITS.buttonLabel, "Give the button a label.");
  const alt = () => words(CONTENT_LIMITS.alt, "Describe the image for anyone who can't see it.");
  const heading = () => words(CONTENT_LIMITS.heading, "Write the heading.", { variables: true });
  const paragraphs = (max: number) => z.array(ChineseParagraphSchema).max(max);
  const text = textChecks({ required });
  return z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal("heading"), from, text: heading() }),
    z.strictObject({ type: z.literal("text"), from, paragraphs: paragraphs(CONTENT_LIMITS.paragraphs) }).superRefine(text(CONTENT_LIMITS.text)),
    z.strictObject({ type: z.literal("buttons"), from, labels: z.array(label()).max(2) }),
    // A decorative image says nothing, in either language: no alt to translate.
    z.strictObject({ type: z.literal("image"), from, alt: alt().optional() }),
    z.strictObject({
      type: z.literal("hero"),
      from,
      alt: alt().optional(),
      heading: heading().optional(),
      line: words(CONTENT_LIMITS.line, "Write the line.", { variables: true }).optional(),
      buttonLabel: label().optional(),
    }),
    z
      .strictObject({ type: z.literal("split"), from, alt: alt(), heading: heading(), paragraphs: paragraphs(CONTENT_LIMITS.splitParagraphs), buttonLabel: label().optional() })
      .superRefine(text(CONTENT_LIMITS.splitText)),
    z.strictObject({ type: z.literal("products"), from, buttonLabel: label() }),
  ]);
}

/**
 * A campaign's 中文 version: its subject and preview line, the Variables'
 * fallback words in Chinese (*您* for a first name), and each block's words
 * by block id. `from` is the English subject and preview line it was made
 * from. A block with no entry is not translated yet; a divider or a spacer
 * has no words and never needs one.
 */
function chineseVersionSchema({ required }: { required: boolean }) {
  const { words } = wordsSchemas({ required });
  return z
    .strictObject({
      subject: words(CONTENT_LIMITS.subject, "Write the subject.", { variables: true }),
      preheader: z
        .string()
        .trim()
        .max(CONTENT_LIMITS.preheader, most(CONTENT_LIMITS.preheader))
        .refine(noTags, NO_TAGS)
        .superRefine((v, ctx) => {
          const unknown = required ? unknownVariableMessage(v) : null;
          if (unknown) ctx.addIssue({ code: "custom", message: unknown });
        }),
      from: Fingerprint,
      fallbacks: z.partialRecord(z.enum(VARIABLE_KEYS), z.string().trim().max(VARIABLE_MAX, most(VARIABLE_MAX)).refine(noTags, NO_TAGS)),
      blocks: z.record(BlockId, chineseWordsSchema({ required })),
      // The blocks whose 中文 words Claude wrote that no person has edited or kept yet,
      // shown *Drafted with AI* in 中文 (PRD decision 9), as `aiDrafted` is for the English.
      aiDrafted: z.array(BlockId).max(CONTENT_LIMITS.blocks).optional(),
    })
    .superRefine((t, ctx) => {
      if (Object.keys(t.blocks).length > CONTENT_LIMITS.blocks) ctx.addIssue({ code: "custom", path: ["blocks"], message: `At most ${CONTENT_LIMITS.blocks} blocks.` });
    });
}

function contentSchema({ required }: { required: boolean }) {
  const blocks = z.array(blockSchema({ required })).max(CONTENT_LIMITS.blocks, `At most ${CONTENT_LIMITS.blocks} blocks.`);
  return z
    .strictObject({
      v: z.literal(CONTENT_VERSION),
      blocks: required ? blocks.min(1, "Add a block to the email.") : blocks,
      fallbacks: z.partialRecord(
        z.enum(VARIABLE_KEYS),
        z.string().trim().max(VARIABLE_MAX, most(VARIABLE_MAX)).refine(noTags, NO_TAGS),
      ),
      // The blocks Claude wrote that no person has edited or kept yet, shown
      // *Drafted with AI* (slice 09); the send checklist counts any left.
      aiDrafted: z.array(BlockId).max(CONTENT_LIMITS.blocks).optional(),
      // The 中文 version (slice 17), in the content so the schema, the size
      // check and the lock cover it: a started campaign's Chinese words are as fixed as its English.
      translations: z.strictObject({ [CHINESE]: chineseVersionSchema({ required }).optional() }).optional(),
    })
    .superRefine((c, ctx) => {
      const seen = new Set<string>();
      c.blocks.forEach((b, i) => {
        if (seen.has(b.id)) ctx.addIssue({ code: "custom", path: ["blocks", i, "id"], message: "Two blocks share an id." });
        seen.add(b.id);
      });
      if (new TextEncoder().encode(JSON.stringify(c)).length > CONTENT_LIMITS.bytes) {
        ctx.addIssue({ code: "custom", path: ["blocks"], message: "The email is too long: make it shorter." });
      }
    });
}

/** One block as saved: every word written. */
export const EmailBlockSchema = blockSchema({ required: true });

/** One block's 中文 words as saved (slice 17): what a translation's words are checked against, as Save checks them. */
export const ChineseBlockWordsSchema = chineseWordsSchema({ required: true });

/**
 * What a campaign saves: every check, with every word written. The one
 * schema Staff's edits and Claude's drafts pass alike.
 */
export const CampaignContentSchema = contentSchema({ required: true });

/**
 * What the preview and the renderer take: the same checks with the words
 * allowed empty, so an empty block shows its placeholder. Never what Save
 * accepts: a placeholder is never a value.
 */
export const CampaignContentPreviewSchema = contentSchema({ required: false });

export type CampaignContent = z.output<typeof CampaignContentSchema>;
export type EmailBlock = CampaignContent["blocks"][number];
export type BlockButton = Extract<EmailBlock, { type: "buttons" }>["buttons"][number];
export type SpacerSize = (typeof SPACER_SIZES)[number];
export type ImageBlock = Extract<EmailBlock, { type: "image" }>;
export type HeroBlock = Extract<EmailBlock, { type: "hero" }>;
export type SplitBlock = Extract<EmailBlock, { type: "split" }>;
export type ProductsBlock = Extract<EmailBlock, { type: "products" }>;
/** A campaign's 中文 version (slice 17): its subject, preview line, fallbacks and each block's words. */
export type ChineseVersion = NonNullable<NonNullable<CampaignContent["translations"]>[typeof CHINESE]>;
/** One block's 中文 words, by its type. */
export type ChineseBlockWords = ChineseVersion["blocks"][string];
export type ChineseParagraph = z.output<typeof ChineseParagraphSchema>;
export type ChineseRun = z.output<typeof ChineseTextRunSchema> | { var: VariableKey };
/** An image a block places: its Media Asset and alt text. */
export type BlockImage = ImageBlock["image"];
/** Where an image goes when tapped. */
export type BlockLink = NonNullable<ImageBlock["link"]>;

/** No blocks yet: where a new campaign starts. */
export const EMPTY_CAMPAIGN_CONTENT: CampaignContent = { v: CONTENT_VERSION, blocks: [], fallbacks: {} };

/**
 * Pure — the blocks still marked *Drafted with AI* (slice 09), in order: Claude
 * wrote them and no person has edited or kept them yet. The send checklist's
 * advisory (slice 11). An id whose block is gone counts for nothing.
 */
export function aiDraftedBlocks(content: CampaignContent): EmailBlock[] {
  const marked = new Set(content.aiDrafted ?? []);
  return marked.size ? content.blocks.filter((b) => marked.has(b.id)) : [];
}

/** Paragraphs and bullets of some kind of run: a text block's, or its 中文 version's (slice 17). */
export type ParagraphOf<R> = { kind: "p"; runs: R[] } | { kind: "bullets"; items: R[][] };

/** A run as its words read: some words, or a Variable. */
type WordsRun = { text: string } | { var: VariableKey };

/** Pure — every run of a text block's paragraphs, in order. */
export function paragraphRuns<R = Run>(paragraphs: readonly ParagraphOf<R>[]): R[] {
  return paragraphs.flatMap((p) => (p.kind === "p" ? p.runs : p.items.flat()));
}

/** A text block's words, a Variable as `{name}`. */
const textWords = (paragraphs: readonly ParagraphOf<WordsRun>[]) =>
  paragraphRuns(paragraphs)
    .map((r) => ("var" in r ? `{${r.var}}` : r.text))
    .join("");

/**
 * Pure — each address a text block's paragraphs link to, once, in order: what
 * slice 10's rewrite keys `L1`, `L2`, and what a 中文 run's `link` counts
 * from (slice 17).
 */
export function paragraphLinks(paragraphs: readonly Paragraph[]): string[] {
  return [...new Set(paragraphRuns(paragraphs).flatMap((r) => ("href" in r && r.href ? [r.href] : [])))];
}

/** A new block's id: twelve random letters and digits, which needs no secure context. */
export function newBlockId(): string {
  const bytes = new Uint8Array(12);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
}

/**
 * A new block of `type`: its words empty, on their placeholders (decision 7),
 * never sample words. Its choices start on the plainest: a medium heading,
 * one primary button to the shop, a full-width image with no link, a hero
 * with every part, an image + text with its image on the left and a button,
 * products side by side with the shop's own *Shop now*, a medium spacer.
 */
export function emptyBlock(type: EmailBlockType, id: string = newBlockId()): EmailBlock {
  switch (type) {
    case "heading":
      return { id, type, level: 2, text: "" };
    case "text":
      return { id, type, paragraphs: [] };
    case "buttons":
      return { id, type, buttons: [{ label: "", target: "shop", style: "primary" }] };
    case "image":
      return { id, type, image: { asset: "", alt: "" }, width: "full" };
    case "hero":
      return { id, type, image: { asset: "", alt: "" }, heading: "", line: "", button: { label: "", target: "shop", style: "primary" } };
    case "split":
      return { id, type, image: { asset: "", alt: "" }, side: "left", heading: "", paragraphs: [], button: { label: "", target: "shop", style: "primary" } };
    case "products":
      return { id, type, products: [], layout: "side_by_side", buttonLabel: PRODUCT_BUTTON_LABEL };
    case "divider":
      return { id, type };
    case "spacer":
      return { id, type, size: "m" };
  }
}

/** An image's alt text, which a screen reader reads; a decorative image has none. */
const altWords = (im: BlockImage) => (im.decorative || !im.alt ? [] : [im.alt]);

/** Pure — every word a customer reads in the blocks, a Variable as `{name}`: what the points rule reads. */
export function contentWords(content: CampaignContent): string[] {
  return content.blocks.flatMap((b) => {
    switch (b.type) {
      case "heading":
        return [b.text];
      case "text":
        return [textWords(b.paragraphs)];
      case "buttons":
        return b.buttons.map((x) => x.label);
      case "image":
        return altWords(b.image);
      case "hero":
        return [...altWords(b.image), ...[b.heading, b.line, b.button?.label].filter((w): w is string => w !== undefined)];
      case "split":
        return [...altWords(b.image), b.heading, textWords(b.paragraphs), ...(b.button ? [b.button.label] : [])];
      // A product's name and price are the shop's, not the campaign's words.
      case "products":
        return [b.buttonLabel];
      default:
        return [];
    }
  });
}

/**
 * Pure — every Media Asset the blocks place, once each, in order (slice 05):
 * whose email renditions the sender reads, and what the Media Library counts
 * as Used. Any block with an `image` counts, so a later one does too.
 */
export function imageAssetsIn(content: CampaignContent): string[] {
  return [...new Set(content.blocks.flatMap((b) => ("image" in b && b.image.asset ? [b.image.asset] : [])))];
}

/**
 * Pure — the Variables the email uses, once each, in order: in `lines` (the
 * subject and preview line, which take the same fallbacks), then in the
 * blocks' words, whatever their type (`contentWords`).
 */
export function variablesUsed(content: CampaignContent, lines: readonly string[] = []): VariableKey[] {
  return [...new Set([...lines, ...contentWords(content)].flatMap((l) => placeholdersIn(l).filter(isVariableKey)))];
}

/**
 * The fields sent as written, never with a Variable filled in: a block's id
 * and type, a link, a button's label (a products block's `buttonLabel` too,
 * slice 07) and an image's alt text (decision 3).
 */
const SENT_AS_WRITTEN: ReadonlySet<string> = new Set(["id", "type", "label", "buttonLabel", "alt", "url", "href"]);

/**
 * Pure — the blocks as one recipient reads them (slice 13): each Variable run
 * becomes its words, and each `{name}` written in a block's words is filled,
 * in every block type alike, so a new type's headings and lines take
 * Variables with no code of their own. Links, button labels and alt text stay
 * as written. Each value is one line of words; the renderer escapes it.
 */
export function fillVariables(content: CampaignContent, values: Record<VariableKey, string>): CampaignContent {
  const fill = (v: unknown, field: string | null): unknown => {
    if (typeof v === "string") return field !== null && SENT_AS_WRITTEN.has(field) ? v : fillCopy(v, values);
    if (Array.isArray(v)) return v.map((x) => fill(x, null));
    if (!v || typeof v !== "object") return v;
    if ("var" in v && typeof v.var === "string" && isVariableKey(v.var)) return { text: values[v.var] };
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x, k)]));
  };
  return { ...content, blocks: content.blocks.map((b) => fill(b, null) as EmailBlock) };
}

/** Pure — a block's buttons: a buttons block's one or two, a hero's or an image + text's own. */
export function buttonsOf(b: EmailBlock): BlockButton[] {
  if (b.type === "buttons") return b.buttons;
  if ((b.type === "hero" || b.type === "split") && b.button) return [b.button];
  return [];
}

/** Pure — a button anywhere in the blocks goes to the recipient's sign-in, so the sender mints Claim links. */
export function contentSignsIn(content: CampaignContent): boolean {
  return content.blocks.some((b) => buttonsOf(b).some((x) => x.target === "sign_in"));
}

/**
 * Pure — every Storefront product the email shows or links to, once each, in
 * order (slice 07): a products block's, and a product button's. What the
 * sender reads from the shop at render, and what must still be Listed before
 * a wave.
 */
export function productsIn(content: CampaignContent): string[] {
  const ids = content.blocks.flatMap((b) => [
    ...(b.type === "products" ? b.products : []),
    ...buttonsOf(b).flatMap((x) => (x.target === "product" && x.product ? [x.product] : [])),
  ]);
  return [...new Set(ids.filter(Boolean))];
}

/** `{a}, {b} and {c}`. */
const listed = (names: readonly string[]) => {
  const all = names.map((v) => `{${v}}`);
  return all.length > 1 ? `${all.slice(0, -1).join(", ")} and ${all.at(-1)}` : (all[0] ?? "");
};

/** Pure — a heading, the subject, the preview line or a text block names a `{name}` that is not a Variable: the message, or null. */
export function unknownVariableMessage(text: string): string | null {
  const unknown = unknownVariablesIn(text);
  if (!unknown.length) return null;
  return `${listed(unknown)} ${unknown.length === 1 ? "is not a Variable" : "are not Variables"}: the Variables are ${listed(VARIABLE_KEYS)}.`;
}

/** Pure — words the sender never fills (a button label) name a `{name}`: the message, or null. */
function sentAsWrittenMessage(text: string): string | null {
  const named = placeholdersIn(text);
  if (!named.length) return null;
  return unknownVariableMessage(text) ?? `${listed(named)} can go in a heading, a text block, the subject or the preview line, not here.`;
}

// ---------------------------------------------------------------------------
// Convert to blocks
// ---------------------------------------------------------------------------

/** One legacy paragraph's lines as runs: words, its https links as links shown as `mpillow.com/…`, lines kept apart. */
function legacyLineRuns(lines: readonly string[]): TextRun[] {
  const out: TextRun[] = [];
  const add = (r: TextRun) => {
    const last = out.at(-1);
    if (last && !last.href && !r.href) last.text += r.text;
    else out.push(r);
  };
  lines.forEach((line, i) => {
    if (i > 0) add({ text: "\n" });
    for (const part of bodyLineParts(line)) add("url" in part ? { text: linkLabel(part.url), href: part.url } : { text: part.text });
  });
  return out;
}

/**
 * Pure — *Convert to blocks*: a legacy draft as blocks that render the same
 * words (slice 03). The subject, which the legacy email shows as its title,
 * becomes the opening heading; each `## ` line a heading; the paragraphs and
 * bullets between them one text block; the button a buttons block at the end,
 * where the legacy button sat. Bullets stay plain words, as they rendered.
 */
export function contentFromLegacy(
  d: { subject: string; body: string; button: { target: "sign_in" | "url"; label: string; url: string | null } | null },
  id: () => string = newBlockId,
): CampaignContent {
  const blocks: EmailBlock[] = [];
  const subject = d.subject.replace(/\s+/g, " ").trim();
  if (subject) blocks.push({ id: id(), type: "heading", level: 1, text: subject });
  let text: Extract<EmailBlock, { type: "text" }> | null = null;
  const paragraph = (p: Paragraph) => {
    if (!text || text.paragraphs.length >= CONTENT_LIMITS.paragraphs) {
      text = { id: id(), type: "text", paragraphs: [] };
      blocks.push(text);
    }
    text.paragraphs.push(p);
  };
  for (const part of parseCampaignBody(d.body)) {
    if (part.kind === "heading") {
      text = null;
      blocks.push({ id: id(), type: "heading", level: 2, text: part.text });
    } else if (part.kind === "paragraph") {
      paragraph({ kind: "p", runs: legacyLineRuns(part.lines) });
    } else {
      for (let i = 0; i < part.items.length; i += CONTENT_LIMITS.items) {
        paragraph({ kind: "bullets", items: part.items.slice(i, i + CONTENT_LIMITS.items).map((item) => [{ text: item }]) });
      }
    }
  }
  if (d.button) {
    const { target, label, url } = d.button;
    blocks.push({
      id: id(),
      type: "buttons",
      buttons: [target === "url" ? { label, target, url: url ?? "", style: "primary" } : { label, target, style: "primary" }],
    });
  }
  return { v: CONTENT_VERSION, blocks, fallbacks: {} };
}
