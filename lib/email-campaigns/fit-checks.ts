/**
 * Fit checks (PRD-campaign-audiences slice 09): before a wave, where the
 * email and the people it goes to do not match. *14 of 60 read Chinese and
 * this email has no 中文 version*; *9 of 60 ship outside Singapore and this
 * email offers an in-store visit*.
 *
 * They run over the wave's planned people, after the rule (`planWave`), as a
 * list of facts about each (`RecipientFacts`), and sit in the send checklist
 * beside the email's own checks (content-checks.ts). Every one is advice:
 * each names a filter or a Segment to leave out that would fix it, and none
 * holds a wave. Like the email's advice, a check is listed only when it has
 * something to say.
 *
 *   fit_chinese      readers of Chinese (`locale` zh-CN), and no 中文 version
 *   fit_fallbacks    each Variable the email uses: how many read its fallback
 *   fit_in_store     a visit to the studio (a link to /appointments, or the
 *                    words *studio*, *in-store*, *fitting*, *re-adjustment*),
 *                    to people who ship outside Singapore or to an unknown
 *                    country
 *   fit_already_own  an Mpillow or an Mbolster the email offers (a
 *                    *Customise* button, or a products block showing one), to
 *                    people who already bought one. Accessories are not
 *                    checked: one is not another.
 *   fit_recent       people who bought in the last 14 days
 *
 * A fact is what the Customer overview says of them (`admin_customer_overview`)
 * and their latest pillow line: never a review, a rating or a note.
 * Pure, and safe in the browser.
 */
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { BOUGHT_LABELS, LANGUAGE_LABELS, POINTS_LABELS, SHIPS_TO_LABELS } from "@/lib/crm/customer-filters";
import { chineseVersionOf } from "./chinese-version";
import { buttonsOf, CHINESE, contentWords, EMAIL_BLOCK_LABEL, type CampaignContent } from "./content";
import type { ContentCheck, ContentIssue } from "./content-checks";
import { emailLinks } from "./content-checks";
import { variablesInEmail, type Campaign } from "./rules";
import { campaignVariable, variableFallback, variableValue, type RecipientPillow, type VariableKey, type VariableRecipient } from "./variables";

/** What a customer bought, as the overview's `bought` names it (*Bought*, lib/crm/customer-filters.ts). */
export type BoughtClass = "premium" | "basic" | "mbolster" | "accessory";
const BOUGHT_CLASSES: readonly BoughtClass[] = ["premium", "basic", "mbolster", "accessory"];

/** What the fit checks know of one planned recipient: no review, rating or note. */
export interface RecipientFacts extends VariableRecipient {
  customerId: string;
  /** `customers.locale`: `zh-CN` reads Chinese. */
  locale: string;
  /** Where they ship to, as an ISO-2 code; null for *Unknown*, never taken for Singapore. */
  shipCountry: string | null;
  bought: readonly BoughtClass[];
  /** Their latest purchase here (`last_purchase_at`); null for none. */
  lastPurchaseAt: string | null;
}

/** The overview's columns the fit checks read, and no other: no review, rating or note. */
export const RECIPIENT_FACT_COLUMNS = "id, first_name, last_name, locale, ship_country, bought, last_purchase_at, points_available";

/** The purchase-line columns *Your pillow* reads. */
export const PILLOW_LINE_COLUMNS = "customer_id, tier, size, paid_at, order_item_id";

/** Bought this recently, they get a nudge to buy again too soon. */
export const RECENT_PURCHASE_DAYS = 14;

/** The email, as the fit checks read it. */
export type FitEmail = Pick<Campaign, "subject" | "preheader" | "body" | "content" | "greeting" | "button" | "audience">;

/** What else they read: the live site's origin, for the links, and each product's class (`productClasses`). */
export interface FitFacts {
  origin: string;
  /** Each product the email shows, by id: what buying it makes you (a Premium Mpillow buyer...). */
  productClasses: Readonly<Record<string, readonly BoughtClass[]>>;
  now: Date;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Pure — one row of the overview, with their latest pillow, as the fit checks read it. */
export function recipientFactsFromRow(row: Record<string, unknown>, pillow: RecipientPillow | null): RecipientFacts | null {
  const id = str(row.id);
  if (!id) return null;
  const country = str(row.ship_country)?.toUpperCase() ?? null;
  const points = typeof row.points_available === "number" ? row.points_available : Number(row.points_available ?? NaN);
  return {
    customerId: id,
    firstName: str(row.first_name),
    lastName: str(row.last_name),
    pointsBalance: Number.isFinite(points) ? points : null,
    pillow,
    locale: str(row.locale) ?? DEFAULT_LOCALE,
    shipCountry: country && /^[A-Z]{2}$/.test(country) ? country : null,
    bought: Array.isArray(row.bought) ? BOUGHT_CLASSES.filter((c) => (row.bought as unknown[]).includes(c)) : [],
    lastPurchaseAt: str(row.last_purchase_at),
  };
}

/**
 * Pure — each customer's latest pillow from their pillow lines
 * (`customer_purchase_lines`, `product_type = 'pillow'`): the latest paid,
 * the latest line of that Order breaking a tie.
 */
export function latestPillows(rows: readonly Record<string, unknown>[]): Map<string, RecipientPillow> {
  const latest = new Map<string, { at: string; item: string; pillow: RecipientPillow }>();
  for (const r of rows) {
    const id = str(r.customer_id);
    const at = str(r.paid_at);
    if (!id || !at) continue;
    const item = str(r.order_item_id) ?? "";
    const tier = r.tier === "premium" || r.tier === "basic" ? r.tier : null;
    const had = latest.get(id);
    const newer = !had || Date.parse(at) > Date.parse(had.at) || (Date.parse(at) === Date.parse(had.at) && item > had.item);
    if (newer) latest.set(id, { at, item, pillow: { tier, size: str(r.size) } });
  }
  return new Map([...latest].map(([id, x]) => [id, x.pillow]));
}

/**
 * Pure — what buying each product makes you, as the purchase lines classify
 * it (`customer_purchase_lines`): a bolster is an Mbolster; a pillow, or a
 * product whose Variants are pillow products, is its Tiers; anything else an
 * accessory. `pillowKinds` is each pillow product's `kind`.
 */
export function productClasses(
  rows: readonly { id: string; product_type: string | null; product_variants?: readonly { pillow_product_id: number | string | null }[] | null }[],
  pillowKinds: ReadonlyMap<string, string>,
): Record<string, BoughtClass[]> {
  const out: Record<string, BoughtClass[]> = {};
  for (const r of rows) {
    const pillows = (r.product_variants ?? []).map((v) => v.pillow_product_id).filter((x): x is number | string => x != null);
    if (r.product_type === "bolster") out[r.id] = ["mbolster"];
    else if (r.product_type === "pillow" || pillows.length) {
      const kinds = new Set(pillows.map((x) => pillowKinds.get(String(x))));
      out[r.id] = (["premium", "basic"] as const).filter((k) => kinds.has(k));
    } else out[r.id] = ["accessory"];
  }
  return out;
}

// ---------------------------------------------------------------------------
// The checks
// ---------------------------------------------------------------------------

const n = (x: number) => x.toLocaleString("en-SG");

/** *14 of 60*. */
const of = (x: number, all: number) => `${n(x)} of ${n(all)}`;

/** A filter's chip, as the Customers list shows it: “Ships to Singapore”. */
const chip = (label: string) => `“${label}”`;

/**
 * One fix: the filter that keeps only the right people (added to the Segment
 * it goes to, or a Segment to send it to instead when it goes to everyone
 * subscribed or the imported), and the Segments to leave out instead.
 */
function fixText({ keep, leaveOut }: { keep?: string; leaveOut?: readonly string[] }, toSegment: boolean): string {
  const parts: string[] = [];
  if (keep) parts.push(toSegment ? `filter its Segment to ${chip(keep)}` : `send it to a Segment of ${chip(keep)}`);
  if (leaveOut?.length) parts.push(`leave out ${leaveOut.length === 1 ? "a Segment" : "Segments"} of ${leaveOut.map(chip).join(" and ")}`);
  return parts.join(", or ");
}

function advice(key: string, issues: ContentIssue[]): ContentCheck | null {
  if (!issues.length) return null;
  const detail = issues.map((i) => i.text).join("; ");
  return { key, ok: false, advisory: true, issues, detail };
}

function issue(blockId: string | null, text: string): ContentIssue {
  return { blockId, text, what: text };
}

const blockName = (content: CampaignContent, i: number) => `Block ${i + 1}, ${EMAIL_BLOCK_LABEL[content.blocks[i].type]}`;

/** *Studio*, *in-store*, *fitting*, *re-adjustment*: a visit only Singapore can make. Not *well-fitting*. */
const IN_STORE_WORDS = /(?<![\w-])(studio|in[- ]store|fittings?|re-?adjust(?:ment|ments|ed|ing)?)(?![\w-])/i;

/** A link to the appointments page, in any language. */
const isAppointmentsLink = (url: string) => {
  try {
    return /^\/(?:[a-z]{2}(?:-[A-Za-z]{2})?\/)?appointments(?:\/|$)/.test(new URL(url).pathname);
  } catch {
    return false;
  }
};

/** Where the email offers a visit: the first block that does (null for the subject or the preview line), or undefined for nowhere. */
function inStoreOffer(email: FitEmail, origin: string): { blockId: string | null; where: string } | undefined {
  const { content } = email;
  if (!content) {
    const said = [email.subject, email.preheader ?? "", email.body ?? ""].some((w) => IN_STORE_WORDS.test(w));
    return said ? { blockId: null, where: "the email" } : undefined;
  }
  const linked = new Set(emailLinks(content, origin).filter((l) => isAppointmentsLink(l.url)).map((l) => l.index));
  const index = content.blocks.findIndex((b, i) => linked.has(i) || contentWords({ ...content, blocks: [b] }).some((w) => IN_STORE_WORDS.test(w)));
  if (index >= 0) return { blockId: content.blocks[index].id, where: blockName(content, index) };
  if (IN_STORE_WORDS.test(email.subject)) return { blockId: null, where: "the subject" };
  if (IN_STORE_WORDS.test(email.preheader ?? "")) return { blockId: null, where: "the preview line" };
  return undefined;
}

/**
 * Something the email offers that a customer may already own: a Tier of
 * Mpillow, any Mpillow, or an Mbolster, with what owning one is called and
 * the classes that mean they do.
 */
type Offer = "premium" | "basic" | "mpillow" | "mbolster";
const OFFERS: Record<Offer, { own: string; classes: readonly BoughtClass[] }> = {
  premium: { own: "a Premium Mpillow", classes: ["premium"] },
  basic: { own: "a Basic Mpillow", classes: ["basic"] },
  mpillow: { own: "an Mpillow", classes: ["premium", "basic"] },
  mbolster: { own: "an Mbolster", classes: ["mbolster"] },
};

/** A button that offers one: *Customise an Mpillow*, *Customise an Mbolster*. */
const BUTTON_OFFER: Partial<Record<string, Offer>> = { customise_mpillow: "mpillow", customise_mbolster: "mbolster" };

/**
 * What each block offers, in order, once an offer: a products block its
 * products' classes (accessories aside: one is not another), a button its
 * customisation. Pillows and Mbolsters are not shop products
 * (`isShopCatalogProduct`), so today the buttons are how an email offers one.
 */
function offersIn(content: CampaignContent, classes: FitFacts["productClasses"]): { offer: Offer; index: number }[] {
  const out: { offer: Offer; index: number }[] = [];
  const seen = new Set<Offer>();
  const add = (offer: Offer, index: number) => {
    if (!seen.has(offer)) out.push({ offer, index });
    seen.add(offer);
  };
  content.blocks.forEach((b, index) => {
    if (b.type === "products") for (const id of b.products) for (const c of classes[id] ?? []) if (c !== "accessory") add(c, index);
    for (const x of buttonsOf(b)) {
      const offer = BUTTON_OFFER[x.target];
      if (offer) add(offer, index);
    }
  });
  return out;
}

/** What someone without each Variable's detail lacks: *have no pillow bought here*. */
const NO_DETAIL: Record<VariableKey, string> = {
  first_name: "first name",
  last_name: "last name",
  points_balance: "points to spend",
  your_pillow: "pillow bought here",
};

/** The filter that keeps only those with the detail, for each Variable that has one. */
const VARIABLE_FIX: Partial<Record<VariableKey, { keep?: string; leaveOut?: readonly string[] }>> = {
  points_balance: { keep: POINTS_LABELS.has, leaveOut: [POINTS_LABELS.none] },
  your_pillow: { keep: `Bought ${BOUGHT_LABELS.premium} or ${BOUGHT_LABELS.basic}` },
};

/**
 * Pure — the fit checks for one wave's planned people, in the order the
 * checklist lists them; only those with something to say. None holds the
 * wave.
 */
export function campaignFitChecks(email: FitEmail, recipients: readonly RecipientFacts[], facts: FitFacts): ContentCheck[] {
  const all = recipients.length;
  if (!all) return [];
  const toSegment = email.audience === "segment";
  const fix = (f: Parameters<typeof fixText>[0]) => fixText(f, toSegment);
  const rows: (ContentCheck | null)[] = [];

  // Readers of Chinese get English when there is no 中文 version (slice 17).
  const readers = recipients.filter((r) => r.locale === CHINESE).length;
  rows.push(
    advice(
      "fit_chinese",
      readers && !chineseVersionOf(email.content)
        ? [
            issue(
              null,
              `${of(readers, all)} read Chinese and this email has no 中文 version, so they get English: ${email.content ? "translate it, or " : ""}${fix({
                keep: `Reads ${LANGUAGE_LABELS.en}`,
                leaveOut: [`Reads ${LANGUAGE_LABELS["zh-cn"]}`],
              })}`,
            ),
          ]
        : [],
    ),
  );

  // Each Variable: how many read its fallback words, as it is used.
  const fallbacks = variablesInEmail(email).flatMap((key) => {
    const v = campaignVariable(key);
    const missing = recipients.filter((r) => variableValue(v.value(r, {})) === null).length;
    if (!missing) return [];
    const words = variableFallback(key, email.content?.fallbacks ?? {});
    const keepOnly = VARIABLE_FIX[key];
    const read = words ? `read “${words}” instead` : "read nothing in its place";
    return [
      issue(
        null,
        `${v.label}: ${of(missing, all)} have no ${NO_DETAIL[key]} and ${read}: ${keepOnly ? fix(keepOnly) : "check the fallback words read well to them"}`,
      ),
    ];
  });
  rows.push(advice("fit_fallbacks", fallbacks));

  // A visit to the studio, to people who cannot make one.
  const offer = inStoreOffer(email, facts.origin);
  const abroad = recipients.filter((r) => r.shipCountry !== null && r.shipCountry !== "SG").length;
  const unknown = recipients.filter((r) => r.shipCountry === null).length;
  if (offer && (abroad || unknown)) {
    const who = [
      abroad ? `${of(abroad, all)} ship outside Singapore` : null,
      unknown ? `${abroad ? n(unknown) : of(unknown, all)} ${abroad ? "more " : ""}ship to an unknown country` : null,
    ]
      .filter(Boolean)
      .join(", and ");
    const leaveOut = [abroad ? SHIPS_TO_LABELS["not-sg"] : null, unknown ? SHIPS_TO_LABELS.unknown : null].filter((x): x is string => x !== null);
    rows.push(
      advice("fit_in_store", [
        issue(offer.blockId, `${who}, and ${offer.where} offers an in-store visit: ${fix({ keep: SHIPS_TO_LABELS.sg, leaveOut })}`),
      ]),
    );
  }

  // Something they already own.
  const { content } = email;
  const owned = (content ? offersIn(content, facts.productClasses) : []).flatMap(({ offer, index }) => {
    const { own, classes } = OFFERS[offer];
    const owners = recipients.filter((r) => classes.some((c) => r.bought.includes(c))).length;
    if (!owners || !content) return [];
    const bought = classes.map((c) => BOUGHT_LABELS[c]).join(" or ");
    return [
      issue(
        content.blocks[index].id,
        `${of(owners, all)} already own ${own}, which ${blockName(content, index)} offers: ${fix({ keep: `Didn't buy ${bought}`, leaveOut: [`Bought ${bought}`] })}`,
      ),
    ];
  });
  rows.push(advice("fit_already_own", owned));

  // Bought in the last 14 days.
  const since = facts.now.getTime() - RECENT_PURCHASE_DAYS * 86_400_000;
  const recent = recipients.filter((r) => r.lastPurchaseAt && Date.parse(r.lastPurchaseAt) > since).length;
  rows.push(
    advice(
      "fit_recent",
      recent
        ? [issue(null, `${of(recent, all)} bought in the last ${RECENT_PURCHASE_DAYS} days: ${fix({ leaveOut: ["Last order within a month"] })}`)]
        : [],
    ),
  );

  return rows.filter((r): r is ContentCheck => r !== null);
}

/** Pure — the fit checks could not be read: one line of advice that says so, and holds nothing. */
export function fitUnreadCheck(reason: string): ContentCheck {
  const text = `Who it goes to wasn't checked against the email: ${reason}`;
  return { key: "fit_unread", ok: false, advisory: true, issues: [issue(null, text)], detail: text };
}
