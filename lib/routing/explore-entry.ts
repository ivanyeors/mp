/**
 * The way in to the Explore page until the launch (owner, 2026-11-17):
 * someone who arrives at the home page of mpillow.com or www.mpillow.com is
 * shown /explore instead, so the countdown and the welcome points are the
 * first thing they see.
 *
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
}): string | null {
  if (!EXPLORE_ENTRY_HOSTS.has(input.host)) return null;
  if (input.method !== "GET" && input.method !== "HEAD") return null;
  if (!(input.nowMs < LAUNCH_MS)) return null;
  const home = homePathLocale(input.pathname);
  if (home === null) return null;
  if (fromThisSite(input)) return null;
  return `/${home === "none" ? input.locale : home}${EXPLORE_PATH}`;
}
