import { beforeEach, describe, expect, it } from "vitest";
import { clientIp, isRateLimited, resetRateLimits } from "@/lib/rate-limit";

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
