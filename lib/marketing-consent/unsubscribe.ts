/**
 * One-click unsubscribe (PRD-shopify-customer-migration slice 07; ADR 0028 i;
 * RFC 8058). Server only: the token is an HMAC of the Customer id.
 *
 * - **The token** is `HMAC-SHA256(customer_id, UNSUBSCRIBE_SECRET)`, base64url.
 *   It is stateless and never expires, because an unsubscribe link must keep
 *   working for as long as the email exists. It is compared with
 *   `secretMatches`, in constant time.
 * - **The page**, `/[lang]/unsubscribe?u=&t=`, confirms with one button. A GET
 *   never changes anything: link scanners prefetch.
 * - **The route**, `POST /api/email/unsubscribe?u=&t=`, takes the button and
 *   the mail client's RFC 8058 one-click POST (`List-Unsubscribe=One-Click`).
 *
 * The first hazard of the migration README: no campaign email goes out before
 * this is live. `probeUnsubscribeRoute` is how a sender checks a site has it,
 * and `unsubscribe-route.check.ts` runs it from the command line.
 */

import { createHmac } from "node:crypto";
import { secretMatches } from "@/lib/auth/secret";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { getSiteOrigin } from "@/lib/site-url";

/** The route mail clients POST to. */
export const UNSUBSCRIBE_ROUTE = "/api/email/unsubscribe";
/** The confirm page, before its locale. */
export const UNSUBSCRIBE_PAGE = "/unsubscribe";

/** The error the route answers a link it cannot verify with: the probe's marker. */
export const INVALID_LINK = "invalid_link";
/** The error the route answers while UNSUBSCRIBE_SECRET is unset. */
export const NOT_CONFIGURED = "not_configured";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const secretFromEnv = () => process.env.UNSUBSCRIBE_SECRET || undefined;

/** Whether the route can verify a link at all. */
export function unsubscribeConfigured(secret: string | undefined = secretFromEnv()): boolean {
  return Boolean(secret);
}

/** The token for one Customer, or null without a secret or a valid id. */
export function unsubscribeToken(
  customerId: string,
  secret: string | undefined = secretFromEnv(),
): string | null {
  if (!secret || !UUID.test(customerId)) return null;
  return createHmac("sha256", secret).update(customerId.toLowerCase()).digest("base64url");
}

/** Constant-time check of a presented link. Fails closed. */
export function verifyUnsubscribeToken(
  customerId: string | null | undefined,
  token: string | null | undefined,
  secret: string | undefined = secretFromEnv(),
): customerId is string {
  if (!customerId || token == null) return false;
  const expected = unsubscribeToken(customerId, secret);
  return expected != null && secretMatches(expected, token);
}

export interface UnsubscribeLinks {
  /** The confirm page: the footer link a person clicks. */
  pageUrl: string;
  /** The route: the `List-Unsubscribe` URL a mail client POSTs to. */
  oneClickUrl: string;
}

/** Both links for one Customer, or null when no token can be made. */
export function unsubscribeLinks(
  customerId: string,
  opts: { origin?: string; locale?: Locale; secret?: string } = {},
): UnsubscribeLinks | null {
  const token = unsubscribeToken(customerId, opts.secret ?? secretFromEnv());
  if (!token) return null;
  const origin = (opts.origin ?? getSiteOrigin()).replace(/\/$/, "");
  const query = new URLSearchParams({ u: customerId.toLowerCase(), t: token }).toString();
  return {
    pageUrl: `${origin}${withLocale(UNSUBSCRIBE_PAGE, opts.locale ?? DEFAULT_LOCALE)}?${query}`,
    oneClickUrl: `${origin}${UNSUBSCRIBE_ROUTE}?${query}`,
  };
}

/**
 * The RFC 8058 headers for a campaign email (slice 08 sets them on every
 * send). `mailto` adds a mail fallback for clients that do not POST.
 * Transactional mail never carries them.
 */
export function listUnsubscribeHeaders(
  links: Pick<UnsubscribeLinks, "oneClickUrl">,
  opts: { mailto?: string } = {},
): Record<string, string> {
  const targets = [`<${links.oneClickUrl}>`];
  if (opts.mailto) targets.push(`<mailto:${opts.mailto}?subject=unsubscribe>`);
  return {
    "List-Unsubscribe": targets.join(", "),
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

export type UnsubscribeProbe = { ready: true } | { ready: false; reason: string };

/**
 * Does `origin` answer the one-click route? A one-click POST with no link must
 * come back `400 { error: "invalid_link" }`: the route is deployed, it has its
 * secret, and it refused without changing anything. Anything else (a 404, a
 * `503 not_configured`, a network error) is not ready, and a campaign sender
 * must refuse to run (README, first hazard).
 */
export async function probeUnsubscribeRoute(
  origin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<UnsubscribeProbe> {
  const url = `${origin.replace(/\/$/, "")}${UNSUBSCRIBE_ROUTE}`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
      redirect: "manual",
    });
  } catch (e) {
    return { ready: false, reason: `${url} did not answer: ${e instanceof Error ? e.message : String(e)}` };
  }
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
  if (res.status === 400 && body?.error === INVALID_LINK) return { ready: true };
  if (res.status === 503 && body?.error === NOT_CONFIGURED) {
    return { ready: false, reason: `${url} is deployed but UNSUBSCRIBE_SECRET is not set` };
  }
  return { ready: false, reason: `${url} answered ${res.status}, not the unsubscribe route` };
}
