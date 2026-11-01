/**
 * Email campaigns: checking, planning, testing and sending (PRD-email-marketing).
 *
 * The Admin Panel's Email campaigns page drives these through its server
 * actions; the browser sends a wave a batch at a time, so no request runs
 * long and Staff watch it go.
 *
 * **Before anything is sent** every check of `campaignDeliveryChecks` must
 * pass, the same ones the migration's wave sender runs: Resend from
 * CAMPAIGN_RESEND_API_KEY (never the order mailbox), a From on the campaign
 * subdomain, a support inbox for Reply-To, a public https site, and that site
 * answering one-click unsubscribe for links signed here. The latest wave of
 * any campaign email must also be clear of the pause rule (bounces over 2%,
 * complaints over 0.1%), unless Staff resume after looking into it. A
 * Campaign that mentions points goes to customers only while points are live
 * (`claimBonusOffer`): on, launched, with a Claim bonus. A test send is not
 * held back by it. The email itself is checked too (PRD-campaign-email-editor
 * slice 11, `campaignEmailChecks`): its blocks written, its links answering,
 * its images described and Outlook-safe, its size under Gmail's clip as
 * sent, and its words, each failure naming the block it is in.
 *
 * **The send limit** (PRD-campaign-send-flow). Resend's free plan sends 100
 * a day and 3,000 a month, tests included (`campaignSendLimits` raises them on
 * a paid plan). A wave is planned only up to the room left, every batch
 * re-reads it (the migration script or a second tab may have sent), and
 * Resend's 429 quota answer stops the wave at once. The rest of the audience
 * waits for the next wave: there is no cron.
 *
 * **Each send** is claimed in the ledger first (`claim_marketing_campaign_send`,
 * which re-checks consent, suppression and "already sent" in SQL at that
 * moment), then rendered with the recipient's own unsubscribe link and
 * `List-Unsubscribe` (RFC 8058), Reply-To the support inbox. A Migrated
 * customer who has not Claimed gets their own Claim link as the sign-in
 * button. A block campaign's Variables are filled for each recipient
 * (PRD-campaign-email-editor slice 13): their names as the claim returns
 * them, and their points balance, read only for an email that says it. A
 * recipient whose `locale` is `zh-CN` gets the campaign's 中文 version when it
 * has one (slice 17); everyone else, and everyone when it has none, gets
 * English, one ledger row each as ever. About two a second (Resend's default
 * limit); a batch stops after five failures in a row.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { mintClaimLink } from "@/lib/customer-migration/claim-link";
import {
  readRecentCampaignSends,
  sendAllowance,
  wavePause,
  type CampaignWaveStats,
  type SendAllowance,
} from "@/lib/customer-migration/campaign-ledger";
import {
  campaignConfigChecks,
  campaignDeliveryChecks,
  isSendQuotaError,
  MAX_CONSECUTIVE_FAILURES,
  THROTTLE_MS,
  type DeliverySetup,
  type PreflightCheck,
} from "@/lib/customer-migration/wave-sender";
import { forceDarkMode } from "@/lib/email/base";
import {
  renderCampaignBlocksEmail,
  type CampaignBlockImages,
  type CampaignBlockProducts,
  type CampaignBlocksPlaceholders,
} from "@/lib/email/campaign-blocks";
import { renderComposedCampaignEmail, type ComposedCampaignPlaceholders } from "@/lib/email/campaigns";
import {
  checkCampaignFrom,
  emailAddressOf,
  RESEND_FREE_SEND_LIMITS,
  type CampaignSendLimits,
} from "@/lib/email/campaign-transport";
import type { RenderedEmail } from "@/lib/email/types";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { listUnsubscribeHeaders, PROBE_CUSTOMER_ID, unsubscribeLinks } from "@/lib/marketing-consent/unsubscribe";
import { claimBonusOffer } from "@/lib/points/offer";
import { readPointsBalance, readPointsSettings } from "@/lib/points/server";
import {
  campaignLedgerKey,
  CAMPAIGN_BLOCKER_TEXT,
  CAMPAIGN_PLACEHOLDERS,
  excludeSegmentMembers,
  mentionsPoints,
  MAX_TEST_RECIPIENTS,
  MAX_WAVE_SIZE,
  nextWaveLabel,
  planCampaignWave,
  variablesInEmail,
  WAVE_LABEL,
  type Campaign,
  type CampaignPlan,
  type LeftOutBySegment,
  type SegmentExclusion,
} from "./rules";
import { CHINESE, CHINESE_STATUS_TEXT, chineseAiDrafted, chineseContent, chineseGaps, chineseVersionOf, chineseVersionProblems } from "./chinese-version";
import { aiDraftedBlocks, contentSignsIn, CONTENT_PLACEHOLDERS, imageAssetsIn, SITE_BUTTON_PATHS, type BlockButton } from "./content";
import { addressesToAsk, campaignContentChecks, joinVersionChecks, type ContentCheck, type ContentIssue, type EmailFacts } from "./content-checks";
import { campaignImagesProblem, readCampaignImages, type CampaignImageFailure } from "./images";
import { addClickToken, hashClickToken, newClickToken } from "./click";
import { checkLinks, type LinkRequest } from "./link-check";
import { campaignProductPhotos, campaignProductsProblem, readCampaignProducts, unlistedProductText, type UnlistedProduct } from "./products";
import { roomAgainText } from "./send-flow";
import { campaignFitChecks, fitUnreadCheck } from "./fit-checks";
import {
  claimMarketingCampaignSend,
  finishCampaignSend,
  readCampaignCandidates,
  readKeptToday,
  readLatestPillows,
  readProductClasses,
  readRecipientFacts,
  readWaveStats,
} from "./store";
import { campaignVariable, SAMPLE_RECIPIENT, variableValues, type RecipientPillow, type VariableRecipient } from "./variables";

export { MAX_CONSECUTIVE_FAILURES };

/** The most sends one batch (one request) makes: about ten seconds at two a second. */
export const BATCH_SIZE = 20;

export interface CampaignSenderSetup extends DeliverySetup {
  admin: SupabaseClient;
  /** `campaignSendLimits`, read when counted so a bad value fails the check, not the page; Resend's free plan when absent. */
  sendLimits?: CampaignSendLimits | (() => CampaignSendLimits);
  /** CAMPAIGN_RESEND_WEBHOOK_SECRET is set, so bounces and spam reports reach the ledger. */
  reportsConfigured?: boolean;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  /**
   * How the checks before a wave ask whether the email's links answer
   * (PRD-campaign-email-editor slice 11): `publicLinkRequest` in production
   * (`campaignSenderSetup`), a fake in tests. Without one nothing is fetched,
   * and the checks say which links were not checked.
   */
  linkRequest?: LinkRequest;
}

/** `utm_source` on the site links a composed campaign carries. */
export const EMAIL_CAMPAIGN_UTM_SOURCE = "email_campaign";

/** Pure — a name as a UTM value: `October news` → `october-news`. */
export function campaignSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "campaign"
  );
}

/** Pure — `url` with the campaign's UTMs when it is on the site; any other link is left alone. */
export function withEmailCampaignUtm(url: string, campaignName: string, origin: string): string {
  try {
    const u = new URL(url);
    if (u.host !== new URL(origin).host) return url;
    u.searchParams.set("utm_source", EMAIL_CAMPAIGN_UTM_SOURCE);
    u.searchParams.set("utm_medium", "email");
    u.searchParams.set("utm_campaign", campaignSlug(campaignName));
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Pure — the button for one recipient: their own Claim link when they have
 * one, else their account on the site; or the Campaign's link.
 */
export function campaignButton(
  campaign: Pick<Campaign, "name" | "button">,
  { origin, locale, claimUrl }: { origin: string; locale: Locale; claimUrl: string | null },
): { label: string; href: string } | null {
  const b = campaign.button;
  if (!b) return null;
  if (b.target === "sign_in") {
    return { label: b.label, href: claimUrl ?? withEmailCampaignUtm(`${origin}${withLocale("/account", locale)}`, campaign.name, origin) };
  }
  return b.url ? { label: b.label, href: withEmailCampaignUtm(b.url, campaign.name, origin) } : null;
}

/**
 * Pure — where a block's button goes for one recipient (PRD-campaign-email-editor
 * slice 03): a page on the live site in their language, with the campaign's
 * UTMs; for `sign_in` their own Claim link when they have one, as the single
 * button; for `url` the link Staff typed; for `product` its shop page (slice
 * 07), when it is in `products`, the Listed products the sender read.
 */
export function blockButtonHref(
  b: Pick<BlockButton, "target" | "url" | "product">,
  campaignName: string,
  { origin, locale, claimUrl, products }: { origin: string; locale: Locale; claimUrl: string | null; products?: CampaignBlockProducts },
): string | null {
  if (b.target === "url") return b.url ? withEmailCampaignUtm(b.url, campaignName, origin) : null;
  if (b.target === "sign_in" && claimUrl) return claimUrl;
  if (b.target === "product") {
    const product = b.product ? products?.[b.product] : undefined;
    if (!product) return null;
    return withEmailCampaignUtm(`${origin}${withLocale(`/shop/${encodeURIComponent(product.slug)}`, locale)}`, campaignName, origin);
  }
  const path = b.target === "sign_in" ? "/account" : SITE_BUTTON_PATHS[b.target];
  return withEmailCampaignUtm(`${origin}${withLocale(path, locale)}`, campaignName, origin);
}

/** Pure — a button of the Campaign goes to the recipient's sign-in, so each send mints their Claim link. */
export const campaignSignsIn = (campaign: Pick<Campaign, "button" | "content">) =>
  campaign.content ? contentSignsIn(campaign.content) : campaign.button?.target === "sign_in";

/** Pure — the Campaign says each recipient's *Points balance* (slice 13), so each send reads it. */
export const usesPointsBalance = (campaign: Pick<Campaign, "subject" | "preheader" | "content" | "greeting">) =>
  variablesInEmail(campaign).some((key) => campaignVariable(key).needsPoints);

/** Pure — the Campaign says each recipient's *Your pillow* (PRD-campaign-audiences slice 09), so each batch reads their pillows. */
export const usesYourPillow = (campaign: Pick<Campaign, "subject" | "preheader" | "content" | "greeting">) =>
  variablesInEmail(campaign).includes("your_pillow");

/**
 * Pure — the language a reader in `locale` gets the Campaign in (slice 17):
 * its 中文 version for a reader of Chinese, when it has one; else English.
 */
export const campaignLanguage = (campaign: Pick<Campaign, "content">, locale: Locale): Locale =>
  locale === CHINESE && chineseVersionOf(campaign.content) ? CHINESE : DEFAULT_LOCALE;

/** What an empty field shows in the editor's preview, legacy or blocks. */
export type CampaignPreviewPlaceholders = ComposedCampaignPlaceholders & CampaignBlocksPlaceholders;

/** The Campaign's parts an email is rendered from. */
type CampaignEmailParts = Pick<Campaign, "name" | "subject" | "preheader" | "body" | "content" | "greeting" | "button">;

/**
 * Pure — the Campaign as one recipient gets it: its blocks, or the plain-text
 * body of a campaign written before them, which keeps its own renderer
 * (PRD-campaign-email-editor decision 5). `placeholders` is the editor's
 * preview's alone (`renderCampaignPreview`): no send passes it. `images` is
 * each placed image's email rendition (slice 05) and `products` each Listed
 * product as the shop sells it now (slice 07), both read by
 * `readCampaignRenderData` before the first recipient: the renderer throws on
 * an image or a product without one. A recipient whose `locale` is `zh-CN`
 * gets its 中文 version, when it has one (`campaignLanguage`, slice 17), with
 * its 中文 fallbacks; `products` are then their 中文 names (`productsFor`).
 */
export function renderCampaignFor(
  campaign: CampaignEmailParts,
  p: VariableRecipient & {
    /** `firstName`, and the recipient's other details, for the Variables a block campaign uses (slice 13). */
    origin: string;
    locale: Locale;
    claimUrl: string | null;
    unsubscribeUrl: string;
    images?: CampaignBlockImages;
    products?: CampaignBlockProducts;
    placeholders?: CampaignPreviewPlaceholders;
  },
): RenderedEmail {
  if (campaign.content) {
    const chinese = campaignLanguage(campaign, p.locale) === CHINESE ? chineseVersionOf(campaign.content) : null;
    return renderCampaignBlocksEmail({
      subject: campaign.subject,
      preheader: campaign.preheader,
      content: campaign.content,
      greeting: campaign.greeting,
      values: chinese ? variableValues(p, chinese.fallbacks, { chinese: true }) : variableValues(p, campaign.content.fallbacks),
      buttonHref: (b) => blockButtonHref(b, campaign.name, p),
      unsubscribeUrl: p.unsubscribeUrl,
      ...(p.images ? { images: p.images } : {}),
      ...(p.products ? { products: p.products } : {}),
      ...(p.placeholders ? { placeholders: p.placeholders } : {}),
      ...(chinese ? { language: CHINESE } : {}),
    });
  }
  return renderComposedCampaignEmail({
    subject: campaign.subject,
    preheader: campaign.preheader,
    body: campaign.body,
    greeting: campaign.greeting,
    firstName: p.firstName,
    button: campaignButton(campaign, { origin: p.origin, locale: p.locale, claimUrl: p.claimUrl }),
    unsubscribeUrl: p.unsubscribeUrl,
    ...(p.placeholders ? { placeholders: p.placeholders } : {}),
  });
}

/**
 * Pure — the editor's preview: the Campaign for a sample customer, with an
 * unsubscribe link that unsubscribes nobody. An empty subject, message,
 * block field or button label shows its placeholder, dashed and muted
 * (PRD-campaign-email-editor decision 7), so an empty email's layout reads.
 *
 * `forceDark` is the preview's *Dark* (slice 15): the same email with the
 * shell's own dark rules applied whatever the viewer's setting. The campaign
 * editor's Light / Dark toggle (slice 04) passes it through previewCampaign.
 * Only the preview takes it; nothing a send calls can (sender.test.ts, at the
 * type level). `images` and `products` are what the test send reads too
 * (`readCampaignRenderData`), so the preview shows the email it delivers; an
 * image or a product missing from them is drawn as a hint.
 *
 * The sample customer is the caller's: *Preview as* (slice 13) passes
 * `SAMPLE_RECIPIENT` for *A customer*, or `NO_DETAILS` to show every fallback.
 * `locale` is the editor's Language (slice 17): `zh-CN` shows the 中文 email,
 * as a reader of Chinese gets it, links included.
 */
export function renderCampaignPreview(
  campaign: CampaignEmailParts,
  {
    origin,
    firstName,
    lastName = null,
    pointsBalance = null,
    pillow = null,
    forceDark = false,
    images,
    products,
    locale = DEFAULT_LOCALE,
  }: VariableRecipient & {
    origin: string;
    forceDark?: boolean;
    images?: CampaignBlockImages;
    products?: CampaignBlockProducts;
    locale?: Locale;
  },
): RenderedEmail {
  const base = origin.replace(/\/$/, "");
  const rendered = renderCampaignFor(campaign, {
    firstName,
    lastName,
    pointsBalance,
    pillow,
    origin: base,
    locale,
    claimUrl: null,
    unsubscribeUrl: `${base}${withLocale("/unsubscribe", locale)}`,
    ...(images ? { images } : {}),
    ...(products ? { products } : {}),
    placeholders: { ...CAMPAIGN_PLACEHOLDERS, ...CONTENT_PLACEHOLDERS },
  });
  return forceDark ? { ...rendered, html: forceDarkMode(rendered.html) } : rendered;
}

/** What an email shows from the platform at render, beyond its own words. */
export interface CampaignRenderData {
  images: CampaignBlockImages;
  products: CampaignBlockProducts;
  /** The same products with their names as the 中文 shop shows them, for a campaign with a 中文 version (slice 17); else null. */
  chineseProducts: CampaignBlockProducts | null;
  /** What stops a send: a product not in the shop, by name, or an image with no email copy; null when none. */
  problem: string | null;
  /** The reads behind `problem`, which the checks before a wave name block by block (slice 11). */
  imageFailures: CampaignImageFailure[];
  unlisted: UnlistedProduct[];
  productsError: string | null;
}

/** Pure — the products as a reader in `language` sees them: the 中文 shop's names in the 中文 version. */
export const productsFor = (shown: Pick<CampaignRenderData, "products" | "chineseProducts">, language: Locale): CampaignBlockProducts =>
  (language === CHINESE && shown.chineseProducts) || shown.products;

/**
 * Everything the email shows from the platform, read once for a preview, a
 * test or a batch: each product as the shop sells it now (slice 07), in
 * Chinese too for a campaign with a 中文 version (slice 17), then each
 * image's email rendition, the products' photos included (slice 05). Never
 * throws; a preview draws a hint for what is missing, a send stops on
 * `problem`.
 */
export async function readCampaignRenderData(admin: SupabaseClient, content: Campaign["content"]): Promise<CampaignRenderData> {
  const [shop, chineseShop] = await Promise.all([
    readCampaignProducts(admin, content),
    chineseVersionOf(content) ? readCampaignProducts(admin, content, { locale: CHINESE }) : null,
  ]);
  const photos = campaignProductPhotos(shop);
  const pictures = await readCampaignImages(admin, content, photos);
  // A product's photo is the shop's, not a block's: name the product it shows.
  const placed = new Set(content ? imageAssetsIn(content) : []);
  const ofBlocks = pictures.failed.filter((f) => placed.has(f.assetId));
  const ofProducts = pictures.failed.filter((f) => !placed.has(f.assetId));
  const product = ofProducts.length ? Object.values(shop.products).find((p) => p.image?.asset === ofProducts[0].assetId) : undefined;
  const problem =
    campaignProductsProblem(shop) ??
    (ofBlocks.length
      ? campaignImagesProblem({ ...pictures, failed: ofBlocks })
      : product
        ? `the photo of ${product.title} has no copy an inbox can show: ${ofProducts[0].reason}`
        : campaignImagesProblem(pictures));
  // A failed 中文 read leaves the English names: a reader of Chinese still gets each product.
  return {
    images: pictures.images,
    products: shop.products,
    chineseProducts: chineseShop && !chineseShop.error ? chineseShop.products : null,
    problem,
    imageFailures: pictures.failed,
    unlisted: shop.unlisted,
    productsError: shop.error,
  };
}

/**
 * The 中文 version as a check (slice 17), for a Campaign that has one; null
 * for one that does not. It fails while a block, the subject or a Variable's
 * fallback is not translated, or out of date and not kept, naming each; a
 * block's issue carries its id, so the Send card goes to it in 中文. One of
 * the email's own checks before a wave (slice 11, `campaignEmailChecks`).
 */
export function chineseCheck(campaign: Pick<Campaign, "subject" | "preheader" | "content" | "greeting">): ContentCheck | null {
  const { content } = campaign;
  if (!content || !chineseVersionOf(content)) return null;
  const problems = chineseVersionProblems(content, { subject: campaign.subject, preheader: campaign.preheader, used: variablesInEmail(campaign) });
  // A block's problem names it as its gap does (*Block 3, Heading: …*).
  const gaps = chineseGaps(content);
  const issues = problems.map((text): ContentIssue => {
    const gap = gaps.find((g) => text.startsWith(`Block ${g.n}, `));
    return { blockId: gap?.id ?? null, text: `中文, ${text}`, what: gap ? CHINESE_STATUS_TEXT[gap.status] : text, language: CHINESE };
  });
  return {
    key: "chinese",
    ok: problems.length === 0,
    advisory: false,
    issues,
    detail: problems.length
      ? `the 中文 version isn't finished: ${problems.join("; ")}. Translate them, or keep the 中文 words as they are, before sending`
      : "every block, the subject and the preview line are in Chinese",
  };
}

/**
 * Pure — the Campaign as a wave sends it, for the checks before a wave
 * (slice 11): rendered for a send, never as the preview (no placeholders, the
 * light HTML), for the sample customer, with a signed unsubscribe link as
 * long as every recipient's. What Gmail's clip is measured on. Throws, as a
 * send does, on an image or a product the reads found nothing for. `locale`
 * `zh-CN` renders the 中文 version, as a reader of Chinese gets it (slice
 * 17), with `products` named as the 中文 shop names them (`productsFor`).
 */
export function renderCampaignAsSent(
  campaign: CampaignEmailParts,
  {
    origin,
    unsubscribeSecret,
    images,
    products,
    locale = DEFAULT_LOCALE,
  }: { origin: string; unsubscribeSecret?: string; images: CampaignBlockImages; products: CampaignBlockProducts; locale?: Locale },
): RenderedEmail {
  const base = origin.replace(/\/$/, "");
  return renderCampaignFor(campaign, {
    ...SAMPLE_RECIPIENT,
    origin: base,
    locale,
    claimUrl: null,
    unsubscribeUrl: unsubscribeLinks(PROBE_CUSTOMER_ID, { origin: base, locale, secret: unsubscribeSecret })?.pageUrl ?? `${base}${withLocale("/unsubscribe", locale)}`,
    images,
    products,
  });
}

/** The pause rule as a check: the latest wave of any campaign email. */
export function pauseCheck(stats: readonly CampaignWaveStats[], resume: boolean): PreflightCheck {
  const pause = wavePause(stats);
  return {
    key: "pause",
    ok: !pause.paused || resume,
    detail: pause.paused
      ? `the last wave (${pause.wave}) ${pause.reason}; ${resume ? "sending anyway, as you chose" : "look into who bounced or complained before sending more"}`
      : "no recent wave has too many bounces or complaints",
  };
}

const originOf = (setup: DeliverySetup) => setup.origin.replace(/\/$/, "");

/** What the points rule and the 中文 check read. */
type CampaignWordsRead = Pick<Campaign, "subject" | "preheader" | "body" | "button" | "content" | "greeting">;

/**
 * Points as a check, for a Campaign that mentions them; null for one that
 * does not. It fails until points are on, launched, and grant a Claim bonus.
 */
export async function pointsCheck(admin: SupabaseClient, campaign: CampaignWordsRead, now: Date = new Date()): Promise<PreflightCheck | null> {
  if (!mentionsPoints(campaign)) return null;
  try {
    const offer = claimBonusOffer(await readPointsSettings(admin), now);
    return {
      key: "points",
      ok: offer.live,
      detail: offer.live
        ? `points are live: a sign-in within ${offer.months} months grants ${offer.points} (${offer.amount})`
        : `this email mentions points, and ${offer.reason}: turn points on in Discounts → Points before sending it`,
    };
  } catch (err) {
    return { key: "points", ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * The checks with no network call, which every batch repeats in case the
 * configuration changed mid-wave. The probes ran when the wave was planned.
 */
function quickChecks(setup: DeliverySetup): string | null {
  if (setup.transport?.name !== "resend") return "campaign email is not set up: the transport is not Resend";
  const from = checkCampaignFrom({ from: setup.campaignFrom, domain: setup.campaignDomain, orderFrom: setup.orderFrom });
  if (!from.ok) return from.reason;
  if (!emailAddressOf(setup.replyTo)) return "no support inbox for Reply-To: set SUPPORT_EMAIL";
  return null;
}

// ---------------------------------------------------------------------------
// The send limit
// ---------------------------------------------------------------------------

const count = (v: number) => v.toLocaleString("en-SG");

/** What the plan's limits leave now: every campaign email and test of the last 24 hours and 31 days. */
export async function readSendAllowance(setup: Pick<CampaignSenderSetup, "admin" | "sendLimits" | "now">): Promise<SendAllowance> {
  const now = (setup.now ?? (() => new Date()))();
  const limits = typeof setup.sendLimits === "function" ? setup.sendLimits() : (setup.sendLimits ?? RESEND_FREE_SEND_LIMITS);
  return sendAllowance(limits, await readRecentCampaignSends(setup.admin, now));
}

/** Pure — the send limit as a check: it fails while nothing is left. */
export function allowanceCheck(allowance: SendAllowance | null, error?: string): PreflightCheck {
  if (!allowance) return { key: "send_limit", ok: false, detail: error ?? "the send limit could not be counted" };
  const { limits, used, remaining, binding } = allowance;
  const counted = `${count(used.daily)} of ${count(limits.daily)} sent in the last 24 hours, ${count(used.monthly)} of ${count(limits.monthly)} in the last 31 days`;
  return {
    key: "send_limit",
    ok: remaining > 0,
    detail:
      remaining > 0
        ? `${counted}: up to ${count(remaining)} more now`
        : `${counted}: the ${binding === "daily" ? "day's" : "month's"} ${count(binding === "daily" ? limits.daily : limits.monthly)} are used; ${roomAgainText(allowance)}`,
  };
}

async function tryAllowance(setup: CampaignSenderSetup): Promise<{ allowance: SendAllowance | null; error?: string }> {
  try {
    return { allowance: await readSendAllowance(setup) };
  } catch (err) {
    return { allowance: null, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// The Sending card
// ---------------------------------------------------------------------------

/** Who a campaign email is from and where replies go, as configured: shown to Staff, never typed. */
export interface CampaignSender {
  from: string | null;
  replyTo: string | null;
}

const senderOf = (setup: DeliverySetup): CampaignSender => ({
  from: setup.campaignFrom?.trim() || null,
  replyTo: emailAddressOf(setup.replyTo),
});

export interface SendingStatus {
  sender: CampaignSender;
  /** The delivery checks with no network call, then whether reports can arrive. */
  checks: PreflightCheck[];
  allowance: SendAllowance | null;
  allowanceError: string | null;
  /** Today's kept-sending emails across campaigns (PRD-campaign-audiences slice 10); null when they could not be counted. */
  keptToday: number | null;
}

/**
 * The Email campaigns page's Sending card: is Resend set up, from which
 * address, where replies go, whether bounces and spam reports can arrive, and
 * how much of the plan is left. It names no key: a key never leaves the
 * server. Changes nothing, and calls no other site.
 */
export async function readSendingStatus(setup: CampaignSenderSetup): Promise<SendingStatus> {
  const checks = campaignConfigChecks(setup);
  checks.push({
    key: "reports",
    ok: Boolean(setup.reportsConfigured),
    detail: setup.reportsConfigured
      ? "Resend reports bounces and spam to this site, so they are left out of later sends"
      : "CAMPAIGN_RESEND_WEBHOOK_SECRET is not set: bounces and spam reports are not recorded, and the pause rule cannot see them",
  });
  const [{ allowance, error }, keptToday] = await Promise.all([
    tryAllowance(setup),
    readKeptToday(setup.admin, (setup.now ?? (() => new Date()))()).catch(() => null),
  ]);
  return { sender: senderOf(setup), checks, allowance, allowanceError: allowance ? null : (error ?? null), keptToday };
}

// ---------------------------------------------------------------------------
// Checks and the plan
// ---------------------------------------------------------------------------

export interface CampaignReadiness {
  /** Every check that holds a wave; the email's own (slice 11) carry their issues, block by block. */
  checks: (PreflightCheck | ContentCheck)[];
  /** The email's advice (*Recommended:*), listed only when there is some: it never holds a wave. */
  advice: ContentCheck[];
  /** Every check passed. */
  ready: boolean;
  /** The send limit's room now; null when it could not be counted (its check then fails). */
  allowance: SendAllowance | null;
  sender: CampaignSender;
}

/**
 * The email's own checks before a wave (PRD-campaign-email-editor slice 11):
 * every block written, links that answer, images with alt text that are email
 * copies, under Gmail's clip as sent, fallback words, no health claim, the
 * products in the shop and points only while live, then the advice. Reads
 * what they need first (the images and products a send reads, today's points
 * rule, and what each link answers, kept ten minutes unless `fresh`), then
 * runs the pure `campaignContentChecks` on the English and, for a campaign
 * with one, on its 中文 version (slice 17) as a reader of Chinese gets it,
 * with `chineseCheck` (every block of it translated and current) beside them.
 * A campaign written before blocks keeps today's points rule alone.
 * `aiDrafted` is the blocks still marked *Drafted with AI* (slice 09): the
 * saved content's marks (`content.aiDrafted`) unless the caller passes the
 * editor's. The 中文 version's are its own (`chineseAiDrafted`). Changes
 * nothing.
 */
export async function campaignEmailChecks(
  setup: CampaignSenderSetup,
  campaign: CampaignEmailParts,
  { fresh = false, aiDrafted }: { fresh?: boolean; aiDrafted?: readonly string[] } = {},
): Promise<ContentCheck[]> {
  const points = await pointsCheck(setup.admin, campaign);
  const { content } = campaign;
  if (!content) {
    return points ? [{ ...points, advisory: false, issues: points.ok ? [] : [{ blockId: null, text: points.detail, what: points.detail }] }] : [];
  }
  const origin = originOf(setup);
  const shown = await readCampaignRenderData(setup.admin, content);
  const answers = setup.linkRequest ? await checkLinks(addressesToAsk(content, { origin, images: shown.images }), { request: setup.linkRequest, fresh }) : {};
  const asSent = (locale: Locale): { html: string } | { error: string } => {
    try {
      const products = productsFor(shown, locale);
      return { html: renderCampaignAsSent(campaign, { origin, unsubscribeSecret: setup.unsubscribeSecret, images: shown.images, products, locale }).html };
    } catch (err) {
      return { error: shown.problem ?? (err instanceof Error ? err.message : String(err)) };
    }
  };
  const facts: EmailFacts = {
    origin,
    images: shown.images,
    imageFailures: shown.imageFailures,
    products: shown.products,
    unlisted: shown.unlisted.map((u) => ({ productId: u.productId, problem: unlistedProductText(u) })),
    productsError: shown.productsError,
    // `pointsCheck` reads the 中文 words too: one rule for both versions.
    points,
    answers,
  };
  const english = campaignContentChecks(
    { language: DEFAULT_LOCALE, subject: campaign.subject, preheader: campaign.preheader, greeting: campaign.greeting, content, rendered: asSent(DEFAULT_LOCALE) },
    { ...facts, aiDrafted: aiDrafted ?? aiDraftedBlocks(content).map((b) => b.id) },
  );
  const version = chineseVersionOf(content);
  const chinese = chineseCheck(campaign);
  if (!version || !chinese) return english;
  // The 中文 version (slice 17): the English layout with its 中文 words, checked as a reader of Chinese gets it,
  // with its own *Drafted with AI* marks: the 中文 words Claude wrote that nobody has read since.
  const zh = campaignContentChecks(
    { language: CHINESE, subject: version.subject, preheader: version.preheader, greeting: campaign.greeting, content: chineseContent(content), rendered: asSent(CHINESE) },
    { ...facts, products: productsFor(shown, CHINESE), aiDrafted: chineseAiDrafted(content) },
  );
  const joined = joinVersionChecks(english, zh);
  // Its own row, every block translated and current, with the checks that hold the wave, before the advice.
  const held = joined.filter((c) => !c.advisory);
  return [...held, chinese, ...joined.filter((c) => c.advisory)];
}

/**
 * Every check, for the page's status panel. Changes nothing. With a
 * campaign its email's checks join them (slice 11), again before each wave:
 * a link can die, or a product be un-listed, between waves days apart. Those
 * that hold a wave are in `checks`; the advice is in `advice`. `freshLinks`
 * asks every link again rather than reuse an answer from the last ten
 * minutes, as the wave's own check does; `aiDrafted`, when passed, stands
 * for the saved content's *Drafted with AI* marks (`campaignEmailChecks`).
 */
export async function campaignReadiness(
  setup: CampaignSenderSetup,
  {
    campaign,
    resume = false,
    freshLinks = false,
    aiDrafted,
  }: { campaign?: Pick<Campaign, "id"> & CampaignEmailParts; resume?: boolean; freshLinks?: boolean; aiDrafted?: readonly string[] } = {},
): Promise<CampaignReadiness> {
  const [checks, room] = await Promise.all([campaignDeliveryChecks(setup), tryAllowance(setup)]);
  try {
    const { all } = await readWaveStats(setup.admin, campaign?.id ?? "");
    checks.push(pauseCheck(all, resume));
  } catch (err) {
    checks.push({ key: "pause", ok: false, detail: err instanceof Error ? err.message : String(err) });
  }
  const email = campaign ? await campaignEmailChecks(setup, campaign, { fresh: freshLinks, aiDrafted }) : [];
  const held: (PreflightCheck | ContentCheck)[] = [...checks, ...email.filter((c) => !c.advisory), allowanceCheck(room.allowance, room.error)];
  return { checks: held, advice: email.filter((c) => c.advisory), ready: held.every((c) => c.ok), allowance: room.allowance, sender: senderOf(setup) };
}

export interface WavePlanResult {
  readiness: CampaignReadiness;
  /** The next wave's label. */
  wave: string;
  plan: Omit<CampaignPlan, "selection">;
  /** Who the wave goes to, in send order: ids only. */
  customerIds: string[];
  /** The size asked for. */
  requested: number;
  /** The limit that cut the wave below what was asked for and is eligible; null when none did. */
  limitedBy: "daily" | "monthly" | null;
  /** Eligible people this wave leaves for later waves. */
  waiting: number;
  /**
   * Who each left-out Segment took away before the rule ran
   * (PRD-campaign-audiences slice 06), in the campaign's order; empty with none.
   */
  leftOutBySegment: LeftOutBySegment[];
  /**
   * Where the email and the wave's people do not match (slice 09,
   * fit-checks.ts): advice only, listed with the email's own; empty when
   * nothing to say.
   */
  fit: ContentCheck[];
}

/** A Segment a campaign leaves out, as the wave reads it: its name, and its Customers' ids page by page. */
export interface CampaignExclusionSource {
  segmentId: string;
  name: string;
  ids: () => AsyncIterable<string[]>;
}

/** Every id each left-out Segment chooses now. Throws, as `resolveSegment` does, for one that cannot be read. */
async function readExclusions(sources: readonly CampaignExclusionSource[]): Promise<SegmentExclusion[]> {
  return Promise.all(
    sources.map(async (x) => {
      const customerIds = new Set<string>();
      for await (const page of x.ids()) for (const id of page) customerIds.add(id);
      return { segmentId: x.segmentId, name: x.name, customerIds };
    }),
  );
}

/**
 * The checks, and who a wave of `size` would go to now. Changes nothing; the
 * caller locks the Campaign before the first batch.
 *
 * `exclusions` are the Segments the Campaign leaves out (PRD-campaign-audiences
 * slice 06): their Customers are dropped from the audience before the rule
 * runs, whatever the audience. A left-out Segment that cannot be read refuses
 * the wave, never leaves nobody out.
 */
export async function planWave(
  campaign: Campaign,
  {
    size,
    retryFailed = false,
    resume = false,
    freshLinks = false,
  }: { size: number; retryFailed?: boolean; resume?: boolean; freshLinks?: boolean },
  setup: CampaignSenderSetup,
  segmentIds?: () => AsyncIterable<string[]>,
  exclusions: readonly CampaignExclusionSource[] = [],
): Promise<WavePlanResult> {
  if (campaign.archivedAt) throw new Error("This campaign is archived.");
  const n = Math.floor(size);
  if (!Number.isInteger(n) || n < 1 || n > MAX_WAVE_SIZE) {
    throw new Error(`A wave is 1 to ${MAX_WAVE_SIZE} people.`);
  }
  const [readiness, waves, audience, leaveOut] = await Promise.all([
    campaignReadiness(setup, { campaign, resume, freshLinks }),
    readWaveStats(setup.admin, campaign.id),
    readCampaignCandidates(setup.admin, campaign, segmentIds),
    readExclusions(exclusions),
  ]);
  const { candidates, leftOut } = excludeSegmentMembers(audience, leaveOut);
  // Never past today's room: the rest of the audience waits for the next wave.
  const room = readiness.allowance?.remaining ?? 0;
  const { selection, ...plan } = planCampaignWave(campaign.audience, candidates, {
    size: Math.min(n, room),
    retryFailed,
    // Slice 11: who its holdout will keep back, so the plan can say so.
    holdout: Boolean(campaign.keepSending?.holdoutAt),
  });
  const wanted = Math.min(n, plan.eligible);
  const customerIds = selection.map((c) => c.customerId);
  return {
    readiness,
    wave: nextWaveLabel(waves.own.map((w) => w.wave)),
    plan,
    customerIds,
    requested: n,
    limitedBy: readiness.allowance && selection.length < wanted ? readiness.allowance.binding : null,
    waiting: plan.eligible - selection.length,
    leftOutBySegment: leftOut,
    fit: await fitChecks(campaign, customerIds, setup),
  };
}

/**
 * The fit checks over the wave's people (slice 09). Advice: a read that fails
 * says so in one line, and holds nothing.
 */
async function fitChecks(campaign: Campaign, customerIds: readonly string[], setup: CampaignSenderSetup): Promise<ContentCheck[]> {
  if (!customerIds.length) return [];
  try {
    const productIds = campaign.content
      ? [...new Set(campaign.content.blocks.flatMap((b) => (b.type === "products" ? b.products : [])).filter(Boolean))]
      : [];
    const [recipients, classes] = await Promise.all([readRecipientFacts(setup.admin, customerIds), readProductClasses(setup.admin, productIds)]);
    return campaignFitChecks(campaign, recipients, { origin: originOf(setup), productClasses: classes, now: setup.now?.() ?? new Date() });
  } catch (err) {
    return [fitUnreadCheck(err instanceof Error ? err.message : String(err))];
  }
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

export interface BatchResult {
  sent: number;
  failed: number;
  /** Left out at the moment of sending, by reason (they unsubscribed, were sent already...). */
  skipped: Partial<Record<string, number>>;
  /** Failures in a row at the end of the batch, carried into the next. */
  failuresInARow: number;
  /** Why the wave must stop, if it must. */
  stopped: string | null;
  /** The first few errors, without addresses. */
  errors: string[];
}

/**
 * Sends one batch of a wave: at most {@link BATCH_SIZE} Customers, each
 * claimed in the ledger before the send. Never throws for one recipient.
 */
export async function sendCampaignBatch(
  campaign: Campaign,
  {
    wave,
    customerIds,
    retryFailed = false,
    failuresInARow = 0,
  }: { wave: string; customerIds: readonly string[]; retryFailed?: boolean; failuresInARow?: number },
  setup: CampaignSenderSetup,
): Promise<BatchResult> {
  const result: BatchResult = { sent: 0, failed: 0, skipped: {}, failuresInARow, stopped: null, errors: [] };
  const fail = (message: string) => {
    result.failed++;
    result.failuresInARow++;
    if (result.errors.length < 5) result.errors.push(message);
  };

  if (!campaign.lockedAt) {
    result.stopped = "the wave was not planned: start it again";
    return result;
  }
  if (campaign.archivedAt) {
    result.stopped = "the campaign is archived";
    return result;
  }
  if (!WAVE_LABEL.test(wave)) {
    result.stopped = `"${wave}" is not a wave label`;
    return result;
  }
  if (customerIds.length > BATCH_SIZE) {
    result.stopped = `a batch is at most ${BATCH_SIZE} people`;
    return result;
  }
  const notReady = quickChecks(setup);
  if (notReady) {
    result.stopped = notReady;
    return result;
  }
  // Every batch, in case points were turned off mid-wave.
  const points = await pointsCheck(setup.admin, campaign);
  if (points && !points.ok) {
    result.stopped = points.detail;
    return result;
  }
  // Every batch too: the script or a second tab may have used the room since the wave was planned.
  const room = await tryAllowance(setup);
  if (!room.allowance) {
    result.stopped = room.error ?? "the send limit could not be counted";
    return result;
  }
  if (room.allowance.remaining === 0) {
    result.stopped = `the send limit is reached (${roomAgainText(room.allowance)}); the rest go in the next wave`;
    return result;
  }
  const ids = customerIds.slice(0, room.allowance.remaining);
  // Once for the batch: each product as the shop sells it now, so a price
  // changed in Costings reaches the next batch, and a product un-listed
  // mid-wave stops it (slice 07); each image's email rendition (slice 05).
  const shown = await readCampaignRenderData(setup.admin, campaign.content);
  if (shown.problem) {
    result.stopped = shown.problem;
    return result;
  }

  const sleep = setup.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const transport = setup.transport!;
  const from = setup.campaignFrom!.trim();
  const replyTo = emailAddressOf(setup.replyTo)!;
  const origin = originOf(setup);
  const key = campaignLedgerKey(campaign.id);
  // Each balance is a read of its own: only for an email that says it.
  const readsPoints = usesPointsBalance(campaign);
  // Their pillows, once for the batch: only for an email that says *Your pillow* (slice 09).
  let pillows = new Map<string, RecipientPillow>();
  if (usesYourPillow(campaign)) {
    try {
      pillows = await readLatestPillows(setup.admin, ids);
    } catch (err) {
      result.stopped = err instanceof Error ? err.message : String(err);
      return result;
    }
  }

  for (const customerId of ids) {
    if (result.failuresInARow >= MAX_CONSECUTIVE_FAILURES) {
      result.stopped = `${MAX_CONSECUTIVE_FAILURES} sends in a row failed`;
      break;
    }
    const claim = await claimMarketingCampaignSend(setup.admin, { customerId, campaignId: campaign.id, wave, retryFailed });
    if ("error" in claim) {
      fail(`could not claim a send: ${claim.error}`);
      continue;
    }
    if (!claim.claimed) {
      result.skipped[claim.blocker] = (result.skipped[claim.blocker] ?? 0) + 1;
      if (claim.blocker === "campaign_archived" || claim.blocker === "unknown_campaign") {
        result.stopped = CAMPAIGN_BLOCKER_TEXT[claim.blocker];
        break;
      }
      continue;
    }

    const locale: Locale = isSupportedLocale(claim.locale) ? claim.locale : DEFAULT_LOCALE;
    // Their language: the 中文 version for a reader of Chinese, when there is one (slice 17).
    const language = campaignLanguage(campaign, locale);
    try {
      // The unsubscribe link names this send, so leaving is counted against
      // the campaign (PRD-campaign-audiences slice 08).
      const unsubscribe = unsubscribeLinks(customerId, { origin, locale, secret: setup.unsubscribeSecret, sendId: claim.sendId });
      if (!unsubscribe) throw new Error("no unsubscribe link could be signed");
      const claimUrl =
        campaignSignsIn(campaign) && claim.unclaimedMigrated
          ? (await mintClaimLink(setup.admin, { customerId, template: key, locale, origin })).url
          : null;
      // Slice 08: one click token for this email's site links; only its hash is kept.
      const clickToken = newClickToken();
      const rendered = renderCampaignFor(campaign, {
        firstName: claim.firstName,
        lastName: claim.lastName,
        pointsBalance: readsPoints ? (await readPointsBalance(setup.admin, customerId)).available : null,
        pillow: pillows.get(customerId) ?? null,
        origin,
        locale,
        claimUrl,
        unsubscribeUrl: unsubscribe.pageUrl,
        images: shown.images,
        products: productsFor(shown, language),
      });
      const sent = await transport.send({
        ...addClickToken(rendered, clickToken, origin),
        to: claim.email,
        from,
        replyTo,
        headers: listUnsubscribeHeaders(unsubscribe, { mailto: replyTo }),
      });
      await finishCampaignSend(setup.admin, {
        sendId: claim.sendId,
        sent: true,
        providerMessageId: sent.id ?? null,
        clickTokenHash: await hashClickToken(clickToken),
      });
      result.sent++;
      result.failuresInARow = 0;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await finishCampaignSend(setup.admin, { sendId: claim.sendId, sent: false, error: message });
      fail(message);
      if (isSendQuotaError(message)) {
        result.stopped = "Resend's sending quota is used up: wait for room, then retry the failed send";
        break;
      }
    }
    await sleep(THROTTLE_MS);
  }
  if (!result.stopped && result.failuresInARow >= MAX_CONSECUTIVE_FAILURES) {
    result.stopped = `${MAX_CONSECUTIVE_FAILURES} sends in a row failed`;
  }
  if (!result.stopped && ids.length < customerIds.length) {
    result.stopped = "the send limit is reached; the rest go in the next wave";
  }
  return result;
}

const TEST_PREFIX = "[Test] ";

/**
 * Pure — why a 中文 test can't go yet (slice 17), or null: there is no 中文
 * version, or some of it has no words yet. Words out of date still go: a
 * test is how Staff read them.
 */
export function chineseTestBlocker(campaign: Pick<Campaign, "subject" | "preheader" | "content">): string | null {
  const version = chineseVersionOf(campaign.content);
  if (!campaign.content || !version) return "This campaign has no 中文 version: translate it first.";
  const unwritten = chineseVersionProblems(campaign.content, { subject: campaign.subject, preheader: campaign.preheader, used: [] }).filter((p) => /not translated yet/.test(p));
  return unwritten.length ? `The 中文 version isn't finished: ${unwritten.join("; ")}.` : null;
}

/**
 * Sends the Campaign as it is now to up to {@link MAX_TEST_RECIPIENTS}
 * addresses, through the same transport and headers as a real send, with
 * "[Test]" before the subject. It writes nothing to the ledger, its
 * unsubscribe link belongs to no Customer, and its sign-in button goes to
 * the account page. Its Variables are filled from `recipient`: the action
 * passes the sample customer for a block campaign (slice 13), so the test
 * reads like the real thing. `locale` is the language Staff ask for (slice
 * 17): `zh-CN` sends the 中文 version, as a reader of Chinese gets it, once
 * every block of it has words.
 */
export async function sendCampaignTest(
  campaign: CampaignEmailParts,
  { to, locale = DEFAULT_LOCALE, ...recipient }: { to: readonly string[]; locale?: Locale } & VariableRecipient,
  setup: CampaignSenderSetup,
): Promise<{ sent: string[]; failed: { to: string; error: string }[] } | { refused: string }> {
  const addresses = [...new Set(to.map((t) => emailAddressOf(t)).filter((t): t is string => Boolean(t)))];
  if (addresses.length === 0) return { refused: "Enter an email address to send the test to." };
  if (addresses.length > MAX_TEST_RECIPIENTS) return { refused: `A test goes to at most ${MAX_TEST_RECIPIENTS} addresses.` };
  if (locale === CHINESE) {
    const unwritten = chineseTestBlocker(campaign);
    if (unwritten) return { refused: unwritten };
  }
  const notReady = quickChecks(setup);
  if (notReady) return { refused: notReady };
  // Resend counts a test like any send.
  const room = await tryAllowance(setup);
  if (!room.allowance) return { refused: room.error ?? "the send limit could not be counted" };
  if (room.allowance.remaining < addresses.length) {
    return {
      refused:
        room.allowance.remaining === 0
          ? `The send limit is reached, and Resend counts tests too: ${roomAgainText(room.allowance)}.`
          : `Only ${count(room.allowance.remaining)} more can be sent now, and Resend counts tests too: send the test to fewer addresses.`,
    };
  }

  const origin = originOf(setup);
  const replyTo = emailAddressOf(setup.replyTo)!;
  const unsubscribe = unsubscribeLinks(PROBE_CUSTOMER_ID, { origin, secret: setup.unsubscribeSecret });
  if (!unsubscribe) return { refused: "UNSUBSCRIBE_SECRET is not set, so no unsubscribe link can be signed." };
  const shown = await readCampaignRenderData(setup.admin, campaign.content);
  if (shown.problem) return { refused: shown.problem };
  const rendered = renderCampaignFor(campaign, {
    ...recipient,
    origin,
    locale,
    claimUrl: null,
    unsubscribeUrl: unsubscribe.pageUrl,
    images: shown.images,
    products: productsFor(shown, campaignLanguage(campaign, locale)),
  });

  const sleep = setup.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const out = { sent: [] as string[], failed: [] as { to: string; error: string }[] };
  for (const [i, address] of addresses.entries()) {
    if (i > 0) await sleep(THROTTLE_MS);
    try {
      await setup.transport!.send({
        ...rendered,
        subject: `${TEST_PREFIX}${rendered.subject}`,
        to: address,
        from: setup.campaignFrom!.trim(),
        replyTo,
        headers: listUnsubscribeHeaders(unsubscribe, { mailto: replyTo }),
      });
      out.sent.push(address);
    } catch (err) {
      out.failed.push({ to: address, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return out;
}
