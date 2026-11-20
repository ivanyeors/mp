/**
 * The way in to the Explore page until the launch (owner, 2026-11-17):
 * someone who arrives at the home page of mpillow.com or www.mpillow.com is
 * shown /explore instead, so the countdown and the welcome points are the
 * first thing they see.
 *
 * - **Signed out: every arrival** (owner, 2026-11-20). A visitor with no
 *   sign-in cookie is sent to Explore each time they arrive. Explore is for
 *   them, and a browser "session" rarely ends: Chrome's "continue where you
 *   left off" and phone browsers keep a session cookie for weeks, so "once per
 *   session" had become "once ever".
 * - **Signed in: once per browser session** (owner, 2026-11-18). Opening
 *   Explore sets a session cookie, `EXPLORE_SEEN_COOKIE`; while the browser
 *   keeps it, a signed-in arrival goes to the home page. It has no expiry, and
 *   it names the parent domain, so seeing Explore on www also counts for
 *   mpillow.com. Both are cookies the proxy reads with no query.
 * - **Arrivals only.** A typed address, a bookmark or a link from another site
 *   goes to Explore. A click on this same site does not (`Sec-Fetch-Site:
 *   same-origin`, or a Referer from this host), so the Explore logo and "Explore
 *   the new site" still reach the home page instead of looping back.
 * - **Until the launch.** From 23:59 on 31 December 2026 (Singapore time) the
 *   home page is the home page again, and Explore's "Enter Mpillow" goes there.
 * - **Those two hosts only.** custom.mpillow.com, previews and localhost keep
 *   their home page, so Staff can still open it.
 *
 * Until their DNS points here (ADR 0029, cutover), both hosts are still the
 * old Shopify store and nothing here runs for them.
 */
import { EXPLORE_LAUNCH_AT } from "@/lib/explore/launch";
import { isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { EXPLORE_PATH } from "@/lib/routing/explore-route";

export const EXPLORE_ENTRY_HOSTS: ReadonlySet<string> = new Set(["mpillow.com", "www.mpillow.com"]);

/** Set when Explore is shown; while the browser session keeps it, a signed-in arrival goes home. */
export const EXPLORE_SEEN_COOKIE = "mp_explore_seen";

/**
 * Pure — whether the request carries a Supabase sign-in cookie
 * (`sb-<project>-auth-token`, or its `.0`, `.1` chunks). Not the PKCE
 * `-code-verifier` cookie, which a sign-in in progress leaves.
 *
 * ponytail: the cookie's presence, not a verified session, so the proxy makes
 * no query on the home page. A stale cookie only means once per session
 * instead of every time; verify with `auth.getUser()` if that ever matters.
 */
export function hasSignInCookie(cookieNames: readonly string[]): boolean {
  return cookieNames.some((name) => /^sb-.+-auth-token(\.\d+)?$/.test(name));
}

const LAUNCH_MS = Date.parse(EXPLORE_LAUNCH_AT);

/** The locale of a home-page path (`/`, `/en-US`, `/zh-CN/`), "none" for `/`, or null for any other page. */
export function homePathLocale(pathname: string): Locale | "none" | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return "none";
  if (parts.length === 1 && isSupportedLocale(parts[0]!)) return parts[0] as Locale;
  return null;
}

/** The request came from a link on this same host, not from outside it. */
export function fromThisSite(input: { host: string; secFetchSite: string | null; referer: string | null }): boolean {
  const site = input.secFetchSite?.trim().toLowerCase();
  if (site) return site === "same-origin";
  // No Fetch Metadata (an older browser): the Referer, when there is one.
  if (!input.referer) return false;
  try {
    return new URL(input.referer).hostname.toLowerCase() === input.host;
  } catch {
    return false;
  }
}

/**
 * Pure — where an arrival at the home page goes instead, as a path
 * (`/en-US/explore`), or null when it stays. `locale` is the visitor's
 * preferred one, used when the address has none.
 */
export function exploreEntryPath(input: {
  host: string;
  pathname: string;
  method: string;
  secFetchSite: string | null;
  referer: string | null;
  locale: Locale;
  nowMs: number;
  /** This browser session has already been shown Explore. */
  seen: boolean;
  /** The visitor is signed in; only then does `seen` keep them on the home page. */
  signedIn: boolean;
}): string | null {
  if (input.seen && input.signedIn) return null;
  if (!EXPLORE_ENTRY_HOSTS.has(input.host)) return null;
  if (input.method !== "GET" && input.method !== "HEAD") return null;
  if (!(input.nowMs < LAUNCH_MS)) return null;
  const home = homePathLocale(input.pathname);
  if (home === null) return null;
  if (fromThisSite(input)) return null;
  return `/${home === "none" ? input.locale : home}${EXPLORE_PATH}`;
}

/**
 * Pure — whether this request shows the Explore page to a person, so the
 * session counts as having seen it: a GET of `/{locale}/explore`, not a
 * prefetch (Next's link prefetch, or the browser's own speculative load).
 */
export function showsExplore(input: { pathname: string; method: string; prefetch: boolean }): boolean {
  if (input.method !== "GET" || input.prefetch) return false;
  const parts = input.pathname.split("/").filter(Boolean);
  return parts.length === 2 && isSupportedLocale(parts[0]!) && `/${parts[1]}` === EXPLORE_PATH;
}

/**
 * The cookie's domain: the parent domain on our own hosts, so www and the bare
 * domain share it; none (this host only) on a preview or localhost.
 */
export function exploreSeenCookieDomain(host: string): string | undefined {
  return host === "mpillow.com" || host.endsWith(".mpillow.com") ? "mpillow.com" : undefined;
}
