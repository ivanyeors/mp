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
 * held back by it.
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
 * them, and their points balance, read only for an email that says it. About
 * two a second (Resend's default limit); a batch stops after five failures in
 * a row.
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
import { renderCampaignBlocksEmail, type CampaignBlocksPlaceholders } from "@/lib/email/campaign-blocks";
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
  mentionsPoints,
  MAX_TEST_RECIPIENTS,
  MAX_WAVE_SIZE,
  nextWaveLabel,
  planCampaignWave,
  variablesInEmail,
  WAVE_LABEL,
  type Campaign,
  type CampaignPlan,
} from "./rules";
import { contentSignsIn, CONTENT_PLACEHOLDERS, SITE_BUTTON_PATHS, type BlockButton } from "./content";
import { roomAgainText } from "./send-flow";
import { claimMarketingCampaignSend, finishCampaignSend, readCampaignCandidates, readWaveStats } from "./store";
import { campaignVariable, variableValues, type VariableRecipient } from "./variables";

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
 * button; for `url` the link Staff typed.
 */
export function blockButtonHref(
  b: BlockButton,
  campaignName: string,
  { origin, locale, claimUrl }: { origin: string; locale: Locale; claimUrl: string | null },
): string | null {
  if (b.target === "url") return b.url ? withEmailCampaignUtm(b.url, campaignName, origin) : null;
  if (b.target === "sign_in" && claimUrl) return claimUrl;
  const path = b.target === "sign_in" ? "/account" : SITE_BUTTON_PATHS[b.target];
  return withEmailCampaignUtm(`${origin}${withLocale(path, locale)}`, campaignName, origin);
}

/** Pure — a button of the Campaign goes to the recipient's sign-in, so each send mints their Claim link. */
export const campaignSignsIn = (campaign: Pick<Campaign, "button" | "content">) =>
  campaign.content ? contentSignsIn(campaign.content) : campaign.button?.target === "sign_in";

/** Pure — the Campaign says each recipient's *Points balance* (slice 13), so each send reads it. */
export const usesPointsBalance = (campaign: Pick<Campaign, "subject" | "preheader" | "content" | "greeting">) =>
  variablesInEmail(campaign).some((key) => campaignVariable(key).needsPoints);

/** What an empty field shows in the editor's preview, legacy or blocks. */
export type CampaignPreviewPlaceholders = ComposedCampaignPlaceholders & CampaignBlocksPlaceholders;

/** The Campaign's parts an email is rendered from. */
type CampaignEmailParts = Pick<Campaign, "name" | "subject" | "preheader" | "body" | "content" | "greeting" | "button">;

/**
 * Pure — the Campaign as one recipient gets it: its blocks, or the plain-text
 * body of a campaign written before them, which keeps its own renderer
 * (PRD-campaign-email-editor decision 5). `placeholders` is the editor's
 * preview's alone (`renderCampaignPreview`): no send passes it.
 */
export function renderCampaignFor(
  campaign: CampaignEmailParts,
  p: {
    firstName: string | null;
    /** The recipient's other details, for the Variables a block campaign uses (slice 13). */
    lastName?: string | null;
    pointsBalance?: number | null;
    origin: string;
    locale: Locale;
    claimUrl: string | null;
    unsubscribeUrl: string;
    placeholders?: CampaignPreviewPlaceholders;
  },
): RenderedEmail {
  if (campaign.content) {
    return renderCampaignBlocksEmail({
      subject: campaign.subject,
      preheader: campaign.preheader,
      content: campaign.content,
      greeting: campaign.greeting,
      values: variableValues(p, campaign.content.fallbacks),
      buttonHref: (b) => blockButtonHref(b, campaign.name, p),
      unsubscribeUrl: p.unsubscribeUrl,
      ...(p.placeholders ? { placeholders: p.placeholders } : {}),
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
 * type level).
 *
 * The sample customer is the caller's: *Preview as* (slice 13) passes
 * `SAMPLE_RECIPIENT` for *A customer*, or `NO_DETAILS` to show every fallback.
 */
export function renderCampaignPreview(
  campaign: CampaignEmailParts,
  {
    origin,
    firstName,
    lastName = null,
    pointsBalance = null,
    forceDark = false,
  }: { origin: string; firstName: string | null; lastName?: string | null; pointsBalance?: number | null; forceDark?: boolean },
): RenderedEmail {
  const base = origin.replace(/\/$/, "");
  const rendered = renderCampaignFor(campaign, {
    firstName,
    lastName,
    pointsBalance,
    origin: base,
    locale: DEFAULT_LOCALE,
    claimUrl: null,
    unsubscribeUrl: `${base}${withLocale("/unsubscribe", DEFAULT_LOCALE)}`,
    placeholders: { ...CAMPAIGN_PLACEHOLDERS, ...CONTENT_PLACEHOLDERS },
  });
  return forceDark ? { ...rendered, html: forceDarkMode(rendered.html) } : rendered;
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

/** What the points rule reads. */
type CampaignWordsRead = Pick<Campaign, "subject" | "preheader" | "body" | "button" | "content">;

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
  const { allowance, error } = await tryAllowance(setup);
  return { sender: senderOf(setup), checks, allowance, allowanceError: allowance ? null : (error ?? null) };
}

// ---------------------------------------------------------------------------
// Checks and the plan
// ---------------------------------------------------------------------------

export interface CampaignReadiness {
  checks: PreflightCheck[];
  /** Every check passed. */
  ready: boolean;
  /** The send limit's room now; null when it could not be counted (its check then fails). */
  allowance: SendAllowance | null;
  sender: CampaignSender;
}

/** Every check, for the page's status panel. Changes nothing. */
export async function campaignReadiness(
  setup: CampaignSenderSetup,
  { campaign, resume = false }: { campaign?: Pick<Campaign, "id"> & CampaignWordsRead; resume?: boolean } = {},
): Promise<CampaignReadiness> {
  const [checks, room] = await Promise.all([campaignDeliveryChecks(setup), tryAllowance(setup)]);
  try {
    const { all } = await readWaveStats(setup.admin, campaign?.id ?? "");
    checks.push(pauseCheck(all, resume));
  } catch (err) {
    checks.push({ key: "pause", ok: false, detail: err instanceof Error ? err.message : String(err) });
  }
  const points = campaign ? await pointsCheck(setup.admin, campaign) : null;
  if (points) checks.push(points);
  checks.push(allowanceCheck(room.allowance, room.error));
  return { checks, ready: checks.every((c) => c.ok), allowance: room.allowance, sender: senderOf(setup) };
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
}

/**
 * The checks, and who a wave of `size` would go to now. Changes nothing; the
 * caller locks the Campaign before the first batch.
 */
export async function planWave(
  campaign: Campaign,
  { size, retryFailed = false, resume = false }: { size: number; retryFailed?: boolean; resume?: boolean },
  setup: CampaignSenderSetup,
  segmentIds?: () => AsyncIterable<string[]>,
): Promise<WavePlanResult> {
  if (campaign.archivedAt) throw new Error("This campaign is archived.");
  const n = Math.floor(size);
  if (!Number.isInteger(n) || n < 1 || n > MAX_WAVE_SIZE) {
    throw new Error(`A wave is 1 to ${MAX_WAVE_SIZE} people.`);
  }
  const [readiness, waves, candidates] = await Promise.all([
    campaignReadiness(setup, { campaign, resume }),
    readWaveStats(setup.admin, campaign.id),
    readCampaignCandidates(setup.admin, campaign, segmentIds),
  ]);
  // Never past today's room: the rest of the audience waits for the next wave.
  const room = readiness.allowance?.remaining ?? 0;
  const { selection, ...plan } = planCampaignWave(campaign.audience, candidates, { size: Math.min(n, room), retryFailed });
  const wanted = Math.min(n, plan.eligible);
  return {
    readiness,
    wave: nextWaveLabel(waves.own.map((w) => w.wave)),
    plan,
    customerIds: selection.map((c) => c.customerId),
    requested: n,
    limitedBy: readiness.allowance && selection.length < wanted ? readiness.allowance.binding : null,
    waiting: plan.eligible - selection.length,
  };
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

  const sleep = setup.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const transport = setup.transport!;
  const from = setup.campaignFrom!.trim();
  const replyTo = emailAddressOf(setup.replyTo)!;
  const origin = originOf(setup);
  const key = campaignLedgerKey(campaign.id);
  // Each balance is a read of its own: only for an email that says it.
  const readsPoints = usesPointsBalance(campaign);

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
    try {
      const unsubscribe = unsubscribeLinks(customerId, { origin, locale, secret: setup.unsubscribeSecret });
      if (!unsubscribe) throw new Error("no unsubscribe link could be signed");
      const claimUrl =
        campaignSignsIn(campaign) && claim.unclaimedMigrated
          ? (await mintClaimLink(setup.admin, { customerId, template: key, locale, origin })).url
          : null;
      const rendered = renderCampaignFor(campaign, {
        firstName: claim.firstName,
        lastName: claim.lastName,
        pointsBalance: readsPoints ? (await readPointsBalance(setup.admin, customerId)).available : null,
        origin,
        locale,
        claimUrl,
        unsubscribeUrl: unsubscribe.pageUrl,
      });
      const sent = await transport.send({
        ...rendered,
        to: claim.email,
        from,
        replyTo,
        headers: listUnsubscribeHeaders(unsubscribe, { mailto: replyTo }),
      });
      await finishCampaignSend(setup.admin, { sendId: claim.sendId, sent: true, providerMessageId: sent.id ?? null });
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
 * Sends the Campaign as it is now to up to {@link MAX_TEST_RECIPIENTS}
 * addresses, through the same transport and headers as a real send, with
 * "[Test]" before the subject. It writes nothing to the ledger, its
 * unsubscribe link belongs to no Customer, and its sign-in button goes to
 * the account page. Its Variables are filled from `recipient`: the action
 * passes the sample customer for a block campaign (slice 13), so the test
 * reads like the real thing.
 */
export async function sendCampaignTest(
  campaign: CampaignEmailParts,
  { to, ...recipient }: { to: readonly string[] } & VariableRecipient,
  setup: CampaignSenderSetup,
): Promise<{ sent: string[]; failed: { to: string; error: string }[] } | { refused: string }> {
  const addresses = [...new Set(to.map((t) => emailAddressOf(t)).filter((t): t is string => Boolean(t)))];
  if (addresses.length === 0) return { refused: "Enter an email address to send the test to." };
  if (addresses.length > MAX_TEST_RECIPIENTS) return { refused: `A test goes to at most ${MAX_TEST_RECIPIENTS} addresses.` };
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
  const rendered = renderCampaignFor(campaign, {
    ...recipient,
    origin,
    locale: DEFAULT_LOCALE,
    claimUrl: null,
    unsubscribeUrl: unsubscribe.pageUrl,
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
