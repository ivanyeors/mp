import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({ rpc }) }));

import { clientIp, isRateLimited, rateLimitExceeded, resetRateLimits } from "@/lib/rate-limit";

const opts = { bucket: "test", key: "1.2.3.4", windowMs: 60_000, max: 3 };

describe("isRateLimited", () => {
  beforeEach(resetRateLimits);

  it("allows up to and including the limit", () => {
    expect(isRateLimited({ ...opts, now: 0 })).toBe(false);
    expect(isRateLimited({ ...opts, now: 1 })).toBe(false);
    expect(isRateLimited({ ...opts, now: 2 })).toBe(false);
  });

  it("refuses past the limit", () => {
    for (let i = 0; i < 3; i += 1) isRateLimited({ ...opts, now: i });
    expect(isRateLimited({ ...opts, now: 4 })).toBe(true);
  });

  it("allows again once the window has passed", () => {
    for (let i = 0; i < 4; i += 1) isRateLimited({ ...opts, now: i });
    expect(isRateLimited({ ...opts, now: 60_001 })).toBe(false);
  });

  it("counts each key separately", () => {
    for (let i = 0; i < 4; i += 1) isRateLimited({ ...opts, now: i });
    expect(isRateLimited({ ...opts, key: "5.6.7.8", now: 5 })).toBe(false);
  });

  // One busy endpoint must not exhaust another's allowance for the same IP.
  it("counts each bucket separately", () => {
    for (let i = 0; i < 4; i += 1) isRateLimited({ ...opts, now: i });
    expect(isRateLimited({ ...opts, bucket: "other", now: 5 })).toBe(false);
  });
});

describe("clientIp", () => {
  it("takes the first hop of x-forwarded-for", () => {
    const req = new Request("https://x.test", {
      headers: { "x-forwarded-for": "203.0.113.9, 70.41.3.18" },
    });
    expect(clientIp(req)).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip, then to a constant", () => {
    expect(clientIp(new Request("https://x.test", { headers: { "x-real-ip": "198.51.100.7" } })))
      .toBe("198.51.100.7");
    expect(clientIp(new Request("https://x.test"))).toBe("unknown");
  });
});

describe("rateLimitExceeded", () => {
  beforeEach(() => {
    resetRateLimits();
    rpc.mockReset();
  });

  it("asks the shared store, in whole seconds", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    expect(await rateLimitExceeded(opts)).toBe(false);
    expect(rpc).toHaveBeenCalledWith("rate_limit_hit", {
      p_bucket: "test",
      p_key: "1.2.3.4",
      p_window_seconds: 60,
      p_max: 3,
    });
  });

  it("refuses when the shared store says the key is over", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    expect(await rateLimitExceeded(opts)).toBe(true);
  });

  it("caps the window at a day, the longest the store keeps", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    await rateLimitExceeded({ ...opts, windowMs: 7 * 24 * 60 * 60 * 1000 });
    expect(rpc.mock.calls[0][1].p_window_seconds).toBe(86_400);
  });

  // A limiter outage must never close checkout, but a flood on one instance is still slowed.
  it("falls back to the per-instance count when the store fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "function rate_limit_hit does not exist" } });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    for (let i = 0; i < 3; i += 1) expect(await rateLimitExceeded(opts)).toBe(false);
    expect(await rateLimitExceeded(opts)).toBe(true);
    expect(errors).toHaveBeenCalledTimes(1);
    errors.mockRestore();
  });
});
