import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { BOUGHT_LABELS, LANGUAGE_LABELS, POINTS_LABELS, SHIPS_TO_LABELS } from "@/lib/crm/customer-filters";
import { chineseVersionOf } from "./chinese-version";
import { buttonsOf, CHINESE, contentWords, EMAIL_BLOCK_LABEL, type CampaignContent } from "./content";
import type { ContentCheck, ContentIssue } from "./content-checks";
import { emailLinks } from "./content-checks";
import { variablesInEmail, type Campaign } from "./rules";
import { campaignVariable, variableFallback, variableValue, type RecipientPillow, type VariableKey, type VariableRecipient } from "./variables";

export type BoughtClass = "premium" | "basic" | "mbolster" | "accessory";
const BOUGHT_CLASSES: readonly BoughtClass[] = ["premium", "basic", "mbolster", "accessory"];

export interface RecipientFacts extends VariableRecipient {
  customerId: string;
  locale: string;
  shipCountry: string | null;
  bought: readonly BoughtClass[];
  lastPurchaseAt: string | null;
}

export const RECIPIENT_FACT_COLUMNS = "id, first_name, last_name, locale, ship_country, bought, last_purchase_at, points_available";

export const PILLOW_LINE_COLUMNS = "customer_id, tier, size, paid_at, order_item_id";

export const RECENT_PURCHASE_DAYS = 14;

export type FitEmail = Pick<Campaign, "subject" | "preheader" | "body" | "content" | "greeting" | "button" | "audience">;

export interface FitFacts {
  origin: string;
  productClasses: Readonly<Record<string, readonly BoughtClass[]>>;
  now: Date;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

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

const n = (x: number) => x.toLocaleString("en-SG");

const of = (x: number, all: number) => `${n(x)} of ${n(all)}`;

const chip = (label: string) => `“${label}”`;

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

const IN_STORE_WORDS = /(?<![\w-])(studio|in[- ]store|fittings?|re-?adjust(?:ment|ments|ed|ing)?)(?![\w-])/i;

const isAppointmentsLink = (url: string) => {
  try {
    return /^\/(?:[a-z]{2}(?:-[A-Za-z]{2})?\/)?appointments(?:\/|$)/.test(new URL(url).pathname);
  } catch {
    return false;
  }
};

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

type Offer = "premium" | "basic" | "mpillow" | "mbolster";
const OFFERS: Record<Offer, { own: string; classes: readonly BoughtClass[] }> = {
  premium: { own: "a Premium Mpillow", classes: ["premium"] },
  basic: { own: "a Basic Mpillow", classes: ["basic"] },
  mpillow: { own: "an Mpillow", classes: ["premium", "basic"] },
  mbolster: { own: "an Mbolster", classes: ["mbolster"] },
};

const BUTTON_OFFER: Partial<Record<string, Offer>> = { customise_mpillow: "mpillow", customise_mbolster: "mbolster" };

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

const NO_DETAIL: Record<VariableKey, string> = {
  first_name: "first name",
  last_name: "last name",
  points_balance: "points to spend",
  your_pillow: "pillow bought here",
};

const VARIABLE_FIX: Partial<Record<VariableKey, { keep?: string; leaveOut?: readonly string[] }>> = {
  points_balance: { keep: POINTS_LABELS.has, leaveOut: [POINTS_LABELS.none] },
  your_pillow: { keep: `Bought ${BOUGHT_LABELS.premium} or ${BOUGHT_LABELS.basic}` },
};

export function campaignFitChecks(email: FitEmail, recipients: readonly RecipientFacts[], facts: FitFacts): ContentCheck[] {
  const all = recipients.length;
  if (!all) return [];
  const toSegment = email.audience === "segment";
  const fix = (f: Parameters<typeof fixText>[0]) => fixText(f, toSegment);
  const rows: (ContentCheck | null)[] = [];

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

export function fitUnreadCheck(reason: string): ContentCheck {
  const text = `Who it goes to wasn't checked against the email: ${reason}`;
  return { key: "fit_unread", ok: false, advisory: true, issues: [issue(null, text)], detail: text };
}
