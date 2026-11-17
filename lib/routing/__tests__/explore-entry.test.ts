import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest, type NextFetchEvent } from "next/server";
import { exploreEntryPath, fromThisSite, homePathLocale } from "@/lib/routing/explore-entry";

/**
 * The way in to Explore until the launch (owner, 2026-11-17): an arrival at
 * the home page of mpillow.com or www.mpillow.com is shown /explore; a click
 * on the site itself is not, and from the launch nobody is.
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

  it("stops at the launch", () => {
    expect(exploreEntryPath({ ...base, nowMs: LAUNCH - 1000 })).toBe("/en-US/explore");
    expect(exploreEntryPath({ ...base, nowMs: LAUNCH })).toBeNull();
    expect(exploreEntryPath({ ...base, nowMs: LAUNCH + 86_400_000 })).toBeNull();
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

  it("serves the home page from the launch", async () => {
    at(LAUNCH);
    const res = await hit("https://www.mpillow.com/en-US", "https://www.mpillow.com", { "sec-fetch-site": "none" });
    expect(res.status).toBe(200);
  });
});
