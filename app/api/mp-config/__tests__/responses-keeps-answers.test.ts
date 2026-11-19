import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The health answers the Premium rule graph reads (sleep position, pain areas,
 * bolster use) used to be stripped by this route's schema, so every Draft and
 * in-store Result was stored without them and its detail page refused to load.
 * These pin that they are kept, and that a save which does not send them (the
 * Admin Panel's Save) leaves the stored answers alone.
 */

const h = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/auth/admin", () => ({
  requireAnyAdmin: vi.fn().mockResolvedValue(null),
  requireAdmin: vi.fn().mockResolvedValue(null),
  getAdminContext: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/auth/user", () => ({ getAuthUser: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/rate-limit", () => ({
  clientIp: () => "127.0.0.1",
  rateLimitExceeded: vi.fn().mockResolvedValue(false),
}));
vi.mock("@/lib/results/access", async (orig) => ({
  ...(await orig<typeof import("@/lib/results/access")>()),
  requireResultAccess: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => {
    const b = { from: () => b, select: () => b, eq: () => b, maybeSingle: h.maybeSingle, upsert: h.upsert };
    return b;
  },
}));

const { POST } = await import("@/app/api/mp-config/responses/route");

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const post = (data: Record<string, unknown>) =>
  POST(
    new Request("https://x.test/api/mp-config/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: ID, data }),
    }),
  );

/** What the route wrote to `mp_config_responses.data`. */
const writtenData = () => (h.upsert.mock.calls[0]![0] as { data: Record<string, unknown> }).data;

beforeEach(() => {
  vi.clearAllMocks();
  h.upsert.mockResolvedValue({ error: null });
});

describe("POST /api/mp-config/responses keeps the sleep answers", () => {
  it("stores sleep position, pain areas and bolster use on a new Draft Result", async () => {
    h.maybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await post({
      shoulderLength: "43.18",
      sleepPositionType: ["side-and-back"],
      sleepPainAreas: ["lower-back"],
      usesBolster: "no",
    });
    expect(res.status).toBe(200);
    expect(writtenData()).toMatchObject({
      shoulderLength: "43.18",
      sleepPositionType: ["side-and-back"],
      sleepPainAreas: ["lower-back"],
      usesBolster: "no",
    });
  });

  it("keeps stored answers a save does not send", async () => {
    h.maybeSingle.mockResolvedValue({
      data: {
        status: "held",
        data: {
          name: "Ada",
          shoulderLength: "40",
          sleepPositionType: ["side"],
          sleepPainAreas: ["neck"],
          usesBolster: "yes",
        },
      },
      error: null,
    });
    // The Admin Panel's Save sends the measurement fields only.
    const res = await post({ name: "Ada Lovelace", shoulderLength: "41" });
    expect(res.status).toBe(200);
    expect(writtenData()).toMatchObject({
      name: "Ada Lovelace",
      shoulderLength: "41",
      sleepPositionType: ["side"],
      sleepPainAreas: ["neck"],
      usesBolster: "yes",
    });
  });

  it("keeps who the pillow is for on the configurator's save", async () => {
    h.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await post({ name: "Robin", pillowFor: "other" })).status).toBe(200);
    expect(writtenData()).toMatchObject({ name: "Robin", pillowFor: "other" });
  });

  it("keeps who the pillow is for through a Staff save that does not send it", async () => {
    h.maybeSingle.mockResolvedValue({ data: { status: "held", data: { name: "Robin", pillowFor: "other" } }, error: null });
    expect((await post({ name: "Robin Lee" })).status).toBe(200);
    expect(writtenData()).toMatchObject({ name: "Robin Lee", pillowFor: "other" });
  });

  it("refuses an answer that is neither", async () => {
    h.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await post({ name: "Robin", pillowFor: "everyone" })).status).toBe(400);
  });

  it("still clears an answer the configurator sends empty", async () => {
    h.maybeSingle.mockResolvedValue({
      data: { status: null, data: { sleepPositionType: ["side"], usesBolster: "yes" } },
      error: null,
    });
    const res = await post({ sleepPositionType: [], usesBolster: "" });
    expect(res.status).toBe(200);
    expect(writtenData()).toMatchObject({ sleepPositionType: [], usesBolster: "" });
  });
});
