/**
 * One-click unsubscribe (PRD-shopify-customer-migration slice 07; ADR 0029 i;
 * RFC 8058). Server only: the token is an HMAC of the Customer id.
 *
 * - **The token** is `HMAC-SHA256(customer_id, UNSUBSCRIBE_SECRET)`, base64url.
 *   It is stateless and never expires, because an unsubscribe link must keep
 *   working for as long as the email exists. It is compared with
 *   `secretMatches`, in constant time.
 * - **The send** (PRD-campaign-audiences slice 08). A campaign email's link
 *   also carries its send, `s`, and then its token signs both,
 *   `HMAC(customer_id + ":" + send_id)`, so the unsubscribe names the
 *   campaign that caused it and no link can be edited to name another. A link
 *   without `s` (every email sent before, and the probes) verifies as before
 *   and names no campaign.
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

/** The token for one Customer, and one send of theirs when given; null without a secret or a valid id. */
export function unsubscribeToken(
  customerId: string,
  secret: string | undefined = secretFromEnv(),
  sendId: string | null = null,
): string | null {
  if (!secret || !UUID.test(customerId)) return null;
  if (sendId != null && !UUID.test(sendId)) return null;
  const message = sendId ? `${customerId.toLowerCase()}:${sendId.toLowerCase()}` : customerId.toLowerCase();
  return createHmac("sha256", secret).update(message).digest("base64url");
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

/**
 * A presented link, verified: whose it is, and the campaign send it names when
 * it names one it signed. Null for a link that does not verify, which a
 * campaign link whose `s` was changed no longer does. An older link with an
 * `s` added by hand still unsubscribes its Customer, and names no send.
 */
export function verifyUnsubscribeLink(
  customerId: string | null | undefined,
  token: string | null | undefined,
  sendId: string | null | undefined,
  secret: string | undefined = secretFromEnv(),
): { customerId: string; sendId: string | null } | null {
  if (!customerId || token == null) return null;
  if (sendId && UUID.test(sendId)) {
    const signed = unsubscribeToken(customerId, secret, sendId);
    if (signed != null && secretMatches(signed, token)) return { customerId, sendId: sendId.toLowerCase() };
  }
  return verifyUnsubscribeToken(customerId, token, secret) ? { customerId, sendId: null } : null;
}

export interface UnsubscribeLinks {
  /** The confirm page: the footer link a person clicks. */
  pageUrl: string;
  /** The route: the `List-Unsubscribe` URL a mail client POSTs to. */
  oneClickUrl: string;
}

/** Both links for one Customer, naming one send of theirs when given; null when no token can be made. */
export function unsubscribeLinks(
  customerId: string,
  opts: { origin?: string; locale?: Locale; secret?: string; sendId?: string | null } = {},
): UnsubscribeLinks | null {
  const sendId = opts.sendId ?? null;
  const token = unsubscribeToken(customerId, opts.secret ?? secretFromEnv(), sendId);
  if (!token) return null;
  const origin = (opts.origin ?? getSiteOrigin()).replace(/\/$/, "");
  const query = new URLSearchParams({
    u: customerId.toLowerCase(),
    t: token,
    ...(sendId ? { s: sendId.toLowerCase() } : {}),
  }).toString();
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

/**
 * A Customer id no row has: a v4 id with every random bit zero, which
 * `gen_random_uuid()` will not produce in practice, so a link for it
 * unsubscribes nobody.
 */
export const PROBE_CUSTOMER_ID = "00000000-0000-4000-8000-000000000000";

/**
 * Does `origin` verify links signed with THIS machine's secret? A sender
 * signs every link it mails with its own UNSUBSCRIBE_SECRET; if the site
 * holds a different one, every link would answer `invalid_link`. The probe
 * one-click POSTs a link signed here for {@link PROBE_CUSTOMER_ID}: the site
 * answers `200` when it verifies (and finds no such Customer, so nothing
 * changes), and `400 invalid_link` when the secrets differ.
 */
export async function probeUnsubscribeSecret(
  origin: string,
  { secret = secretFromEnv(), fetchImpl = fetch }: { secret?: string; fetchImpl?: typeof fetch } = {},
): Promise<UnsubscribeProbe> {
  const links = unsubscribeLinks(PROBE_CUSTOMER_ID, { origin, secret });
  if (!links) return { ready: false, reason: "UNSUBSCRIBE_SECRET is not set here, so no link can be signed" };
  let res: Response;
  try {
    res = await fetchImpl(links.oneClickUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
      redirect: "manual",
    });
  } catch (e) {
    return { ready: false, reason: `${origin} did not answer: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (res.ok) return { ready: true };
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
  if (res.status === 400 && body?.error === INVALID_LINK) {
    return { ready: false, reason: `${origin} refuses links signed here: its UNSUBSCRIBE_SECRET is not this one` };
  }
  return { ready: false, reason: `${origin} answered a signed link with ${res.status}` };
}
