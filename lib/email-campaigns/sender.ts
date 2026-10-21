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
 * complaints over 0.1%), unless Staff resume after looking into it.
 *
 * **Each send** is claimed in the ledger first (`claim_marketing_campaign_send`,
 * which re-checks consent, suppression and "already sent" in SQL at that
 * moment), then rendered with the recipient's own unsubscribe link and
 * `List-Unsubscribe` (RFC 8058), Reply-To the support inbox. A Migrated
 * customer who has not Claimed gets their own Claim link as the sign-in
 * button. About two a second (Resend's default limit); a batch stops after
 * five failures in a row.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { mintClaimLink } from "@/lib/customer-migration/claim-link";
import { wavePause, type CampaignWaveStats } from "@/lib/customer-migration/campaign-ledger";
import {
  campaignDeliveryChecks,
  MAX_CONSECUTIVE_FAILURES,
  THROTTLE_MS,
  type DeliverySetup,
  type PreflightCheck,
} from "@/lib/customer-migration/wave-sender";
import { renderComposedCampaignEmail } from "@/lib/email/campaigns";
import { checkCampaignFrom, emailAddressOf } from "@/lib/email/campaign-transport";
import type { RenderedEmail } from "@/lib/email/types";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { listUnsubscribeHeaders, PROBE_CUSTOMER_ID, unsubscribeLinks } from "@/lib/marketing-consent/unsubscribe";
import {
  campaignLedgerKey,
  CAMPAIGN_BLOCKER_TEXT,
  MAX_TEST_RECIPIENTS,
  MAX_WAVE_SIZE,
  nextWaveLabel,
  planCampaignWave,
  WAVE_LABEL,
  type Campaign,
  type CampaignPlan,
} from "./rules";
import { claimMarketingCampaignSend, finishCampaignSend, readCampaignCandidates, readWaveStats } from "./store";

export { MAX_CONSECUTIVE_FAILURES };

/** The most sends one batch (one request) makes: about ten seconds at two a second. */
export const BATCH_SIZE = 20;

export interface CampaignSenderSetup extends DeliverySetup {
  admin: SupabaseClient;
  sleep?: (ms: number) => Promise<void>;
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

/** Pure — the Campaign as one recipient gets it. */
export function renderCampaignFor(
  campaign: Pick<Campaign, "name" | "subject" | "preheader" | "body" | "greeting" | "button">,
  p: { firstName: string | null; origin: string; locale: Locale; claimUrl: string | null; unsubscribeUrl: string },
): RenderedEmail {
  return renderComposedCampaignEmail({
    subject: campaign.subject,
    preheader: campaign.preheader,
    body: campaign.body,
    greeting: campaign.greeting,
    firstName: p.firstName,
    button: campaignButton(campaign, { origin: p.origin, locale: p.locale, claimUrl: p.claimUrl }),
    unsubscribeUrl: p.unsubscribeUrl,
  });
}

/**
 * Pure — the editor's preview: the Campaign for a sample customer, with an
 * unsubscribe link that unsubscribes nobody.
 */
export function renderCampaignPreview(
  campaign: Pick<Campaign, "name" | "subject" | "preheader" | "body" | "greeting" | "button">,
  { origin, firstName }: { origin: string; firstName: string | null },
): RenderedEmail {
  const base = origin.replace(/\/$/, "");
  return renderCampaignFor(campaign, {
    firstName,
    origin: base,
    locale: DEFAULT_LOCALE,
    claimUrl: null,
    unsubscribeUrl: `${base}${withLocale("/unsubscribe", DEFAULT_LOCALE)}`,
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
// Checks and the plan
// ---------------------------------------------------------------------------

export interface CampaignReadiness {
  checks: PreflightCheck[];
  /** Every check passed. */
  ready: boolean;
}

/** Every check, for the page's status panel. Changes nothing. */
export async function campaignReadiness(
  setup: CampaignSenderSetup,
  { campaignId, resume = false }: { campaignId?: string; resume?: boolean } = {},
): Promise<CampaignReadiness> {
  const checks = await campaignDeliveryChecks(setup);
  try {
    const { all } = await readWaveStats(setup.admin, campaignId ?? "");
    checks.push(pauseCheck(all, resume));
  } catch (err) {
    checks.push({ key: "pause", ok: false, detail: err instanceof Error ? err.message : String(err) });
  }
  return { checks, ready: checks.every((c) => c.ok) };
}

export interface WavePlanResult {
  readiness: CampaignReadiness;
  /** The next wave's label. */
  wave: string;
  plan: Omit<CampaignPlan, "selection">;
  /** Who the wave goes to, in send order: ids only. */
  customerIds: string[];
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
    campaignReadiness(setup, { campaignId: campaign.id, resume }),
    readWaveStats(setup.admin, campaign.id),
    readCampaignCandidates(setup.admin, campaign, segmentIds),
  ]);
  const { selection, ...plan } = planCampaignWave(campaign.audience, candidates, { size: n, retryFailed });
  return {
    readiness,
    wave: nextWaveLabel(waves.own.map((w) => w.wave)),
    plan,
    customerIds: selection.map((c) => c.customerId),
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

  const sleep = setup.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const transport = setup.transport!;
  const from = setup.campaignFrom!.trim();
  const replyTo = emailAddressOf(setup.replyTo)!;
  const origin = originOf(setup);
  const key = campaignLedgerKey(campaign.id);

  for (const customerId of customerIds) {
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
        campaign.button?.target === "sign_in" && claim.unclaimedMigrated
          ? (await mintClaimLink(setup.admin, { customerId, template: key, locale, origin })).url
          : null;
      const rendered = renderCampaignFor(campaign, {
        firstName: claim.firstName,
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
    }
    await sleep(THROTTLE_MS);
  }
  if (!result.stopped && result.failuresInARow >= MAX_CONSECUTIVE_FAILURES) {
    result.stopped = `${MAX_CONSECUTIVE_FAILURES} sends in a row failed`;
  }
  return result;
}

const TEST_PREFIX = "[Test] ";

/**
 * Sends the Campaign as it is now to up to {@link MAX_TEST_RECIPIENTS}
 * addresses, through the same transport and headers as a real send, with
 * "[Test]" before the subject. It writes nothing to the ledger, its
 * unsubscribe link belongs to no Customer, and its sign-in button goes to
 * the account page.
 */
export async function sendCampaignTest(
  campaign: Pick<Campaign, "name" | "subject" | "preheader" | "body" | "greeting" | "button">,
  { to, firstName }: { to: readonly string[]; firstName: string | null },
  setup: CampaignSenderSetup,
): Promise<{ sent: string[]; failed: { to: string; error: string }[] } | { refused: string }> {
  const addresses = [...new Set(to.map((t) => emailAddressOf(t)).filter((t): t is string => Boolean(t)))];
  if (addresses.length === 0) return { refused: "Enter an email address to send the test to." };
  if (addresses.length > MAX_TEST_RECIPIENTS) return { refused: `A test goes to at most ${MAX_TEST_RECIPIENTS} addresses.` };
  const notReady = quickChecks(setup);
  if (notReady) return { refused: notReady };

  const origin = originOf(setup);
  const replyTo = emailAddressOf(setup.replyTo)!;
  const unsubscribe = unsubscribeLinks(PROBE_CUSTOMER_ID, { origin, secret: setup.unsubscribeSecret });
  if (!unsubscribe) return { refused: "UNSUBSCRIBE_SECRET is not set, so no unsubscribe link can be signed." };
  const rendered = renderCampaignFor(campaign, {
    firstName,
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
