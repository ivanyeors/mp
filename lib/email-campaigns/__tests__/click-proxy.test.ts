import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, type NextFetchEvent } from "next/server";

const h = vi.hoisted(() => ({ record: vi.fn<(admin: unknown, token: string) => Promise<boolean>>(async () => true) }));

vi.mock("@/lib/supabase/middleware", () => ({ refreshSupabaseSession: vi.fn(async () => undefined) }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));
vi.mock("@/lib/email-campaigns/click", async (orig) => ({
  ...(await orig<typeof import("@/lib/email-campaigns/click")>()),
  recordCampaignClick: h.record,
}));

const { proxy } = await import("@/proxy");

const TOKEN = "Zk3".repeat(14) + "x";
const ORIGIN = "https://custom.mpillow.com";

const run = async (path: string, init: { method?: string; ua?: string } = {}) => {
  const waits: Promise<unknown>[] = [];
  const event = { waitUntil: (p: Promise<unknown>) => waits.push(p) } as unknown as NextFetchEvent;
  const res = await proxy(
    new NextRequest(`${ORIGIN}${path}`, {
      method: init.method ?? "GET",
      headers: init.ua ? { "user-agent": init.ua } : {},
    }),
    event,
  );
  await Promise.all(waits);
  return res;
};

beforeEach(() => {
  h.record.mockClear();
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
});
afterEach(() => {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

describe("proxy: a campaign click", () => {
  it("redirects to the same address without the token, before the page renders, and records the GET", async () => {
    const res = await run(`/en-US/shop/fibrecool?utm_source=email_campaign&mc=${TOKEN}`);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/en-US/shop/fibrecool?utm_source=email_campaign`);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(h.record).toHaveBeenCalledTimes(1);
    expect(h.record.mock.calls[0][1]).toBe(TOKEN);
  });

  it("strips the token from an address with no locale too", async () => {
    const res = await run(`/shop?mc=${TOKEN}`);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/shop`);
  });

  it("does not count a HEAD or a known crawler, but still takes the token off", async () => {
    const head = await run(`/en-US/shop?mc=${TOKEN}`, { method: "HEAD" });
    const bot = await run(`/en-US/shop?mc=${TOKEN}`, { ua: "Mozilla/5.0 (compatible; GPTBot/1.0; +https://openai.com/gptbot)" });
    expect(head.headers.get("location")).toBe(`${ORIGIN}/en-US/shop`);
    expect(bot.headers.get("location")).toBe(`${ORIGIN}/en-US/shop`);
    expect(h.record).not.toHaveBeenCalled();
  });

  it("leaves an address without a token to the usual handling", async () => {
    const res = await run("/en-US/shop");
    expect(res.status).toBe(200);
    expect(h.record).not.toHaveBeenCalled();
  });
});
