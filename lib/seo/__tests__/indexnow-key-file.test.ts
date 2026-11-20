import { NextRequest, type NextFetchEvent } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "@/proxy";

const LOW_ENTROPY_FAKE_KEY = "aaaaaaaa-bbbb-cccc-dddd";
const event = { waitUntil: () => {} } as unknown as NextFetchEvent;

function get(url: string) {
  return proxy(new NextRequest(url), event);
}

describe("IndexNow key at /<key>.txt, the only address Ahrefs Site Audit verifies", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("serves the key route at /<key>.txt", async () => {
    vi.stubEnv("INDEXNOW_KEY", LOW_ENTROPY_FAKE_KEY);
    const res = await get(`https://www.mpillow.com/${LOW_ENTROPY_FAKE_KEY}.txt`);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-rewrite")).toBe("https://www.mpillow.com/indexnow-key.txt");
  });

  it("answers on a moved host too, instead of sending it to the canonical one", async () => {
    vi.stubEnv("INDEXNOW_KEY", LOW_ENTROPY_FAKE_KEY);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.mpillow.com");
    const res = await get(`https://custom.mpillow.com/${LOW_ENTROPY_FAKE_KEY}.txt`);
    expect(res.headers.get("x-middleware-rewrite")).toBe("https://custom.mpillow.com/indexnow-key.txt");
  });

  it("leaves any other .txt file alone", async () => {
    vi.stubEnv("INDEXNOW_KEY", LOW_ENTROPY_FAKE_KEY);
    const res = await get("https://www.mpillow.com/abcdefgh12345678.txt");
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("serves nothing for a too-short key, whose path parses unchanged so only validation stops it", async () => {
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
