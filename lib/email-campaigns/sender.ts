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
  campaignDeliveryChecks,
  campaignDomainCheck,
  campaignSetupChecks,
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

export const BATCH_SIZE = 20;

export interface CampaignSenderSetup extends DeliverySetup {
  admin: SupabaseClient;
  sendLimits?: CampaignSendLimits | (() => CampaignSendLimits);
  reportsConfigured?: boolean;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  linkRequest?: LinkRequest;
}

export const EMAIL_CAMPAIGN_UTM_SOURCE = "email_campaign";

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

export const campaignSignsIn = (campaign: Pick<Campaign, "button" | "content">) =>
  campaign.content ? contentSignsIn(campaign.content) : campaign.button?.target === "sign_in";

export const usesPointsBalance = (campaign: Pick<Campaign, "subject" | "preheader" | "content" | "greeting">) =>
  variablesInEmail(campaign).some((key) => campaignVariable(key).needsPoints);

export const usesYourPillow = (campaign: Pick<Campaign, "subject" | "preheader" | "content" | "greeting">) =>
  variablesInEmail(campaign).includes("your_pillow");

export const campaignLanguage = (campaign: Pick<Campaign, "content">, locale: Locale): Locale =>
  locale === CHINESE && chineseVersionOf(campaign.content) ? CHINESE : DEFAULT_LOCALE;

export type CampaignPreviewPlaceholders = ComposedCampaignPlaceholders & CampaignBlocksPlaceholders;

type CampaignEmailParts = Pick<Campaign, "name" | "subject" | "preheader" | "body" | "content" | "greeting" | "button">;

export function renderCampaignFor(
  campaign: CampaignEmailParts,
  p: VariableRecipient & {
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

export interface CampaignRenderData {
  images: CampaignBlockImages;
  products: CampaignBlockProducts;
  chineseProducts: CampaignBlockProducts | null;
  problem: string | null;
  imageFailures: CampaignImageFailure[];
  unlisted: UnlistedProduct[];
  productsError: string | null;
}

export const productsFor = (shown: Pick<CampaignRenderData, "products" | "chineseProducts">, language: Locale): CampaignBlockProducts =>
  (language === CHINESE && shown.chineseProducts) || shown.products;

export async function readCampaignRenderData(admin: SupabaseClient, content: Campaign["content"]): Promise<CampaignRenderData> {
  const [shop, chineseShop] = await Promise.all([
    readCampaignProducts(admin, content),
    chineseVersionOf(content) ? readCampaignProducts(admin, content, { locale: CHINESE }) : null,
  ]);
  const photos = campaignProductPhotos(shop);
  const pictures = await readCampaignImages(admin, content, photos);
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

export function chineseCheck(campaign: Pick<Campaign, "subject" | "preheader" | "content" | "greeting">): ContentCheck | null {
  const { content } = campaign;
  if (!content || !chineseVersionOf(content)) return null;
  const problems = chineseVersionProblems(content, { subject: campaign.subject, preheader: campaign.preheader, used: variablesInEmail(campaign) });
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

type CampaignWordsRead = Pick<Campaign, "subject" | "preheader" | "body" | "button" | "content" | "greeting">;

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

function quickChecks(setup: DeliverySetup): string | null {
  if (setup.transport?.name !== "resend") return "campaign email is not set up: the transport is not Resend";
  const from = checkCampaignFrom({ from: setup.campaignFrom, domain: setup.campaignDomain, orderFrom: setup.orderFrom });
  if (!from.ok) return from.reason;
  if (!emailAddressOf(setup.replyTo)) return "no support inbox for Reply-To: set SUPPORT_EMAIL";
  return null;
}

const count = (v: number) => v.toLocaleString("en-SG");

export async function readSendAllowance(setup: Pick<CampaignSenderSetup, "admin" | "sendLimits" | "now">): Promise<SendAllowance> {
  const now = (setup.now ?? (() => new Date()))();
  const limits = typeof setup.sendLimits === "function" ? setup.sendLimits() : (setup.sendLimits ?? RESEND_FREE_SEND_LIMITS);
  return sendAllowance(limits, await readRecentCampaignSends(setup.admin, now));
}

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
  checks: PreflightCheck[];
  allowance: SendAllowance | null;
  allowanceError: string | null;
  keptToday: number | null;
}

export async function readSendingStatus(setup: CampaignSenderSetup): Promise<SendingStatus> {
  const checks = await campaignSetupChecks(setup);
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

export interface CampaignReadiness {
  checks: (PreflightCheck | ContentCheck)[];
  advice: ContentCheck[];
  ready: boolean;
  allowance: SendAllowance | null;
  sender: CampaignSender;
}

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
  const zh = campaignContentChecks(
    { language: CHINESE, subject: version.subject, preheader: version.preheader, greeting: campaign.greeting, content: chineseContent(content), rendered: asSent(CHINESE) },
    { ...facts, products: productsFor(shown, CHINESE), aiDrafted: chineseAiDrafted(content) },
  );
  const joined = joinVersionChecks(english, zh);
  const held = joined.filter((c) => !c.advisory);
  return [...held, chinese, ...joined.filter((c) => c.advisory)];
}

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
  wave: string;
  plan: Omit<CampaignPlan, "selection">;
  customerIds: string[];
  requested: number;
  limitedBy: "daily" | "monthly" | null;
  waiting: number;
  leftOutBySegment: LeftOutBySegment[];
  fit: ContentCheck[];
}

export interface CampaignExclusionSource {
  segmentId: string;
  name: string;
  ids: () => AsyncIterable<string[]>;
}

async function readExclusions(sources: readonly CampaignExclusionSource[]): Promise<SegmentExclusion[]> {
  return Promise.all(
    sources.map(async (x) => {
      const customerIds = new Set<string>();
      for await (const page of x.ids()) for (const id of page) customerIds.add(id);
      return { segmentId: x.segmentId, name: x.name, customerIds };
    }),
  );
}

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
  const room = readiness.allowance?.remaining ?? 0;
  const { selection, ...plan } = planCampaignWave(campaign.audience, candidates, {
    size: Math.min(n, room),
    retryFailed,
    holdout: Boolean(campaign.keepSending?.holdoutAt),
    includeUnengaged: campaign.includeUnengaged,
    now: setup.now?.() ?? new Date(),
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

export interface BatchResult {
  sent: number;
  failed: number;
  skipped: Partial<Record<string, number>>;
  failuresInARow: number;
  stopped: string | null;
  errors: string[];
}

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
  const points = await pointsCheck(setup.admin, campaign);
  if (points && !points.ok) {
    result.stopped = points.detail;
    return result;
  }
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
  const readsPoints = usesPointsBalance(campaign);
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
    const language = campaignLanguage(campaign, locale);
    try {
      const unsubscribe = unsubscribeLinks(customerId, { origin, locale, secret: setup.unsubscribeSecret, sendId: claim.sendId });
      if (!unsubscribe) throw new Error("no unsubscribe link could be signed");
      const claimUrl =
        campaignSignsIn(campaign) && claim.unclaimedMigrated
          ? (await mintClaimLink(setup.admin, { customerId, template: key, locale, origin })).url
          : null;
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

export function chineseTestBlocker(campaign: Pick<Campaign, "subject" | "preheader" | "content">): string | null {
  const version = chineseVersionOf(campaign.content);
  if (!campaign.content || !version) return "This campaign has no 中文 version: translate it first.";
  const unwritten = chineseVersionProblems(campaign.content, { subject: campaign.subject, preheader: campaign.preheader, used: [] }).filter((p) => /not translated yet/.test(p));
  return unwritten.length ? `The 中文 version isn't finished: ${unwritten.join("; ")}.` : null;
}

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
  const domain = await campaignDomainCheck(setup);
  if (!domain.ok) return { refused: domain.detail };
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
