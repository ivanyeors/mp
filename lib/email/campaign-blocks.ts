// ============================================================
// Campaign emails built from typed blocks: Admin Panel → Email campaigns
// ============================================================
//
// PRD-campaign-email-editor slice 03 (ADR 0036). Staff build the email from
// Email blocks (lib/email-campaigns/content.ts); this walks them into the
// shared components inside the branded shell, so the logo, fonts, dark mode
// and the footer with its unsubscribe link are those of every email. It is
// campaign mail: the sender sends it through the campaign transport only.
//
// Nothing typed ever becomes markup. The content is checked against its schema
// first, so an unknown block type or field, a tag in the words or a link that
// is not https throws rather than renders; then every word is escaped by the
// components and every link goes through safeUrl. A run's link shows its own
// words, never the URL.
//
// Pure: the sender gives each Variable's words for the recipient (`values`),
// which fill the subject, the preview line and every block's words alike
// (`fillVariables`, slice 13), resolves each button's and image link's target
// to its link, reads each image's email rendition (slice 05), which it passes
// in `images`, and reads each product from the shop as it is sold now (slice
// 07), which it passes in `products`: a product's name, photo and price are
// never the campaign's. As with the legacy renderer, only the editor's preview
// passes `placeholders`, drawn dashed and muted where an empty field's words
// would go; a send never does.
//
// Every block's outer element carries `data-block-id`, in the preview and in
// every send alike, so the preview stays the email a test delivers and a click
// on a block in it selects that block's card (slice 04). An inbox ignores it.
//
// Campaigns written before the blocks keep lib/email/campaigns.ts.

import { renderEmailShell } from "./base";
import { COMPOSED_CAMPAIGN_NOTE } from "./campaigns";
import {
  bulletListHtml,
  button,
  buttonPair,
  columns,
  divider,
  emailImage,
  heading,
  linkHtml,
  paragraph,
  paragraphHtml,
  placeholderHint,
  spacer,
  STACK_BELOW,
  type ButtonOptions,
} from "./components";
import { fillCopy } from "./copy";
import { money } from "./format";
import { escapeAttr, escapeHtml, stripTags } from "./html";
import { css, LAYOUT, LIGHT, SPACE } from "./theme";
import type { RenderedEmail } from "./types";
import {
  CampaignContentPreviewSchema,
  fillVariables,
  type BlockButton,
  type BlockImage,
  type BlockLink,
  type CampaignContent,
  type EmailBlock,
  type ImageWidth,
  type Paragraph,
  type ProductsBlock,
  type Run,
  type SpacerSize,
} from "@/lib/email-campaigns/content";
import type { VariableKey } from "@/lib/email-campaigns/variables";

/** What an empty block field shows in the editor's preview. */
export interface CampaignBlocksPlaceholders {
  heading: string;
  text: string;
  buttonLabel: string;
  /** An email with no blocks yet. */
  empty: string;
  /** An image block with no image chosen yet. */
  image: string;
  /** An image chosen whose email rendition is not in `images`. */
  imageUnavailable: string;
  /** A hero's empty line. */
  line: string;
  /** A products block with no product chosen yet. */
  products: string;
  /** A product chosen that is not in `products`: no longer Listed, or gone. */
  productUnavailable: string;
}

/**
 * A placed image as the email shows it: its Media Asset's email rendition
 * (lib/media-assets/email-renditions.ts), a JPEG or PNG at most 1,200px wide.
 */
export interface CampaignBlockImage {
  /** The rendition's absolute URL. */
  url: string;
  width: number;
  height: number;
  /** It has transparency, so it sits on the light plate. */
  hasAlpha: boolean;
}

/** Each placed Media Asset's email rendition, by asset id. */
export type CampaignBlockImages = Readonly<Record<string, CampaignBlockImage>>;

/**
 * A Storefront product as the shop sells it when the email is rendered
 * (slice 07): read by the sender through the shop's own query, Listed, and
 * priced from its Variants, which Costings sets (ADR 0001). A products block
 * holds only the id.
 */
export interface CampaignBlockProduct {
  /** Its name, as the shop shows it. */
  title: string;
  /** Its shop page is `/shop/<slug>`. */
  slug: string;
  /** Its first photo, whose email rendition is in `images`; null when it has none. */
  image: { asset: string } | null;
  /** The lowest price of its active Variants. */
  price: number;
  /** That Variant's compare-at price, struck through, when the shop shows one; else null. */
  compareAt: number | null;
  /** It has more than one active Variant, so the price is a *from*, as the shop card says (`shopCardPrice`). */
  from: boolean;
  currency: string;
}

/** Each Listed product the email shows or links to, by id. */
export type CampaignBlockProducts = Readonly<Record<string, CampaignBlockProduct>>;

/** Pure — a product's price in words, as the email shows it: `from SGD 39.00 (was SGD 49.00)`. */
export function productPriceText(p: Pick<CampaignBlockProduct, "price" | "compareAt" | "from" | "currency">): string {
  const now = `${p.from ? "from " : ""}${money(p.price, p.currency)}`;
  return p.compareAt === null ? now : `${now} (was ${money(p.compareAt, p.currency)})`;
}

/** A product's price line as the shop card draws it: *from*, the compare-at struck through and muted, then the price. */
function productPriceHtml(p: CampaignBlockProduct): string {
  const was =
    p.compareAt === null
      ? ""
      : `<span class="mp-muted" style="${css({ color: LIGHT.mutedFg, "text-decoration": "line-through" })}">${escapeHtml(money(p.compareAt, p.currency))}</span>&nbsp; `;
  return `${p.from ? "from " : ""}${was}<strong>${escapeHtml(money(p.price, p.currency))}</strong>`;
}

export interface CampaignBlocksEmailData {
  /** May write Variables as `{first_name}`. */
  subject: string;
  /** The inbox preview line, which may write Variables too; null uses the start of the email. */
  preheader: string | null;
  content: CampaignContent;
  /** Open with "Hi <first name>," after the title the email opens with: the *First name* Variable, with its fallback. */
  greeting: boolean;
  /** Each Variable's words for this recipient: their own detail, else the campaign's fallback. */
  values: Record<VariableKey, string>;
  /**
   * A button's or an image link's link for this recipient; null leaves the
   * button, or the link, out. A product's is its shop page, from `products`.
   */
  buttonHref: (b: BlockButton | BlockLink) => string | null;
  /**
   * Each placed image's email rendition (slice 05). A send must have every
   * one: an image without its rendition throws. The preview draws a hint.
   */
  images?: CampaignBlockImages;
  /**
   * Each Listed product the email shows (slice 07), as the shop sells it now.
   * A send must have every one: a product not in it throws. The preview
   * draws a hint.
   */
  products?: CampaignBlockProducts;
  /** The Customer's unsubscribe confirm page. */
  unsubscribeUrl: string;
  /** The editor's preview only: drawn in place of an empty field. Never set for a send. */
  placeholders?: CampaignBlocksPlaceholders;
}

const SPACER_PX: Record<SpacerSize, number> = { s: SPACE.md, m: SPACE["3xl"], l: SPACE["3xl"] * 2 };

/** The card's inner column: the 600px container less the card's padding and its 1px border. */
const COLUMN_PX = LAYOUT.containerWidth - 2 * LAYOUT.cardPadding - 2;

/** How wide an image is shown, at most: Full is the column's width; Inset leaves room either side. */
const IMAGE_PX: Record<ImageWidth, number> = { full: COLUMN_PX, inset: 440 };

/** An image + text's two columns side by side (slice 06): each half the row that stacks, less the room between them. */
const SPLIT_CELL_PX = STACK_BELOW / 2 - LAYOUT.gutter;

/** One of `n` products side by side (slice 07): its share of the row that stacks, less the room between them. */
const productCellPx = (n: number) => Math.floor(STACK_BELOW / n) - LAYOUT.gutter;

/** Blocks that can open an email above its greeting: a title, a hero, an image. */
const opensEmail = (b: EmailBlock) => (b.type === "heading" && b.level === 1) || b.type === "hero" || b.type === "image";

const greet = (firstName: string | null) => {
  const name = firstName?.replace(/\s+/g, " ").trim();
  return name ? `Hi ${name},` : "Hi,";
};

/** A run's words as they read: a Variable is its value for this recipient. */
const runText = (r: Run, values: Record<VariableKey, string>) => ("var" in r ? values[r.var] : r.text);

/** Consecutive runs that share a link (or have none), so one link is one <a> and one line of text. */
function linkGroups(runs: readonly Run[]): { href: string | null; runs: Run[] }[] {
  const groups: { href: string | null; runs: Run[] }[] = [];
  for (const r of runs) {
    const href = ("href" in r && r.href) || null;
    const last = groups.at(-1);
    if (last && last.href === href) last.runs.push(r);
    else groups.push({ href, runs: [r] });
  }
  return groups;
}

/** Runs as HTML: every word escaped, a line break kept, bold and italic as marks, links through safeUrl. */
function runsHtml(runs: readonly Run[], values: Record<VariableKey, string>): string {
  return linkGroups(runs)
    .map((g) => {
      const inner = g.runs
        .map((r) => {
          let h = escapeHtml(runText(r, values)).replace(/\n/g, "<br />");
          if ("text" in r && r.italic) h = `<em>${h}</em>`;
          if ("text" in r && r.bold) h = `<strong>${h}</strong>`;
          return h;
        })
        .join("");
      return g.href ? linkHtml({ href: g.href, labelHtml: inner }) : inner;
    })
    .join("");
}

/** Runs as plain text, and each link as `words: url` for the lines after them. */
function runsText(runs: readonly Run[], values: Record<VariableKey, string>): { text: string; links: string[] } {
  const groups = linkGroups(runs);
  const words = (g: { runs: Run[] }) => g.runs.map((r) => runText(r, values)).join("");
  return {
    text: groups.map(words).join(""),
    links: groups.filter((g) => g.href).map((g) => `${words(g).replace(/\s+/g, " ").trim()}: ${g.href}`),
  };
}

const hasWords = (runs: readonly Run[]) => runs.some((r) => "var" in r || r.text.trim());

/** Outlook's own copy of each button, which no other reader sees: left out of the inbox preview, so a label reads once. */
const OUTLOOK_ONLY = /<!--\[if mso\]>[\s\S]*?<!\[endif\]-->/g;

export function renderCampaignBlocksEmail(p: CampaignBlocksEmailData): RenderedEmail {
  const hint = p.placeholders;
  const values = p.values;
  const images = p.images ?? {};
  const products = p.products ?? {};
  // The schema again, whoever called: what does not parse never renders. Then
  // every Variable in every block's words, as this recipient reads them (slice 13).
  const content = fillVariables(CampaignContentPreviewSchema.parse(p.content), values);
  const subject = fillCopy(p.subject, values).replace(/\s+/g, " ").trim();

  const html: string[] = [];
  const text: string[] = [];
  // One fallback for a first name, wherever it appears: the greeting's is the Variable's.
  const greeting = p.greeting ? greet(values.first_name) : null;
  // The greeting opens the words: after the title (or hero, or image) the email
  // opens with, before any part's heading, where a legacy campaign's greeting sits.
  const greetAt = content.blocks.findIndex((b) => !opensEmail(b));
  const greetHere = () => {
    if (!greeting) return;
    html.push(paragraphHtml(escapeHtml(greeting)));
    text.push(greeting, "");
  };

  /**
   * An image at `width` px at most, never wider than its rendition; null when
   * there is nothing to draw. Its rendition is the sender's: a send without
   * one is a bug, so it throws rather than leave a hole in the email.
   */
  const imageHtml = (im: BlockImage, width: number, href: string | null): string | null => {
    if (!im.asset) return hint ? placeholderHint(hint.image) : null;
    const r = images[im.asset];
    if (!r) {
      if (hint) return placeholderHint(hint.imageUnavailable);
      throw new Error(`No email rendition for image ${im.asset}: read the campaign's images before rendering it.`);
    }
    const shown = Math.min(width, r.width);
    return emailImage({
      src: r.url,
      width: shown,
      height: Math.round((r.height * shown) / r.width),
      alt: im.alt,
      decorative: im.decorative,
      href,
      plate: r.hasAlpha,
    });
  };

  // An email has one title: the first level-1 heading, or the hero that opens it.
  let titled = false;

  /** One button on a line of its own (a hero's, or an image + text's): its HTML, and its line in the plain text. */
  const oneButton = (x: BlockButton, opts: Pick<ButtonOptions, "align" | "maxWidth"> = {}): string | null => {
    const href = p.buttonHref(x);
    const label = x.label.trim();
    if (!href) return null;
    if (!label) return hint ? placeholderHint(hint.buttonLabel, "button") : null;
    text.push(`${label}: ${href}`, "");
    return button({ href, label, variant: x.style, ...opts });
  };

  /**
   * One product of a products block (slice 07), as the shop sells it now:
   * its photo, name and price, then its button, each linked to its shop
   * page; `width` is its column's. The plain text is its name, price and link.
   * A product the sender did not read is not in the shop: a send throws
   * rather than send a dead link; the preview draws a hint.
   */
  const productHtml = (b: ProductsBlock, id: string, width: number, align: "left" | "center") => {
    const product = products[id];
    if (!product) {
      if (hint) return { picture: "", words: placeholderHint(hint.productUnavailable) };
      throw new Error(`Product ${id} is not in the shop: read the campaign's products before rendering it.`);
    }
    const href = p.buttonHref({ label: b.buttonLabel, target: "product", product: id, style: "primary" });
    // A linked photo's alt is what the link says: the product's name.
    const picture = product.image ? (imageHtml({ asset: product.image.asset, alt: product.title }, width, href) ?? "") : "";
    const words = [heading(product.title, 3, { align, bottom: SPACE.xs }), paragraphHtml(productPriceHtml(product), { align, bottom: 0 })];
    text.push(product.title, productPriceText(product));
    const label = b.buttonLabel.trim();
    if (href && label) {
      text.push(`${label}: ${href}`);
      words.push(button({ href, label, variant: "primary", align, maxWidth: width }));
    } else if (href && hint) words.push(placeholderHint(hint.buttonLabel, "button"));
    text.push("");
    return { picture, words: words.join("\n") };
  };

  /** A text block's paragraphs and bullets, wherever they sit: their HTML, each line read into the plain text. */
  const paragraphsHtml = (all: readonly Paragraph[]): string[] => {
    const out: string[] = [];
    const paragraphs = all.filter((x) => (x.kind === "p" ? hasWords(x.runs) : x.items.some(hasWords)));
    if (!paragraphs.length && hint) out.push(placeholderHint(hint.text));
    for (const para of paragraphs) {
      if (para.kind === "p") {
        const t = runsText(para.runs, values);
        out.push(paragraphHtml(runsHtml(para.runs, values)));
        text.push(t.text, ...t.links, "");
      } else {
        const items = para.items.filter(hasWords);
        const read = items.map((item) => runsText(item, values));
        out.push(bulletListHtml(items.map((item) => runsHtml(item, values))));
        text.push(...read.map((t) => `- ${t.text}`), ...read.flatMap((t) => t.links), "");
      }
    }
    return out;
  };

  const render = (b: EmailBlock, at: number) => {
    switch (b.type) {
      case "heading": {
        if (b.level === 1) titled = true;
        const top = html.length === 0 ? 0 : 12;
        if (b.text) {
          html.push(heading(b.text, b.level, { top }));
          text.push(b.text, "");
        } else if (hint) html.push(placeholderHint(hint.heading, b.level === 1 ? "h1" : "h2"));
        return;
      }
      case "text":
        html.push(...paragraphsHtml(b.paragraphs));
        return;
      case "buttons": {
        // A button with no words is no button, unless the preview shows its placeholder.
        const shown: (ButtonOptions | "hint")[] = [];
        for (const x of b.buttons) {
          const href = p.buttonHref(x);
          const label = x.label.trim();
          if (!href) continue;
          if (label) shown.push({ href, label, variant: x.style });
          else if (hint) shown.push("hint");
        }
        const live = shown.filter((x): x is ButtonOptions => x !== "hint");
        for (const x of live) text.push(`${x.label}: ${x.href}`);
        if (live.length) text.push("");
        if (live.length === 2) html.push(buttonPair([live[0], live[1]]));
        else for (const x of shown) html.push(x === "hint" ? placeholderHint(hint!.buttonLabel, "button") : button(x));
        return;
      }
      case "image": {
        const href = b.link ? p.buttonHref(b.link) : null;
        const drawn = imageHtml(b.image, IMAGE_PX[b.width], href);
        if (drawn) html.push(drawn);
        // The plain-text part has no picture: a linked one is its words and link.
        if (drawn && href && b.image.alt && !b.image.decorative) text.push(`${b.image.alt}: ${href}`, "");
        return;
      }
      case "hero": {
        // Stacked, never text on the image (decision 6): the image, then its
        // heading, line and button as real text and a real link below it. A
        // hero that opens the email is its title, unless a title came first.
        const drawn = imageHtml(b.image, COLUMN_PX, null);
        if (drawn) html.push(drawn);
        const level = (greetAt === -1 || at < greetAt) && !titled ? 1 : 2;
        if (level === 1 && b.heading !== undefined) titled = true;
        if (b.heading) {
          html.push(heading(b.heading, level, { align: "center" }));
          text.push(b.heading, "");
        } else if (b.heading !== undefined && hint) html.push(placeholderHint(hint.heading, level === 1 ? "h1" : "h2"));
        if (b.line) {
          html.push(paragraph(b.line, { align: "center" }));
          text.push(b.line, "");
        } else if (b.line !== undefined && hint) html.push(placeholderHint(hint.line));
        const cta = b.button && oneButton(b.button);
        if (cta) html.push(cta);
        return;
      }
      case "split": {
        // The image beside its words, in two columns that stack on a phone
        // with the image first, whichever side it sits on: it comes first in
        // the row, and `reverse` lays the row out right to left only while
        // the two sit side by side. The plain text is the words alone.
        const words: string[] = [];
        if (b.heading) {
          words.push(heading(b.heading, 2));
          text.push(b.heading, "");
        } else if (hint) words.push(placeholderHint(hint.heading, "h2"));
        words.push(...paragraphsHtml(b.paragraphs));
        const cta = b.button && oneButton(b.button, { align: "left", maxWidth: SPLIT_CELL_PX });
        if (cta) words.push(cta);
        const picture = imageHtml(b.image, SPLIT_CELL_PX, null) ?? "";
        html.push(
          columns([picture, words.join("\n")], {
            stackBelow: STACK_BELOW,
            reverse: b.side === "right",
            valign: "middle",
            gap: LAYOUT.gutter,
            textAlign: "left",
          }),
        );
        return;
      }
      case "products": {
        // One per row, each photo beside its words as an image + text lays
        // them out; or side by side, one column each. Either stacks on a
        // phone, the photo first, by width alone (the column primitive).
        const ids = b.products.filter(Boolean);
        if (!ids.length) {
          if (hint) html.push(placeholderHint(hint.products));
          return;
        }
        if (b.layout === "rows") {
          for (const id of ids) {
            const card = productHtml(b, id, SPLIT_CELL_PX, "left");
            // A product with no photo is its words alone, across the row.
            html.push(
              card.picture
                ? columns([card.picture, card.words], { stackBelow: STACK_BELOW, valign: "middle", gap: LAYOUT.gutter, textAlign: "left" })
                : card.words,
            );
          }
          return;
        }
        const width = productCellPx(ids.length);
        const cards = ids.map((id) => {
          const card = productHtml(b, id, width, "center");
          return `${card.picture}\n${card.words}`;
        });
        html.push(columns(cards, { stackBelow: STACK_BELOW, valign: "top", gap: LAYOUT.gutter }));
        return;
      }
      case "divider":
        html.push(divider());
        text.push("---", "");
        return;
      case "spacer":
        html.push(spacer(SPACER_PX[b.size]));
        return;
      default:
        throw new Error(`Unknown email block: ${JSON.stringify((b as { type?: unknown }).type)}`);
    }
  };

  // Where the title ends: an inbox shows what follows it, as it shows a
  // legacy campaign's words after its title.
  let opened = 0;
  content.blocks.forEach((b, i) => {
    if (i === greetAt) {
      opened = html.length;
      greetHere();
    }
    // The block's parts in one element that names it, for the preview's click-to-select.
    const from = html.length;
    render(b, i);
    if (html.length > from) html.push(`<div data-block-id="${escapeAttr(b.id)}">\n${html.splice(from).join("\n")}\n</div>`);
  });
  if (greetAt === -1) {
    opened = html.length;
    greetHere();
  }
  if (!content.blocks.length && hint) html.push(placeholderHint(hint.empty));
  text.push(COMPOSED_CAMPAIGN_NOTE, `Unsubscribe: ${p.unsubscribeUrl}`);

  const preheader =
    (p.preheader ? fillCopy(p.preheader, values).replace(/\s+/g, " ").trim() : "") ||
    stripTags(html.slice(opened).join("\n").replace(OUTLOOK_ONLY, "")).slice(0, 120);
  return {
    subject,
    html: renderEmailShell({
      // The blocks carry the email's headings: the subject titles the document only.
      ...(subject ? { documentTitle: subject } : {}),
      ...(preheader ? { preheader } : {}),
      bodyHtml: html.join("\n"),
      footer: COMPOSED_CAMPAIGN_NOTE,
      unsubscribeUrl: p.unsubscribeUrl,
    }),
    text: text.join("\n"),
  };
}
