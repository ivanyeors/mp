import { NextRequest, type NextFetchEvent } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "@/proxy";

/**
 * The IndexNow key at the protocol's default address, /<key>.txt. Ahrefs Site
 * Audit verifies a key only there; the site's own pings name /indexnow-key.txt
 * as keyLocation, which IndexNow engines accept but Ahrefs does not.
 */
// Made up, and low-entropy so the secret scan does not take it for a credential.
const KEY = "aaaaaaaa-bbbb-cccc-dddd";
const event = { waitUntil: () => {} } as unknown as NextFetchEvent;

function get(url: string) {
  return proxy(new NextRequest(url), event);
}

describe("IndexNow key at /<key>.txt", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("serves the key route at /<key>.txt", async () => {
    vi.stubEnv("INDEXNOW_KEY", KEY);
    const res = await get(`https://www.mpillow.com/${KEY}.txt`);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-rewrite")).toBe("https://www.mpillow.com/indexnow-key.txt");
  });

  it("answers on a moved host too, instead of sending it to the canonical one", async () => {
    vi.stubEnv("INDEXNOW_KEY", KEY);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.mpillow.com");
    const res = await get(`https://custom.mpillow.com/${KEY}.txt`);
    expect(res.headers.get("x-middleware-rewrite")).toBe("https://custom.mpillow.com/indexnow-key.txt");
  });

  it("leaves any other .txt file alone", async () => {
    vi.stubEnv("INDEXNOW_KEY", KEY);
    const res = await get("https://www.mpillow.com/abcdefgh12345678.txt");
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("serves nothing for a key that fails validation", async () => {
    // Under 8 characters: a path that survives URL parsing unchanged, so only
    // the validation keeps it from matching.
    vi.stubEnv("INDEXNOW_KEY", "short");
    const res = await get("https://www.mpillow.com/short.txt");
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("serves nothing when no key is set", async () => {
    vi.stubEnv("INDEXNOW_KEY", "");
    const res = await get("https://www.mpillow.com/.txt");
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });
});
