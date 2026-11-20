import { createHmac } from "node:crypto";
import { secretMatches } from "@/lib/auth/secret";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { getSiteOrigin } from "@/lib/site-url";

export const UNSUBSCRIBE_ROUTE = "/api/email/unsubscribe";
export const UNSUBSCRIBE_PAGE = "/unsubscribe";

export const INVALID_LINK = "invalid_link";
export const NOT_CONFIGURED = "not_configured";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const secretFromEnv = () => process.env.UNSUBSCRIBE_SECRET || undefined;

export function unsubscribeConfigured(secret: string | undefined = secretFromEnv()): boolean {
  return Boolean(secret);
}

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

export function verifyUnsubscribeToken(
  customerId: string | null | undefined,
  token: string | null | undefined,
  secret: string | undefined = secretFromEnv(),
): customerId is string {
  if (!customerId || token == null) return false;
  const expected = unsubscribeToken(customerId, secret);
  return expected != null && secretMatches(expected, token);
}

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
  pageUrl: string;
  oneClickUrl: string;
}

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

export const PROBE_CUSTOMER_ID = "00000000-0000-4000-8000-000000000000";

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
