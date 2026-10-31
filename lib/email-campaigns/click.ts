/**
 * **Campaign click** (PRD-campaign-audiences slice 08; ADR 0038 (4)): which
 * campaign send a visit to the site came from.
 *
 * - **The token.** Each send gets 32 random bytes, base64url (43 characters),
 *   put as `mc` on every site link in that one email. Only its SHA-256 is
 *   stored, on the send (`customer_campaign_sends.click_token_hash`, written
 *   by `finish_campaign_send`), as the Claim link's is. The plaintext is in
 *   the email and nowhere else: never logged, never stored.
 * - **Which links.** Links to this site, except the unsubscribe page and
 *   route, which carry their own signed link. A link to another site is left
 *   alone: the token is ours to keep.
 * - **Recording.** The request proxy (`proxy.ts`) takes `mc` off a page
 *   request, redirects to the same address without it, and, for a GET only,
 *   records the click (`record_campaign_click`): a first click time and a
 *   count on the send. A click within 10 seconds of the send is a mail
 *   filter's, and is not counted.
 * - **Never an identity.** A click shows the link came from that email, not
 *   who holds it: emails are forwarded. It signs nobody in and merges no
 *   Visitor into a Customer.
 *
 * Web Crypto only, so the proxy can use it in any runtime. No open pixel.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * `UNSUBSCRIBE_ROUTE` and `UNSUBSCRIBE_PAGE` (lib/marketing-consent/unsubscribe.ts),
 * restated so the proxy never loads node:crypto; click.test.ts holds them equal.
 */
export const UNSUBSCRIBE_PATHS = { route: "/api/email/unsubscribe", page: "/unsubscribe" } as const;

/** The query parameter a campaign's site links carry. */
export const CLICK_PARAM = "mc";

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

/** Whether `value` could be a click token at all. Anything else is never looked up. */
export function isClickTokenShape(value: unknown): value is string {
  return typeof value === "string" && TOKEN_SHAPE.test(value);
}

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A fresh token for one send. */
export function newClickToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

/** What the send stores: SHA-256 of the token's UTF-8, lowercase hex. */
export async function hashClickToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Whether a path on the site is the unsubscribe page or route, which never carry a click token. */
function isUnsubscribePath(pathname: string): boolean {
  const { route, page } = UNSUBSCRIBE_PATHS;
  if (pathname === route || pathname.startsWith(`${route}/`)) return true;
  // `/unsubscribe`, with or without its locale.
  return new RegExp(`^(/[A-Za-z]{2}-[A-Za-z]{2})?${page}/?$`).test(pathname);
}

/** Pure — `url` with the click token when it is a site link that may carry one; any other link unchanged. */
export function withClickToken(url: string, token: string, origin: string): string {
  try {
    const u = new URL(url);
    if (u.host !== new URL(origin).host || isUnsubscribePath(u.pathname)) return url;
    u.searchParams.set(CLICK_PARAM, token);
    return u.toString();
  } catch {
    return url;
  }
}

const decodeAmp = (s: string) => s.replace(/&amp;/g, "&");
const encodeAmp = (s: string) => s.replace(/&/g, "&amp;");

/**
 * Pure — one recipient's rendered email with the click token on its site
 * links: every `href` in the HTML, and every address in the plain text.
 * Images, the unsubscribe links and other sites' links are left alone.
 */
export function addClickToken<E extends { html: string; text: string }>(email: E, token: string, origin: string): E {
  const html = email.html.replace(/href="(https?:\/\/[^"]+)"/g, (_m, href: string) => {
    const tokened = withClickToken(decodeAmp(href), token, origin);
    return `href="${encodeAmp(tokened)}"`;
  });
  const text = email.text.replace(/https?:\/\/[^\s<>"')\]]+/g, (href) => withClickToken(href, token, origin));
  return { ...email, html, text };
}

/**
 * Pure — a requested URL without its click token: the token, when one is
 * there, and where to send the browser instead. Null when there is no `mc`.
 * The token is returned whatever its shape, so the address is cleaned either
 * way; only a well-formed one is looked up.
 */
export function stripClickToken(url: URL): { token: string; cleanUrl: URL } | null {
  if (!url.searchParams.has(CLICK_PARAM)) return null;
  const token = url.searchParams.get(CLICK_PARAM) ?? "";
  const cleanUrl = new URL(url.toString());
  cleanUrl.searchParams.delete(CLICK_PARAM);
  return { token, cleanUrl };
}

/**
 * Records one click on the send whose token this is. Never throws: a click is
 * worth recording, never worth failing a page for. Whether it counted.
 */
export async function recordCampaignClick(admin: SupabaseClient, token: string, at: Date = new Date()): Promise<boolean> {
  if (!isClickTokenShape(token)) return false;
  try {
    const { data, error } = await admin.rpc("record_campaign_click", {
      p_token_hash: await hashClickToken(token),
      p_at: at.toISOString(),
    });
    if (error) {
      console.error("[campaign click] not recorded:", error.message);
      return false;
    }
    return data === true;
  } catch (e) {
    console.error("[campaign click] not recorded:", e instanceof Error ? e.message : e);
    return false;
  }
}
