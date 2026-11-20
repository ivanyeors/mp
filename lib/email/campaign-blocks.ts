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
import { CHINESE, chineseContent, chineseVersionOf } from "@/lib/email-campaigns/chinese-version";
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
import type { Locale } from "@/lib/i18n/locales";

export interface CampaignBlocksPlaceholders {
  heading: string;
  text: string;
  buttonLabel: string;
  empty: string;
  image: string;
  imageUnavailable: string;
  line: string;
  products: string;
  productUnavailable: string;
}

export interface CampaignBlockImage {
  url: string;
  width: number;
  height: number;
  hasAlpha: boolean;
}

export type CampaignBlockImages = Readonly<Record<string, CampaignBlockImage>>;

export interface CampaignBlockProduct {
  title: string;
  slug: string;
  image: { asset: string } | null;
  price: number;
  compareAt: number | null;
  from: boolean;
  currency: string;
}

export type CampaignBlockProducts = Readonly<Record<string, CampaignBlockProduct>>;

export function productPriceText(p: Pick<CampaignBlockProduct, "price" | "compareAt" | "from" | "currency">, { chinese = false }: { chinese?: boolean } = {}): string {
  if (chinese) {
    const now = `${money(p.price, p.currency)}${p.from ? " 起" : ""}`;
    return p.compareAt === null ? now : `${now}（原价 ${money(p.compareAt, p.currency)}）`;
  }
  const now = `${p.from ? "from " : ""}${money(p.price, p.currency)}`;
  return p.compareAt === null ? now : `${now} (was ${money(p.compareAt, p.currency)})`;
}

function productPriceHtml(p: CampaignBlockProduct, chinese: boolean): string {
  const was =
    p.compareAt === null
      ? ""
      : `<span class="mp-muted" style="${css({ color: LIGHT.mutedFg, "text-decoration": "line-through" })}">${escapeHtml(money(p.compareAt, p.currency))}</span>&nbsp; `;
  const price = `<strong>${escapeHtml(money(p.price, p.currency))}</strong>`;
  return chinese ? `${was}${price}${p.from ? " 起" : ""}` : `${p.from ? "from " : ""}${was}${price}`;
}

export interface CampaignBlocksEmailData {
  subject: string;
  preheader: string | null;
  content: CampaignContent;
  greeting: boolean;
  values: Record<VariableKey, string>;
  buttonHref: (b: BlockButton | BlockLink) => string | null;
  images?: CampaignBlockImages;
  products?: CampaignBlockProducts;
  unsubscribeUrl: string;
  placeholders?: CampaignBlocksPlaceholders;
  language?: Locale;
}

export const CAMPAIGN_OWN_WORDS = {
  en: {
    greeting: (name: string | null) => (name ? `Hi ${name},` : "Hi,"),
    note: COMPOSED_CAMPAIGN_NOTE,
    unsubscribe: (url: string) => `Unsubscribe: ${url}`,
  },
  zh: {
    greeting: (name: string | null) => (name && name !== "您" ? `${name}，您好！` : "您好！"),
    note: "您收到这封邮件，是因为您同意接收 Mpillow 的电子邮件。",
    unsubscribe: (url: string) => `取消订阅：${url}`,
  },
} as const;

const SPACER_PX: Record<SpacerSize, number> = { s: SPACE.md, m: SPACE["3xl"], l: SPACE["3xl"] * 2 };

const COLUMN_PX = LAYOUT.containerWidth - 2 * LAYOUT.cardPadding - 2;

const IMAGE_PX: Record<ImageWidth, number> = { full: COLUMN_PX, inset: 440 };

const SPLIT_CELL_PX = STACK_BELOW / 2 - LAYOUT.gutter;

const productCellPx = (n: number) => Math.floor(STACK_BELOW / n) - LAYOUT.gutter;

const opensEmail = (b: EmailBlock) => (b.type === "heading" && b.level === 1) || b.type === "hero" || b.type === "image";

const greet = (firstName: string | null, words: (typeof CAMPAIGN_OWN_WORDS)["en" | "zh"]) => words.greeting(firstName?.replace(/\s+/g, " ").trim() || null);

const runText = (r: Run, values: Record<VariableKey, string>) => ("var" in r ? values[r.var] : r.text);

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

function runsText(runs: readonly Run[], values: Record<VariableKey, string>): { text: string; links: string[] } {
  const groups = linkGroups(runs);
  const words = (g: { runs: Run[] }) => g.runs.map((r) => runText(r, values)).join("");
  return {
    text: groups.map(words).join(""),
    links: groups.filter((g) => g.href).map((g) => `${words(g).replace(/\s+/g, " ").trim()}: ${g.href}`),
  };
}

const hasWords = (runs: readonly Run[]) => runs.some((r) => "var" in r || r.text.trim());

const OUTLOOK_ONLY = /<!--\[if mso\]>[\s\S]*?<!\[endif\]-->/g;

export function renderCampaignBlocksEmail(p: CampaignBlocksEmailData): RenderedEmail {
  const hint = p.placeholders;
  const values = p.values;
  const images = p.images ?? {};
  const products = p.products ?? {};
  const parsed = CampaignContentPreviewSchema.parse(p.content);
  const chinese = p.language === CHINESE ? chineseVersionOf(parsed) : null;
  const own = chinese ? CAMPAIGN_OWN_WORDS.zh : CAMPAIGN_OWN_WORDS.en;
  const content = fillVariables(chinese ? chineseContent(parsed) : parsed, values);
  const subject = fillCopy(chinese ? chinese.subject : p.subject, values).replace(/\s+/g, " ").trim();
  const preheaderWords = chinese ? chinese.preheader : p.preheader;

  const html: string[] = [];
  const text: string[] = [];
  const greeting = p.greeting ? greet(values.first_name, own) : null;
  const greetAt = content.blocks.findIndex((b) => !opensEmail(b));
  const greetHere = () => {
    if (!greeting) return;
    html.push(paragraphHtml(escapeHtml(greeting)));
    text.push(greeting, "");
  };

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

  let titled = false;

  const oneButton = (x: BlockButton, opts: Pick<ButtonOptions, "align" | "maxWidth"> = {}): string | null => {
    const href = p.buttonHref(x);
    const label = x.label.trim();
    if (!href) return null;
    if (!label) return hint ? placeholderHint(hint.buttonLabel, "button") : null;
    text.push(`${label}: ${href}`, "");
    return button({ href, label, variant: x.style, ...opts });
  };

  const productHtml = (b: ProductsBlock, id: string, width: number, align: "left" | "center") => {
    const product = products[id];
    if (!product) {
      if (hint) return { picture: "", words: placeholderHint(hint.productUnavailable) };
      throw new Error(`Product ${id} is not in the shop: read the campaign's products before rendering it.`);
    }
    const href = p.buttonHref({ label: b.buttonLabel, target: "product", product: id, style: "primary" });
    const picture = product.image ? (imageHtml({ asset: product.image.asset, alt: product.title }, width, href) ?? "") : "";
    const words = [heading(product.title, 3, { align, bottom: SPACE.xs }), paragraphHtml(productPriceHtml(product, Boolean(chinese)), { align, bottom: 0 })];
    text.push(product.title, productPriceText(product, { chinese: Boolean(chinese) }));
    const label = b.buttonLabel.trim();
    if (href && label) {
      text.push(`${label}: ${href}`);
      words.push(button({ href, label, variant: "primary", align, maxWidth: width }));
    } else if (href && hint) words.push(placeholderHint(hint.buttonLabel, "button"));
    text.push("");
    return { picture, words: words.join("\n") };
  };

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
        if (drawn && href && b.image.alt && !b.image.decorative) text.push(`${b.image.alt}: ${href}`, "");
        return;
      }
      case "hero": {
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
        const ids = b.products.filter(Boolean);
        if (!ids.length) {
          if (hint) html.push(placeholderHint(hint.products));
          return;
        }
        if (b.layout === "rows") {
          for (const id of ids) {
            const card = productHtml(b, id, SPLIT_CELL_PX, "left");
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

  let opened = 0;
  content.blocks.forEach((b, i) => {
    if (i === greetAt) {
      opened = html.length;
      greetHere();
    }
    const from = html.length;
    render(b, i);
    if (html.length > from) html.push(`<div data-block-id="${escapeAttr(b.id)}">\n${html.splice(from).join("\n")}\n</div>`);
  });
  if (greetAt === -1) {
    opened = html.length;
    greetHere();
  }
  if (!content.blocks.length && hint) html.push(placeholderHint(hint.empty));
  text.push(own.note, own.unsubscribe(p.unsubscribeUrl));

  const preheader =
    (preheaderWords ? fillCopy(preheaderWords, values).replace(/\s+/g, " ").trim() : "") ||
    stripTags(html.slice(opened).join("\n").replace(OUTLOOK_ONLY, "")).slice(0, 120);
  return {
    subject,
    html: renderEmailShell({
      ...(subject ? { documentTitle: subject } : {}),
      ...(preheader ? { preheader } : {}),
      bodyHtml: html.join("\n"),
      footer: own.note,
      unsubscribeUrl: p.unsubscribeUrl,
      ...(chinese ? { lang: CHINESE } : {}),
    }),
    text: text.join("\n"),
  };
}
