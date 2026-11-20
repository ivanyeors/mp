import type { PreflightCheck } from "@/lib/customer-migration/wave-sender";
import type { CampaignBlockImages, CampaignBlockProducts } from "@/lib/email/campaign-blocks";
import { linkLabel } from "@/lib/email/campaign-body";
import { checkBannedClinical, checkBannedClinicalZh } from "@/lib/i18n/copy-bands";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { isSitePage } from "@/lib/routing/site-pages";
import {
  CampaignContentSchema,
  CHINESE,
  contentWords,
  EMAIL_BLOCK_LABEL,
  isHttpsUrl,
  paragraphRuns,
  productsIn,
  SITE_BUTTON_PATHS,
  type BlockButton,
  type CampaignContent,
  type EmailBlock,
} from "./content";
import { variablesInEmail, wordsMentionPoints } from "./rules";
import { campaignVariable, fallbackWords, withSampleValues } from "./variables";

export interface ContentIssue {
  blockId: string | null;
  text: string;
  what: string;
  language?: Locale;
}

export interface ContentCheck extends PreflightCheck {
  advisory: boolean;
  issues: ContentIssue[];
}

export interface EmailVersion {
  language: Locale;
  subject: string;
  preheader: string | null;
  greeting: boolean;
  content: CampaignContent;
  rendered: { html: string } | { error: string };
}

export interface LinkAnswer {
  ok: boolean;
  reason: string;
}

export interface EmailFacts {
  origin: string;
  images: CampaignBlockImages;
  imageFailures: readonly { assetId: string; reason: string }[];
  products: CampaignBlockProducts;
  unlisted: readonly { productId: string; problem: string }[];
  productsError: string | null;
  points: PreflightCheck | null;
  answers: Readonly<Record<string, LinkAnswer>>;
  aiDrafted?: readonly string[];
}

export const EMAIL_SIZE_LIMIT = 100_000;
export const EMAIL_SIZE_ADVICE = 85_000;
export const SUBJECT_PHONE = 60;
export const IMAGE_WORDS_MIN = 300;

const NAMED = 3;

const VERSION_NAME: Partial<Record<Locale, string>> = { "zh-CN": "中文" };

const RECOMMENDED = "Recommended: ";

function issue(name: string | null, blockId: string | null, what: string, advisory = false): ContentIssue {
  const lead = advisory ? RECOMMENDED : "";
  return { blockId, text: `${lead}${name ? `${name}: ` : ""}${what}`, what: `${lead}${what}` };
}

function summary(issues: readonly ContentIssue[]): string {
  const unique = [...new Set(issues.map((i) => i.text))];
  const more = unique.length - NAMED;
  return unique.slice(0, NAMED).join("; ") + (more > 0 ? `; and ${more} more` : "");
}

function check(key: string, issues: ContentIssue[], passed: string): ContentCheck {
  return { key, ok: !issues.length, advisory: false, issues, detail: issues.length ? summary(issues) : passed };
}

function advice(key: string, issues: ContentIssue[]): ContentCheck | null {
  return issues.length ? { key, ok: false, advisory: true, issues, detail: summary(issues) } : null;
}

const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-SG")} ${n === 1 ? one : many}`;

function at(v: unknown, path: readonly PropertyKey[]): unknown {
  return path.reduce<unknown>((x, k) => (x !== null && typeof x === "object" ? (x as Record<PropertyKey, unknown>)[k] : undefined), v);
}

const isEmpty = (v: unknown) => (typeof v === "string" && !v.trim()) || (Array.isArray(v) && v.length === 0);

function namesOf(version: Pick<EmailVersion, "language" | "content">) {
  const lead = version.language === DEFAULT_LOCALE ? "" : `${VERSION_NAME[version.language] ?? version.language}, `;
  return {
    block: (i: number) => `${lead}Block ${i + 1}, ${EMAIL_BLOCK_LABEL[version.content.blocks[i].type]}`,
    line: (what: "subject" | "preview line") => `${lead}The ${what}`,
  };
}

function unwritten(version: Pick<EmailVersion, "language" | "content">): ContentIssue[] {
  const { content } = version;
  const parsed = CampaignContentSchema.safeParse(content);
  if (parsed.success) return [];
  const name = namesOf(version);
  const issues: ContentIssue[] = [];
  const named = new Set<number>();
  for (const problem of parsed.error.issues) {
    const [top, index] = problem.path;
    if (top !== "blocks" || typeof index !== "number") {
      issues.push(issue(null, null, content.blocks.length ? problem.message : "the email has no blocks yet"));
      continue;
    }
    const field = problem.path.at(-1);
    if (field === "alt" || field === "url" || field === "href") continue;
    if (named.has(index) || !content.blocks[index]) continue;
    named.add(index);
    issues.push(issue(name.block(index), content.blocks[index].id, isEmpty(at(content, problem.path)) ? "still empty" : problem.message));
  }
  return issues;
}

export function placeholdersCheck(content: CampaignContent | null): ContentCheck | null {
  if (!content) return null;
  return check("placeholders", unwritten({ language: DEFAULT_LOCALE, content }), "every block's words are written");
}

export interface EmailLink {
  index: number;
  blockId: string;
  url: string;
  typed: boolean;
  what: string;
}

function buttonLink(b: Pick<BlockButton, "target" | "url">, origin: string): Pick<EmailLink, "url" | "typed"> | null {
  if (b.target === "url") return { url: b.url ?? "", typed: true };
  if (b.target === "product") return null;
  const path = b.target === "sign_in" ? "/account" : SITE_BUTTON_PATHS[b.target];
  return { url: `${origin}${withLocale(path, DEFAULT_LOCALE)}`, typed: false };
}

export function emailLinks(content: CampaignContent, origin: string): EmailLink[] {
  const base = origin.replace(/\/$/, "");
  const out: EmailLink[] = [];
  content.blocks.forEach((b, index) => {
    const add = (l: Pick<EmailLink, "url" | "typed"> | null, what: string) => {
      if (l) out.push({ index, blockId: b.id, what, ...l });
    };
    if (b.type === "text" || b.type === "split") {
      for (const r of paragraphRuns(b.paragraphs)) if ("href" in r && r.href !== undefined) add({ url: r.href, typed: true }, `the link "${r.text.trim()}"`);
    }
    if (b.type === "buttons") b.buttons.forEach((x, i) => add(buttonLink(x, base), b.buttons.length > 1 ? `button ${i + 1}` : "the button"));
    if ((b.type === "hero" || b.type === "split") && b.button) add(buttonLink(b.button, base), "the button");
    if (b.type === "image" && b.link) add(b.link.target === "url" ? { url: b.link.url ?? "", typed: true } : buttonLink(b.link, base), "the image's link");
  });
  return out;
}

function ownPath(url: string, origin: string): string | null {
  try {
    const u = new URL(url);
    return u.host === new URL(origin).host ? u.pathname : null;
  } catch {
    return null;
  }
}

const shown = (url: string) => {
  const label = linkLabel(url);
  return label.length > 60 ? `${label.slice(0, 59)}…` : label;
};

export function addressesToAsk(content: CampaignContent, facts: Pick<EmailFacts, "origin" | "images">): string[] {
  const links = emailLinks(content, facts.origin)
    .filter((l) => l.typed && isHttpsUrl(l.url) && ownPath(l.url, facts.origin) === null)
    .map((l) => l.url);
  return [...new Set([...links, ...Object.values(facts.images).map((im) => im.url)])];
}

type ShownImage = { index: number; block: EmailBlock; asset: string; what: string };

function imagesIn(content: CampaignContent, products: CampaignBlockProducts): ShownImage[] {
  return content.blocks.flatMap((b, index): ShownImage[] => {
    if ("image" in b && b.image.asset) return [{ index, block: b, asset: b.image.asset, what: "the image" }];
    if (b.type !== "products") return [];
    return b.products.flatMap((id) => {
      const p = products[id];
      return p?.image ? [{ index, block: b, asset: p.image.asset, what: `the photo of ${p.title}` }] : [];
    });
  });
}

function readWords(b: EmailBlock): string {
  const plain = "image" in b ? ({ ...b, image: { ...b.image, alt: "" } } as EmailBlock) : b;
  return contentWords({ v: 1, blocks: [plain], fallbacks: {} }).join(" ");
}

export function campaignContentChecks(version: EmailVersion, facts: EmailFacts): ContentCheck[] {
  const { content } = version;
  const name = namesOf(version);
  const rows: (ContentCheck | null)[] = [];
  const unchecked: ContentIssue[] = [];

  rows.push(check("placeholders", unwritten(version), "every block's words are written"));

  const links = emailLinks(content, facts.origin);
  if (links.length) {
    const issues: ContentIssue[] = [];
    const before = unchecked.length;
    for (const l of links) {
      const where = name.block(l.index);
      const own = !l.typed || isHttpsUrl(l.url) ? ownPath(l.url, facts.origin) : null;
      const answer = facts.answers[l.url];
      if (!l.url.trim()) issues.push(issue(where, l.blockId, `${l.what} has no link yet`));
      else if (l.typed && !isHttpsUrl(l.url)) issues.push(issue(where, l.blockId, `${l.what} goes to ${l.url}, which is not a full https:// address`));
      else if (own !== null) {
        if (!isSitePage(own)) issues.push(issue(where, l.blockId, `${l.what} goes to ${shown(l.url)}, which is not a page of the site`));
      } else if (!answer) unchecked.push(issue(where, l.blockId, `${l.what} to ${shown(l.url)} was not checked: open it yourself`, true));
      else if (!answer.ok) issues.push(issue(where, l.blockId, `${l.what} to ${shown(l.url)} ${answer.reason}`));
    }
    const notAsked = unchecked.length - before;
    rows.push(
      check(
        "links",
        issues,
        notAsked
          ? `${count(links.length - notAsked, "link")} checked, and they answer; ${count(notAsked, "link")} not checked`
          : links.length === 1
            ? "the link answers"
            : `all ${links.length} links answer`,
      ),
    );
  }

  const described = content.blocks.flatMap((b, index) => ("image" in b && b.image.asset ? [{ b, index }] : []));
  if (described.length) {
    const issues: ContentIssue[] = [];
    for (const { b, index } of described) {
      if (b.type !== "image" && b.type !== "hero" && b.type !== "split") continue;
      const decorative = b.type !== "split" && Boolean(b.image.decorative);
      if (b.type === "image" && b.link && decorative) issues.push(issue(name.block(index), b.id, "a linked image needs alt text: it is what the link says"));
      else if (!decorative && !b.image.alt.trim()) issues.push(issue(name.block(index), b.id, "no alt text: describe what the image shows"));
    }
    rows.push(check("alt", issues, described.length === 1 ? "the image has alt text" : `all ${described.length} images have alt text`));
  }

  const pictures = imagesIn(content, facts.products);
  if (pictures.length) {
    const issues: ContentIssue[] = [];
    const before = unchecked.length;
    const failed = new Map(facts.imageFailures.map((f) => [f.assetId, f.reason]));
    for (const p of pictures) {
      const where = name.block(p.index);
      const im = facts.images[p.asset];
      const answer = im ? facts.answers[im.url] : undefined;
      if (failed.has(p.asset)) issues.push(issue(where, p.block.id, `${p.what} has no copy an inbox can show: ${failed.get(p.asset)}`));
      else if (!im) issues.push(issue(where, p.block.id, `${p.what} has no email copy yet: choose it again`));
      else if (!isHttpsUrl(im.url)) issues.push(issue(where, p.block.id, `${p.what}'s email copy is not at an https address`));
      else if (/\.webp($|[?#])/i.test(im.url)) issues.push(issue(where, p.block.id, `${p.what}'s email copy is WebP, which classic Outlook can't show`));
      else if (!answer) unchecked.push(issue(where, p.block.id, `${p.what}'s email copy was not checked`, true));
      else if (!answer.ok) issues.push(issue(where, p.block.id, `${p.what}'s email copy ${answer.reason}`));
    }
    const notAsked = unchecked.length - before;
    rows.push(
      check(
        "images",
        issues,
        notAsked
          ? `every image is an email copy at an https address; ${count(notAsked, "copy", "copies")} not checked`
          : pictures.length === 1
            ? "the image is an email copy that answers"
            : `all ${pictures.length} images are email copies that answer`,
      ),
    );
  }

  const productIds = productsIn(content);
  if (productIds.length) {
    const issues: ContentIssue[] = facts.productsError ? [issue(null, null, facts.productsError)] : [];
    const problems = new Map(facts.unlisted.map((u) => [u.productId, u.problem]));
    content.blocks.forEach((b, index) => {
      for (const id of productsIn({ ...content, blocks: [b] })) {
        const problem = problems.get(id);
        if (problem) issues.push(issue(name.block(index), b.id, problem));
      }
    });
    rows.push(
      check(
        "products",
        issues,
        productIds.length === 1 ? "the product in the email is in the shop" : `the ${productIds.length} products in the email are in the shop`,
      ),
    );
  }

  if (facts.points) {
    const issues: ContentIssue[] = [];
    if (!facts.points.ok) {
      const what = "mentions points, which it can't promise until points are live";
      if (wordsMentionPoints(version.subject)) issues.push(issue(name.line("subject"), null, what));
      if (wordsMentionPoints(version.preheader ?? "")) issues.push(issue(name.line("preview line"), null, what));
      content.blocks.forEach((b, index) => {
        if (wordsMentionPoints(contentWords({ ...content, blocks: [b] }).join("\n"))) issues.push(issue(name.block(index), b.id, what));
      });
      if (!issues.length) issues.push(issue(null, null, facts.points.detail));
    }
    rows.push({ ...check("points", issues, facts.points.detail), detail: facts.points.detail });
  }

  const variables = variablesInEmail(version);
  if (variables.length) {
    const issues = variables.flatMap((key) => {
      if (fallbackWords(key, content.fallbacks, { chinese: version.language === CHINESE })) return [];
      const label = campaignVariable(key).label;
      return [issue(null, null, `${label} has no fallback words: write what to say to a customer with no ${label.toLowerCase()}`)];
    });
    const labels = variables.map((key) => campaignVariable(key).label).join(", ");
    rows.push(check("fallbacks", issues, `every Variable has fallback words: ${labels}`));
  }

  const banned = (label: string, words: string) =>
    checkBannedClinical(label, words) ?? (version.language === CHINESE ? checkBannedClinicalZh(label, words) : null);
  const claims: ContentIssue[] = [];
  for (const [label, words] of [
    [name.line("subject"), version.subject],
    [name.line("preview line"), version.preheader ?? ""],
  ] as const) {
    const said = banned(label, words);
    if (said) claims.push({ blockId: null, text: said, what: said });
  }
  content.blocks.forEach((b, index) => {
    const label = name.block(index);
    const said = banned(label, contentWords({ ...content, blocks: [b] }).join("\n"));
    if (said) claims.push({ blockId: b.id, text: said, what: said.slice(label.length + 1) });
  });
  rows.push(check("clinical", claims, "no health claims: comfort, fit and sleep only"));

  const bytes = "html" in version.rendered ? new TextEncoder().encode(version.rendered.html).length : null;
  const kb = (n: number) => `${(n / 1000).toFixed(1)} KB`;
  if (bytes !== null) {
    rows.push(
      check(
        "size",
        bytes >= EMAIL_SIZE_LIMIT ? [issue(null, null, `${kb(bytes)} as sent: Gmail clips an email over 102 KB and hides its unsubscribe link, so make it shorter`)] : [],
        `${kb(bytes)} as sent, under Gmail's 102 KB clip`,
      ),
    );
  } else if (!rows.some((r) => r && !r.ok)) {
    rows.push(check("size", [issue(null, null, `it can't be measured until it renders as sent: ${"error" in version.rendered ? version.rendered.error : ""}`)], ""));
  }

  rows.push(
    advice(
      "size_close",
      bytes !== null && bytes >= EMAIL_SIZE_ADVICE && bytes < EMAIL_SIZE_LIMIT
        ? [issue(null, null, `make it shorter: at ${kb(bytes)} as sent, it is close to Gmail's 102 KB clip`, true)]
        : [],
    ),
  );
  const subject = withSampleValues(version.subject);
  rows.push(
    advice(
      "subject_length",
      subject.length > SUBJECT_PHONE
        ? [issue(null, null, `a shorter subject: phones cut it off after about ${SUBJECT_PHONE} characters, and it has ${subject.length}`, true)]
        : [],
    ),
  );
  rows.push(
    advice(
      "preview_line",
      version.preheader?.trim() ? [] : [issue(null, null, "write a preview line: without one, the inbox shows the start of the email instead", true)],
    ),
  );
  const words = content.blocks.map(readWords).join(" ").replace(/\s+/g, " ").trim().length;
  const pictured = content.blocks.some((b) => ("image" in b && b.image.asset) || (b.type === "products" && b.products.some(Boolean)));
  rows.push(
    advice(
      "image_words",
      pictured && words < IMAGE_WORDS_MIN
        ? [issue(null, null, `more words: with images off, this email says only ${count(words, "character")}, and an email of images alone reads as spam`, true)]
        : [],
    ),
  );
  const drafted = new Set(facts.aiDrafted ?? []);
  rows.push(
    advice(
      "ai_drafted",
      content.blocks.flatMap((b, index) => (drafted.has(b.id) ? [issue(name.block(index), b.id, "still marked Drafted with AI: read it, then press Keep", true)] : [])),
    ),
  );
  rows.push(advice("links_unchecked", unchecked));

  const listed = rows.filter((r): r is ContentCheck => r !== null);
  if (version.language === DEFAULT_LOCALE) return listed;
  return listed.map((r) => ({ ...r, issues: r.issues.map((i) => ({ ...i, language: version.language })) }));
}

export function joinVersionChecks(...versions: readonly (readonly ContentCheck[])[]): ContentCheck[] {
  const joined = new Map<string, ContentCheck>();
  for (const rows of versions) {
    for (const r of rows) {
      const had = joined.get(r.key);
      if (!had) {
        joined.set(r.key, { ...r, issues: [...r.issues] });
        continue;
      }
      const issues = [...had.issues, ...r.issues];
      const detail = !had.ok && !r.ok ? summary(issues) : had.ok ? r.detail : had.detail;
      joined.set(r.key, { ...had, ok: had.ok && r.ok, issues, detail });
    }
  }
  return [...joined.values()];
}
