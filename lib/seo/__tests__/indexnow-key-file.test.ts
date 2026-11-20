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

  it("serves nothing when no valid key is set", async () => {
    vi.stubEnv("INDEXNOW_KEY", "bad key!");
    const res = await get("https://www.mpillow.com/bad key!.txt");
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });
});
