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
import { placeholdersIn } from "@/lib/email/copy";
import { isVariableKey, unknownVariablesIn, VARIABLE_KEYS, VARIABLE_MAX, type VariableKey } from "./variables";

export const EMAIL_BLOCK_TYPES = ["heading", "text", "buttons", "image", "hero", "divider", "spacer"] as const;
export type EmailBlockType = (typeof EMAIL_BLOCK_TYPES)[number];

/**
 * Where a block's button goes. The sender resolves each to an absolute URL on
 * the live origin with the campaign's UTMs: Staff never type a site link.
 * `sign_in` is the recipient's own Claim link when they have one, else their
 * account, as the single button does today; `url` is a link Staff type, https
 * only. Slice 07 adds a product.
 */
export const BLOCK_BUTTON_TARGETS = ["sign_in", "shop", "book_fitting", "customise_mpillow", "customise_mbolster", "url"] as const;
export type BlockButtonTarget = (typeof BLOCK_BUTTON_TARGETS)[number];

export type SiteButtonTarget = Exclude<BlockButtonTarget, "sign_in" | "url">;

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

/**
 * The block types. Saving needs every word (`required`); the preview takes
 * them empty, so a new block shows its placeholders.
 */
function blockSchema({ required }: { required: boolean }) {
  const words = (max: number, empty: string) => {
    const s = (required ? z.string().trim().min(1, empty) : z.string().trim()).max(max, most(max)).refine(noTags, NO_TAGS);
    // A heading and a button label are sent as written: a `{name}` would reach the customer in braces.
    if (!required) return s;
    return s.superRefine((v, ctx) => {
      const unfilled = sentAsWrittenMessage(v);
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

  // An image from the Media Library (slice 05): its asset, empty until one is
  // chosen, and its alt text, or `decorative` for one that says nothing a
  // reader would miss (empty alt, role="presentation"). The email shows the
  // asset's email rendition, which the sender reads at render; the content
  // holds no URL of its own.
  const image = z
    .strictObject({
      asset: required
        ? z.string().regex(ASSET_ID, "Choose an image.")
        : z.string().refine((v) => v === "" || ASSET_ID.test(v), "An image is a Media Asset's id."),
      alt: optionalWords(CONTENT_LIMITS.alt),
      decorative: z.boolean().optional(),
    })
    .superRefine((im, ctx) => {
      if (required && !im.decorative && !im.alt) {
        ctx.addIssue({ code: "custom", path: ["alt"], message: "Describe the image for anyone who can't see it, or mark it decorative." });
      }
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

  const button = z
    .strictObject({
      label: words(CONTENT_LIMITS.buttonLabel, "Give the button a label."),
      target: z.enum(BLOCK_BUTTON_TARGETS),
      url: z.string().trim().max(CONTENT_LIMITS.url, most(CONTENT_LIMITS.url)).optional(),
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
    });

  return z.discriminatedUnion("type", [
    z.strictObject({
      id: BlockId,
      type: z.literal("heading"),
      level: z.union([z.literal(1), z.literal(2)]),
      text: words(CONTENT_LIMITS.heading, "Write the heading."),
    }),
    z
      .strictObject({
        id: BlockId,
        type: z.literal("text"),
        paragraphs: z.array(ParagraphSchema).max(CONTENT_LIMITS.paragraphs),
      })
      .superRefine((b, ctx) => {
        const all = paragraphRuns(b.paragraphs);
        const length = all.reduce((n, r) => n + ("text" in r ? r.text.length : 0), 0);
        if (length > CONTENT_LIMITS.text) ctx.addIssue({ code: "custom", path: ["paragraphs"], message: most(CONTENT_LIMITS.text) });
        if (required && !all.some((r) => "var" in r || r.text.trim())) {
          ctx.addIssue({ code: "custom", path: ["paragraphs"], message: "Write the text." });
        }
        // A `{name}` the box kept as words is sent in braces.
        const unknown = required ? unknownVariableMessage(textWords(b.paragraphs)) : null;
        if (unknown) ctx.addIssue({ code: "custom", path: ["paragraphs"], message: unknown });
      }),
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
      heading: words(CONTENT_LIMITS.heading, "Write the heading, or remove it.").optional(),
      line: words(CONTENT_LIMITS.line, "Write the line, or remove it.").optional(),
      button: button.optional(),
    }),
    z.strictObject({ id: BlockId, type: z.literal("divider") }),
    z.strictObject({ id: BlockId, type: z.literal("spacer"), size: z.enum(SPACER_SIZES) }),
  ]);
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
/** An image a block places: its Media Asset and alt text. */
export type BlockImage = ImageBlock["image"];
/** Where an image goes when tapped. */
export type BlockLink = NonNullable<ImageBlock["link"]>;

/** No blocks yet: where a new campaign starts. */
export const EMPTY_CAMPAIGN_CONTENT: CampaignContent = { v: CONTENT_VERSION, blocks: [], fallbacks: {} };

/** Pure — every run of a text block's paragraphs, in order. */
export function paragraphRuns(paragraphs: readonly Paragraph[]): Run[] {
  return paragraphs.flatMap((p) => (p.kind === "p" ? p.runs : p.items.flat()));
}

/** A text block's words, a Variable as `{name}`. */
const textWords = (paragraphs: readonly Paragraph[]) => paragraphRuns(paragraphs).map((r) => ("var" in r ? `{${r.var}}` : r.text)).join("");

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
 * with every part, a medium spacer.
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
 * subject and preview line, which take the same fallbacks), then in the blocks.
 */
export function variablesUsed(content: CampaignContent, lines: readonly string[] = []): VariableKey[] {
  const written = lines.flatMap((l) => placeholdersIn(l).filter(isVariableKey));
  const used = content.blocks.flatMap((b) => (b.type === "text" ? paragraphRuns(b.paragraphs) : []));
  return [...new Set([...written, ...used.flatMap((r) => ("var" in r ? [r.var] : []))])];
}

/** Pure — a button anywhere in the blocks goes to the recipient's sign-in, so the sender mints Claim links. */
export function contentSignsIn(content: CampaignContent): boolean {
  return content.blocks.some(
    (b) => (b.type === "buttons" && b.buttons.some((x) => x.target === "sign_in")) || (b.type === "hero" && b.button?.target === "sign_in"),
  );
}

/** Pure — the subject, preview line or a text block names a `{name}` that is not a Variable: the message, or null. */
export function unknownVariableMessage(text: string): string | null {
  const unknown = unknownVariablesIn(text);
  if (!unknown.length) return null;
  return `${unknown.map((v) => `{${v}}`).join(", ")} ${unknown.length === 1 ? "is not a Variable" : "are not Variables"}: only {first_name} is.`;
}

/** Pure — words the sender never fills (a heading, a button label) name a `{name}`: the message, or null. */
function sentAsWrittenMessage(text: string): string | null {
  const named = placeholdersIn(text);
  if (!named.length) return null;
  return unknownVariableMessage(text) ?? `${named.map((v) => `{${v}}`).join(", ")} can go in a text block, the subject or the preview line, not here.`;
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
