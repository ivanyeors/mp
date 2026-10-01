import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { blogPostUrls, pingIndexNow } from "@/lib/seo/indexnow";

describe("pingIndexNow", () => {
  beforeEach(() => {
    vi.stubEnv("INDEXNOW_KEY", "a1b2c3d4e5f6a7b8");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://custom.mpillow.com");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("posts same-host URLs with the key file location", async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const r = await pingIndexNow(
      [...blogPostUrls("how-to-choose"), "https://evil.example/x", "https://custom.mpillow.com/en-US/blog/how-to-choose"],
      {
        env: "production",
        fetchImpl: async (url, init) => (calls.push({ url, body: JSON.parse(String(init.body)) }), new Response(null, { status: 202 })),
      },
    );
    expect(r).toEqual({ ok: true, status: 202 });
    expect(calls[0].url).toBe("https://api.indexnow.org/indexnow");
    expect(calls[0].body).toEqual({
      host: "custom.mpillow.com",
      key: "a1b2c3d4e5f6a7b8",
      keyLocation: "https://custom.mpillow.com/indexnow-key.txt",
      urlList: ["https://custom.mpillow.com/en-US/blog/how-to-choose", "https://custom.mpillow.com/zh-CN/blog/how-to-choose"],
    });
  });

  it("does nothing outside production or without a valid key", async () => {
    const fetchImpl = vi.fn();
    expect(await pingIndexNow(blogPostUrls("x"), { env: "preview", fetchImpl })).toEqual({ ok: false, reason: "not production" });
    vi.stubEnv("INDEXNOW_KEY", "bad key!");
    expect(await pingIndexNow(blogPostUrls("x"), { env: "production", fetchImpl })).toMatchObject({ ok: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("never throws on HTTP or network errors", async () => {
    expect(await pingIndexNow(blogPostUrls("x"), { env: "production", fetchImpl: async () => new Response(null, { status: 403 }) })).toEqual({
      ok: false,
      reason: "HTTP 403",
    });
    expect(
      await pingIndexNow(blogPostUrls("x"), { env: "production", fetchImpl: () => Promise.reject(new Error("down")) }),
    ).toEqual({ ok: false, reason: "network" });
  });
});
