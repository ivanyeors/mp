import { z } from "zod";
import { bodyLineParts, linkLabel, parseCampaignBody } from "@/lib/email/campaign-body";
import { fillCopy, placeholdersIn } from "@/lib/email/copy";
import { isVariableKey, unknownVariablesIn, VARIABLE_KEYS, VARIABLE_MAX, type VariableKey } from "./variables";

export const EMAIL_BLOCK_TYPES = ["heading", "text", "buttons", "image", "hero", "split", "products", "divider", "spacer"] as const;
export type EmailBlockType = (typeof EMAIL_BLOCK_TYPES)[number];

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

export const BLOCK_BUTTON_TARGETS = ["sign_in", "shop", "book_fitting", "customise_mpillow", "customise_mbolster", "product", "url"] as const;
export type BlockButtonTarget = (typeof BLOCK_BUTTON_TARGETS)[number];

export type SiteButtonTarget = Exclude<BlockButtonTarget, "sign_in" | "product" | "url">;

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

export const IMAGE_LINK_TARGETS = ["shop", "book_fitting", "customise_mpillow", "customise_mbolster", "url"] as const satisfies readonly BlockButtonTarget[];
export type ImageLinkTarget = (typeof IMAGE_LINK_TARGETS)[number];

export const IMAGE_WIDTHS = ["full", "inset"] as const;
export type ImageWidth = (typeof IMAGE_WIDTHS)[number];

export const SPLIT_SIDES = ["left", "right"] as const;
export type SplitSide = (typeof SPLIT_SIDES)[number];

export const PRODUCT_LAYOUTS = ["rows", "side_by_side"] as const;
export type ProductLayout = (typeof PRODUCT_LAYOUTS)[number];

export const PRODUCT_BUTTON_LABEL = "Shop now";

export const CONTENT_VERSION = 1;

export const CONTENT_LIMITS = {
  blocks: 40,
  heading: 120,
  buttonLabel: 40,
  url: 500,
  text: 10000,
  paragraphs: 50,
  items: 30,
  runs: 200,
  alt: 150,
  line: 200,
  splitText: 500,
  splitParagraphs: 4,
  products: 3,
  subject: 150,
  preheader: 200,
  bytes: 200_000,
} as const;

export const CONTENT_PLACEHOLDERS = {
  heading: "e.g. Sleep cooler this December",
  text: "Write a few lines.",
  empty: "Add a block to start the email: a heading, some text, a button.",
  image: "Choose an image from the Media Library.",
  imageUnavailable: "This image can't be shown in an email. Choose it again, or another.",
  line: "e.g. Our coolest covers, back in every size.",
  products: "Choose up to three products from the shop.",
  productUnavailable: "This product is no longer in the shop: remove it or list it again.",
} as const;

export function isHttpsUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && Boolean(u.hostname) && !/\s/.test(value);
  } catch {
    return false;
  }
}

const TAG = /<\/?[a-z!][^<>]*>/i;
const noTags = (v: string) => !TAG.test(v);
const NO_TAGS = "Words only: no HTML tags.";

const most = (max: number) => `At most ${max.toLocaleString("en-SG")} characters.`;

const ALT_OR_DECORATIVE = "Describe the image for anyone who can't see it, or mark it decorative.";
export const LINKED_IMAGE_ALT = "A linked image needs alt text: it is what the link says.";

const httpsLink = z
  .string()
  .max(CONTENT_LIMITS.url, most(CONTENT_LIMITS.url))
  .refine(isHttpsUrl, "A link must be a full https:// address.");

const TextRunSchema = z.strictObject({
  text: z.string().min(1).max(CONTENT_LIMITS.text, most(CONTENT_LIMITS.text)).refine(noTags, NO_TAGS),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  href: httpsLink.optional(),
});

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

const BlockId = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, "A block id is 1 to 40 letters, digits, - or _.");

const ASSET_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const PRODUCT_ID = ASSET_ID;

function wordsSchemas({ required }: { required: boolean }) {
  const words = (max: number, empty: string, { variables = false }: { variables?: boolean } = {}) => {
    const s = (required ? z.string().trim().min(1, empty) : z.string().trim()).max(max, most(max)).refine(noTags, NO_TAGS);
    if (!required) return s;
    return s.superRefine((v, ctx) => {
      const unfilled = variables ? unknownVariableMessage(v) : sentAsWrittenMessage(v);
      if (unfilled) ctx.addIssue({ code: "custom", message: unfilled });
    });
  };

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

function blockSchema({ required }: { required: boolean }) {
  const { words, optionalWords } = wordsSchemas({ required });

  const asset = required
    ? z.string().regex(ASSET_ID, "Choose an image.")
    : z.string().refine((v) => v === "" || ASSET_ID.test(v), "An image is a Media Asset's id.");
  const imageFields = z.strictObject({ asset, alt: optionalWords(CONTENT_LIMITS.alt), decorative: z.boolean().optional() });
  const image = imageFields.superRefine((im, ctx) => {
    if (required && !im.decorative && !im.alt) ctx.addIssue({ code: "custom", path: ["alt"], message: ALT_OR_DECORATIVE });
  });
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
        image: imageFields,
        link: imageLink.optional(),
        width: z.enum(IMAGE_WIDTHS),
      })
      .superRefine((b, ctx) => {
        if (!required) return;
        const said = Boolean(b.image.alt) && !b.image.decorative;
        const mustSay = Boolean(b.link) || !b.image.decorative;
        if (mustSay && !said) ctx.addIssue({ code: "custom", path: ["image", "alt"], message: b.link ? LINKED_IMAGE_ALT : ALT_OR_DECORATIVE });
      }),
    z.strictObject({
      id: BlockId,
      type: z.literal("hero"),
      image,
      heading: words(CONTENT_LIMITS.heading, "Write the heading, or remove it.", { variables: true }).optional(),
      line: words(CONTENT_LIMITS.line, "Write the line, or remove it.", { variables: true }).optional(),
      button: button.optional(),
    }),
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

export const CHINESE = "zh-CN" as const;

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

const Fingerprint = z.string().regex(/^[0-9a-z]{1,16}$/, "A fingerprint is a few letters and digits.");

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
      aiDrafted: z.array(BlockId).max(CONTENT_LIMITS.blocks).optional(),
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

export const EmailBlockSchema = blockSchema({ required: true });

export const ChineseBlockWordsSchema = chineseWordsSchema({ required: true });

export const CampaignContentSchema = contentSchema({ required: true });

export const CampaignContentPreviewSchema = contentSchema({ required: false });

export type CampaignContent = z.output<typeof CampaignContentSchema>;
export type EmailBlock = CampaignContent["blocks"][number];
export type BlockButton = Extract<EmailBlock, { type: "buttons" }>["buttons"][number];
export type SpacerSize = (typeof SPACER_SIZES)[number];
export type ImageBlock = Extract<EmailBlock, { type: "image" }>;
export type HeroBlock = Extract<EmailBlock, { type: "hero" }>;
export type SplitBlock = Extract<EmailBlock, { type: "split" }>;
export type ProductsBlock = Extract<EmailBlock, { type: "products" }>;
export type ChineseVersion = NonNullable<NonNullable<CampaignContent["translations"]>[typeof CHINESE]>;
export type ChineseBlockWords = ChineseVersion["blocks"][string];
export type ChineseParagraph = z.output<typeof ChineseParagraphSchema>;
export type ChineseRun = z.output<typeof ChineseTextRunSchema> | { var: VariableKey };
export type BlockImage = ImageBlock["image"];
export type BlockLink = NonNullable<ImageBlock["link"]>;

export const EMPTY_CAMPAIGN_CONTENT: CampaignContent = { v: CONTENT_VERSION, blocks: [], fallbacks: {} };

export function aiDraftedBlocks(content: CampaignContent): EmailBlock[] {
  const marked = new Set(content.aiDrafted ?? []);
  return marked.size ? content.blocks.filter((b) => marked.has(b.id)) : [];
}

export type ParagraphOf<R> = { kind: "p"; runs: R[] } | { kind: "bullets"; items: R[][] };

type WordsRun = { text: string } | { var: VariableKey };

export function paragraphRuns<R = Run>(paragraphs: readonly ParagraphOf<R>[]): R[] {
  return paragraphs.flatMap((p) => (p.kind === "p" ? p.runs : p.items.flat()));
}

const textWords = (paragraphs: readonly ParagraphOf<WordsRun>[]) =>
  paragraphRuns(paragraphs)
    .map((r) => ("var" in r ? `{${r.var}}` : r.text))
    .join("");

export function paragraphLinks(paragraphs: readonly Paragraph[]): string[] {
  return [...new Set(paragraphRuns(paragraphs).flatMap((r) => ("href" in r && r.href ? [r.href] : [])))];
}

export function newBlockId(): string {
  const bytes = new Uint8Array(12);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
}

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

const altWords = (im: BlockImage) => (im.decorative || !im.alt ? [] : [im.alt]);

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
      case "products":
        return [b.buttonLabel];
      default:
        return [];
    }
  });
}

export function imageAssetsIn(content: CampaignContent): string[] {
  return [...new Set(content.blocks.flatMap((b) => ("image" in b && b.image.asset ? [b.image.asset] : [])))];
}

export function variablesUsed(content: CampaignContent, lines: readonly string[] = []): VariableKey[] {
  return [...new Set([...lines, ...contentWords(content)].flatMap((l) => placeholdersIn(l).filter(isVariableKey)))];
}

const SENT_AS_WRITTEN: ReadonlySet<string> = new Set(["id", "type", "label", "buttonLabel", "alt", "url", "href"]);

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

export function buttonsOf(b: EmailBlock): BlockButton[] {
  if (b.type === "buttons") return b.buttons;
  if ((b.type === "hero" || b.type === "split") && b.button) return [b.button];
  return [];
}

export function contentSignsIn(content: CampaignContent): boolean {
  return content.blocks.some((b) => buttonsOf(b).some((x) => x.target === "sign_in"));
}

export function productsIn(content: CampaignContent): string[] {
  const ids = content.blocks.flatMap((b) => [
    ...(b.type === "products" ? b.products : []),
    ...buttonsOf(b).flatMap((x) => (x.target === "product" && x.product ? [x.product] : [])),
  ]);
  return [...new Set(ids.filter(Boolean))];
}

const listed = (names: readonly string[]) => {
  const all = names.map((v) => `{${v}}`);
  return all.length > 1 ? `${all.slice(0, -1).join(", ")} and ${all.at(-1)}` : (all[0] ?? "");
};

export function unknownVariableMessage(text: string): string | null {
  const unknown = unknownVariablesIn(text);
  if (!unknown.length) return null;
  return `${listed(unknown)} ${unknown.length === 1 ? "is not a Variable" : "are not Variables"}: the Variables are ${listed(VARIABLE_KEYS)}.`;
}

function sentAsWrittenMessage(text: string): string | null {
  const named = placeholdersIn(text);
  if (!named.length) return null;
  return unknownVariableMessage(text) ?? `${listed(named)} can go in a heading, a text block, the subject or the preview line, not here.`;
}

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
