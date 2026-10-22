// ============================================================
// The campaign transport — never the mailbox that sends order emails
// ============================================================
//
// Campaign mail (PRD-shopify-customer-migration slice 08; ADR 0029 i) goes
// through Resend, from its own sending subdomain, so its bounces and
// complaints cannot touch the deliverability of order and Result emails, and
// a Workspace mailbox's daily cap never applies to it.
//
// It is a separate instance from `getDefaultTransport()`, built from its own
// variables:
//   CAMPAIGN_RESEND_API_KEY  the campaign's Resend key (owner decision 4)
//   CAMPAIGN_EMAIL_FROM      e.g. `Mpillow <hello@hello.mpillow.com>`
//   CAMPAIGN_EMAIL_DOMAIN    the sending subdomain, e.g. `hello.mpillow.com`
//
// The key is deliberately NOT `RESEND_API_KEY`: `resolveTransport` picks
// Resend for every order email whenever `RESEND_API_KEY` is set and
// `EMAIL_PROVIDER` is not, so a campaign key under that name would silently
// move all order mail off Gmail. `getDefaultTransport()` never reads the
// campaign variables (__tests__/campaign-transport.test.ts holds it to that).

import { ResendTransport } from "./transport";
import type { EmailTransport } from "./types";

type Env = Partial<Record<string, string | undefined>>;

/** Resend's own test domain: never a sending subdomain. */
const RESEND_TEST_DOMAIN = "resend.dev";

/**
 * The campaign's Resend transport, or null while `CAMPAIGN_RESEND_API_KEY` is
 * unset (owner decision 4): the wave sender then refuses to send.
 */
export function getCampaignTransport(env: Env = process.env): EmailTransport | null {
  const key = env.CAMPAIGN_RESEND_API_KEY?.trim();
  return key ? new ResendTransport(key) : null;
}

/**
 * How much the campaign's Resend plan may send. Resend's free plan allows 100
 * emails a day and 3,000 a month, and the wave sender keeps every run inside
 * both (`sendBudget`), so waves stagger across days instead of failing
 * half-way. A paid plan raises them:
 *   CAMPAIGN_DAILY_SEND_LIMIT    default 100
 *   CAMPAIGN_MONTHLY_SEND_LIMIT  default 3000
 * Set them lower if anything else sends from the same Resend account: the
 * ledger only counts campaign sends.
 */
export interface CampaignSendLimits {
  daily: number;
  monthly: number;
}

export const RESEND_FREE_SEND_LIMITS: CampaignSendLimits = { daily: 100, monthly: 3000 };

export function campaignSendLimits(env: Env = process.env): CampaignSendLimits {
  const read = (name: string, fallback: number) => {
    const raw = env[name]?.trim();
    if (!raw) return fallback;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) throw new Error(`${name} must be a whole number of emails, not ${raw}`);
    return n;
  };
  return {
    daily: read("CAMPAIGN_DAILY_SEND_LIMIT", RESEND_FREE_SEND_LIMITS.daily),
    monthly: read("CAMPAIGN_MONTHLY_SEND_LIMIT", RESEND_FREE_SEND_LIMITS.monthly),
  };
}

/** The bare address in `Name <a@b.c>` or `a@b.c`, lowercased; null when there is none. */
export function emailAddressOf(value: string | null | undefined): string | null {
  const raw = value?.trim() ?? "";
  const inner = /<([^<>]+)>\s*$/.exec(raw)?.[1] ?? raw;
  const address = inner.trim().toLowerCase();
  return /^[^\s@<>]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(address) ? address : null;
}

/** The domain of an address, lowercased. */
export function emailDomainOf(value: string | null | undefined): string | null {
  const address = emailAddressOf(value);
  return address ? address.slice(address.indexOf("@") + 1) : null;
}

/** The mailbox that sends order and Result email, as `getDefaultFromAddress` resolves it. */
export function transactionalFromAddress(env: Env = process.env): string | null {
  return env.EMAIL_FROM?.trim() || env.GMAIL_SENDER?.trim() || null;
}

export type CampaignFromCheck =
  | { ok: true; from: string; domain: string }
  | { ok: false; reason: string };

/**
 * Is `from` on the campaign's sending subdomain? It must be an address on
 * exactly `domain`, which must be a subdomain (`hello.mpillow.com`, not
 * `mpillow.com`), and must not be the domain order email is sent from.
 */
export function checkCampaignFrom({
  from,
  domain,
  orderFrom,
}: {
  from: string | null | undefined;
  domain: string | null | undefined;
  orderFrom: string | null | undefined;
}): CampaignFromCheck {
  const subdomain = domain?.trim().toLowerCase().replace(/\.$/, "") ?? "";
  if (!subdomain) return { ok: false, reason: "CAMPAIGN_EMAIL_DOMAIN (the sending subdomain, owner decision 4) is not set" };
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+){2,}$/.test(subdomain)) {
    return { ok: false, reason: `CAMPAIGN_EMAIL_DOMAIN ${subdomain} is not a subdomain, such as hello.mpillow.com` };
  }
  if (subdomain === RESEND_TEST_DOMAIN || subdomain.endsWith(`.${RESEND_TEST_DOMAIN}`)) {
    return { ok: false, reason: "CAMPAIGN_EMAIL_DOMAIN is Resend's test domain, not the campaign's own" };
  }

  if (!from?.trim()) return { ok: false, reason: "CAMPAIGN_EMAIL_FROM is not set" };
  const fromDomain = emailDomainOf(from);
  if (!fromDomain) return { ok: false, reason: `CAMPAIGN_EMAIL_FROM is not an email address: ${from}` };
  if (fromDomain !== subdomain) {
    return { ok: false, reason: `CAMPAIGN_EMAIL_FROM is on ${fromDomain}, not the campaign subdomain ${subdomain}` };
  }

  const orderDomain = emailDomainOf(orderFrom);
  if (orderDomain && orderDomain === subdomain) {
    return { ok: false, reason: `${subdomain} is the domain order email is sent from; campaign mail needs its own` };
  }
  return { ok: true, from: from.trim(), domain: subdomain };
}
