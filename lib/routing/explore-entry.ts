import { EXPLORE_LAUNCH_AT } from "@/lib/explore/launch";
import { isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { EXPLORE_PATH } from "@/lib/routing/explore-route";

export const EXPLORE_ENTRY_HOSTS: ReadonlySet<string> = new Set(["mpillow.com", "www.mpillow.com"]);

export const EXPLORE_SEEN_COOKIE = "mp_explore_seen";

// ponytail: the cookie's presence, not a verified session, so the proxy makes no query on the home
// page. A stale cookie only means once per session instead of every time; verify with
// `auth.getUser()` if that ever matters.
export function hasSignInCookie(cookieNames: readonly string[]): boolean {
  return cookieNames.some((name) => /^sb-.+-auth-token(\.\d+)?$/.test(name));
}

const LAUNCH_MS = Date.parse(EXPLORE_LAUNCH_AT);

export function homePathLocale(pathname: string): Locale | "none" | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return "none";
  if (parts.length === 1 && isSupportedLocale(parts[0]!)) return parts[0] as Locale;
  return null;
}

export function fromThisSite(input: { host: string; secFetchSite: string | null; referer: string | null }): boolean {
  const site = input.secFetchSite?.trim().toLowerCase();
  if (site) return site === "same-origin";
  if (!input.referer) return false;
  try {
    return new URL(input.referer).hostname.toLowerCase() === input.host;
  } catch {
    return false;
  }
}

export function exploreEntryPath(input: {
  host: string;
  pathname: string;
  method: string;
  secFetchSite: string | null;
  referer: string | null;
  locale: Locale;
  nowMs: number;
  seen: boolean;
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

export function showsExplore(input: { pathname: string; method: string; prefetch: boolean }): boolean {
  if (input.method !== "GET" || input.prefetch) return false;
  const parts = input.pathname.split("/").filter(Boolean);
  return parts.length === 2 && isSupportedLocale(parts[0]!) && `/${parts[1]}` === EXPLORE_PATH;
}

export function exploreSeenCookieDomain(host: string): string | undefined {
  return host === "mpillow.com" || host.endsWith(".mpillow.com") ? "mpillow.com" : undefined;
}
