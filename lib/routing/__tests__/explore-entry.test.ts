import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest, type NextFetchEvent } from "next/server";
import {
  exploreEntryPath,
  exploreSeenCookieDomain,
  fromThisSite,
  hasSignInCookie,
  homePathLocale,
  showsExplore,
} from "@/lib/routing/explore-entry";

/**
 * The way in to Explore until the launch (owner, 2026-11-17): an arrival at
 * the home page of mpillow.com or www.mpillow.com is shown /explore (every
 * time when signed out, once per browser session when signed in); a click on
 * the site itself is not, and from the launch nobody is.
 */

vi.mock("@/lib/supabase/middleware", () => ({ refreshSupabaseSession: vi.fn(async () => undefined) }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));

const { proxy } = await import("@/proxy");

const BEFORE = Date.parse("2026-11-20T10:00:00+08:00");
const LAUNCH = Date.parse("2026-12-31T23:59:00+08:00");
const base = {
  host: "www.mpillow.com",
  pathname: "/",
  method: "GET",
  secFetchSite: "none",
  referer: null,
  locale: "en-US" as const,
  nowMs: BEFORE,
  seen: false,
  signedIn: false,
};

describe("exploreEntryPath", () => {
  it("sends an arrival at the home page to Explore, in the visitor's language", () => {
    expect(exploreEntryPath(base)).toBe("/en-US/explore");
    expect(exploreEntryPath({ ...base, locale: "zh-CN" })).toBe("/zh-CN/explore");
  });

  it("keeps the language the address already has", () => {
    expect(exploreEntryPath({ ...base, pathname: "/zh-CN" })).toBe("/zh-CN/explore");
    expect(exploreEntryPath({ ...base, pathname: "/en-US/" })).toBe("/en-US/explore");
  });

  it("does it on the bare domain too, and from a link on another site", () => {
    expect(exploreEntryPath({ ...base, host: "mpillow.com" })).toBe("/en-US/explore");
    expect(exploreEntryPath({ ...base, secFetchSite: "cross-site" })).toBe("/en-US/explore");
    expect(exploreEntryPath({ ...base, secFetchSite: null, referer: "https://www.instagram.com/" })).toBe("/en-US/explore");
  });

  it("lets a click on the site itself reach the home page", () => {
    expect(exploreEntryPath({ ...base, secFetchSite: "same-origin" })).toBeNull();
    expect(exploreEntryPath({ ...base, secFetchSite: null, referer: "https://www.mpillow.com/en-US/explore" })).toBeNull();
  });

  it("leaves every other page alone", () => {
    for (const pathname of ["/en-US/shop", "/explore", "/en-US/explore", "/fr", "/en-US/blog/x"]) {
      expect(exploreEntryPath({ ...base, pathname })).toBeNull();
    }
  });

  it("leaves custom.mpillow.com, previews and localhost alone", () => {
    for (const host of ["custom.mpillow.com", "mp-inv-git-x.vercel.app", "localhost"]) {
      expect(exploreEntryPath({ ...base, host })).toBeNull();
    }
  });

  it("never moves a write", () => {
    expect(exploreEntryPath({ ...base, method: "POST" })).toBeNull();
    expect(exploreEntryPath({ ...base, method: "HEAD" })).toBe("/en-US/explore");
  });

  it("sends a signed-out visitor every time, even after Explore was shown", () => {
    expect(exploreEntryPath({ ...base, seen: true })).toBe("/en-US/explore");
    expect(exploreEntryPath({ ...base, pathname: "/en-US", seen: true })).toBe("/en-US/explore");
  });

  it("sends a signed-in visitor once per browser session", () => {
    expect(exploreEntryPath({ ...base, signedIn: true })).toBe("/en-US/explore");
    expect(exploreEntryPath({ ...base, signedIn: true, seen: true })).toBeNull();
    expect(exploreEntryPath({ ...base, pathname: "/en-US", signedIn: true, seen: true })).toBeNull();
  });

  it("stops at the launch", () => {
    expect(exploreEntryPath({ ...base, nowMs: LAUNCH - 1000 })).toBe("/en-US/explore");
    expect(exploreEntryPath({ ...base, nowMs: LAUNCH })).toBeNull();
    expect(exploreEntryPath({ ...base, nowMs: LAUNCH + 86_400_000 })).toBeNull();
  });
});

describe("showsExplore and exploreSeenCookieDomain", () => {
  const page = { pathname: "/en-US/explore", method: "GET", prefetch: false };

  it("counts a person opening Explore, in either language", () => {
    expect(showsExplore(page)).toBe(true);
    expect(showsExplore({ ...page, pathname: "/zh-CN/explore/" })).toBe(true);
  });

  it("does not count a prefetch, a HEAD or another page", () => {
    expect(showsExplore({ ...page, prefetch: true })).toBe(false);
    expect(showsExplore({ ...page, method: "HEAD" })).toBe(false);
    for (const pathname of ["/en-US", "/explore", "/en-US/explore/x", "/fr/explore", "/en-US/shop"]) {
      expect(showsExplore({ ...page, pathname })).toBe(false);
    }
  });

  it("shares the cookie across mpillow.com hosts, and keeps it to the host elsewhere", () => {
    expect(exploreSeenCookieDomain("www.mpillow.com")).toBe("mpillow.com");
    expect(exploreSeenCookieDomain("mpillow.com")).toBe("mpillow.com");
    expect(exploreSeenCookieDomain("custom.mpillow.com")).toBe("mpillow.com");
    expect(exploreSeenCookieDomain("notmpillow.com")).toBeUndefined();
    expect(exploreSeenCookieDomain("mp-inv-git-x.vercel.app")).toBeUndefined();
    expect(exploreSeenCookieDomain("localhost")).toBeUndefined();
  });
});

describe("hasSignInCookie", () => {
  it("knows a Supabase sign-in cookie, whole or in chunks", () => {
    expect(hasSignInCookie(["mp_lang", "sb-abcd1234-auth-token"])).toBe(true);
    expect(hasSignInCookie(["sb-abcd1234-auth-token.0", "sb-abcd1234-auth-token.1"])).toBe(true);
  });

  it("does not count a sign-in in progress, or no cookie at all", () => {
    expect(hasSignInCookie(["sb-abcd1234-auth-token-code-verifier"])).toBe(false);
    expect(hasSignInCookie(["mp_lang", "mp_explore_seen"])).toBe(false);
    expect(hasSignInCookie([])).toBe(false);
  });
});

describe("homePathLocale and fromThisSite", () => {
  it("knows a home page", () => {
    expect(homePathLocale("/")).toBe("none");
    expect(homePathLocale("/en-US")).toBe("en-US");
    expect(homePathLocale("/shop")).toBeNull();
  });

  it("trusts Fetch Metadata over the Referer", () => {
    expect(fromThisSite({ host: "www.mpillow.com", secFetchSite: "same-site", referer: "https://www.mpillow.com/" })).toBe(false);
    expect(fromThisSite({ host: "www.mpillow.com", secFetchSite: null, referer: "not a url" })).toBe(false);
  });
});

describe("in the proxy", () => {
  const event = { waitUntil: () => undefined } as unknown as NextFetchEvent;
  const hit = (url: string, site: string, headers: Record<string, string> = {}) => {
    process.env.NEXT_PUBLIC_SITE_URL = site;
    return proxy(new NextRequest(url, { headers: { "accept-language": "en-US", ...headers } }), event);
  };

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    vi.useRealTimers();
  });

  const at = (ms: number) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(ms);
  };

  it("sends www's home page to Explore on www, query and all, uncached", async () => {
    at(BEFORE);
    const res = await hit("https://www.mpillow.com/?utm_source=ig", "https://www.mpillow.com", { "sec-fetch-site": "cross-site" });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://www.mpillow.com/en-US/explore?utm_source=ig");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("sends the bare domain straight to Explore on the main host: one hop", async () => {
    at(BEFORE);
    const res = await hit("https://mpillow.com/", "https://www.mpillow.com");
    expect(res.headers.get("location")).toBe("https://www.mpillow.com/en-US/explore");
    const early = await hit("https://mpillow.com/", "https://custom.mpillow.com");
    expect(early.headers.get("location")).toBe("https://custom.mpillow.com/en-US/explore");
  });

  it("keeps www on www before the switch to it", async () => {
    at(BEFORE);
    const res = await hit("https://www.mpillow.com/", "https://custom.mpillow.com");
    expect(res.headers.get("location")).toBe("https://www.mpillow.com/en-US/explore");
  });

  it("uses the language cookie when the address has none", async () => {
    at(BEFORE);
    const res = await hit("https://www.mpillow.com/", "https://www.mpillow.com", { cookie: "mp_lang=zh-CN" });
    expect(res.headers.get("location")).toBe("https://www.mpillow.com/zh-CN/explore");
  });

  it("lets the Explore logo reach the home page", async () => {
    at(BEFORE);
    const res = await hit("https://www.mpillow.com/en-US", "https://www.mpillow.com", { "sec-fetch-site": "same-origin" });
    expect(res.status).toBe(200);
  });

  it("marks the browser session when Explore is shown, for www and the bare domain", async () => {
    at(BEFORE);
    const res = await hit("https://www.mpillow.com/en-US/explore", "https://www.mpillow.com");
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith("mp_explore_seen=")) ?? "";
    expect(cookie).toMatch(/^mp_explore_seen=1;/);
    expect(cookie).toMatch(/Domain=mpillow\.com/i);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    // A session cookie: it ends with the browser session.
    expect(cookie).not.toMatch(/Max-Age|Expires/i);
  });

  it("does not mark it for a prefetch, or again once marked", async () => {
    at(BEFORE);
    const prefetch = await hit("https://www.mpillow.com/en-US/explore", "https://www.mpillow.com", { "next-router-prefetch": "1" });
    expect(prefetch.headers.get("set-cookie") ?? "").not.toMatch(/mp_explore_seen/);
    const again = await hit("https://www.mpillow.com/en-US/explore", "https://www.mpillow.com", { cookie: "mp_explore_seen=1" });
    expect(again.headers.get("set-cookie") ?? "").not.toMatch(/mp_explore_seen/);
  });

  it("sends a signed-out arrival to Explore again, though this session has seen it", async () => {
    at(BEFORE);
    const cookie = "mp_explore_seen=1; mp_lang=en-US";
    const www = await hit("https://www.mpillow.com/", "https://www.mpillow.com", { cookie, "sec-fetch-site": "none" });
    expect(www.headers.get("location")).toBe("https://www.mpillow.com/en-US/explore");
    const bare = await hit("https://mpillow.com/", "https://www.mpillow.com", { cookie, "sec-fetch-site": "none" });
    expect(bare.headers.get("location")).toBe("https://www.mpillow.com/en-US/explore");
  });

  it("sends a signed-in arrival in the same session to the home page", async () => {
    at(BEFORE);
    const cookie = "mp_explore_seen=1; sb-abcd1234-auth-token=base64-x";
    const www = await hit("https://www.mpillow.com/", "https://www.mpillow.com", { cookie });
    expect(www.headers.get("location")).toBe("https://www.mpillow.com/en-US");
    const typed = await hit("https://www.mpillow.com/en-US", "https://www.mpillow.com", { cookie, "sec-fetch-site": "none" });
    expect(typed.status).toBe(200);
    const bare = await hit("https://mpillow.com/", "https://www.mpillow.com", { cookie });
    expect(bare.headers.get("location")).toBe("https://www.mpillow.com/");
  });

  it("serves the home page from the launch", async () => {
    at(LAUNCH);
    const res = await hit("https://www.mpillow.com/en-US", "https://www.mpillow.com", { "sec-fetch-site": "none" });
    expect(res.status).toBe(200);
  });
});
