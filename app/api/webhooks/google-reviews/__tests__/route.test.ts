import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ after: vi.fn(), sync: vi.fn() }));

vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: h.after,
}));
vi.mock("@/lib/reviews/google-sync", () => ({ syncGoogleReviews: h.sync }));

const { POST } = await import("@/app/api/webhooks/google-reviews/route");
const { resetRateLimits } = await import("@/lib/rate-limit");

function push(token: string | null, data?: unknown) {
  const url = `https://x.test/api/webhooks/google-reviews${token === null ? "" : `?token=${token}`}`;
  const message = data === undefined ? {} : { data: Buffer.from(JSON.stringify(data)).toString("base64") };
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: { ...message, messageId: "1" }, subscription: "projects/p/subscriptions/s" }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimits();
  vi.stubEnv("GOOGLE_REVIEWS_PUSH_TOKEN", "push-secret");
  h.sync.mockResolvedValue({ ok: true, fetched: 1 });
});

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/webhooks/google-reviews", () => {
  it("refuses a missing or wrong token, and everything when the token is unset", async () => {
    expect((await POST(push(null, { type: "NEW_REVIEW" }))).status).toBe(401);
    expect((await POST(push("nope", { type: "NEW_REVIEW" }))).status).toBe(401);
    vi.stubEnv("GOOGLE_REVIEWS_PUSH_TOKEN", "");
    expect((await POST(push("", { type: "NEW_REVIEW" }))).status).toBe(401);
    expect(h.after).not.toHaveBeenCalled();
  });

  it("acknowledges other notification types without syncing", async () => {
    const res = await POST(push("push-secret", { type: "NEW_CUSTOMER_MEDIA" }));
    expect(res.status).toBe(204);
    expect(h.after).not.toHaveBeenCalled();
  });

  it("acknowledges a review notification at once and syncs after", async () => {
    const res = await POST(push("push-secret", { type: "NEW_REVIEW", review: "accounts/1/locations/2/reviews/3" }));
    expect(res.status).toBe(204);
    expect(h.after).toHaveBeenCalledOnce();
    expect(h.sync).not.toHaveBeenCalled();
    vi.spyOn(console, "info").mockImplementation(() => {});
    await h.after.mock.calls[0][0]();
    expect(h.sync).toHaveBeenCalledWith();
  });

  it("still syncs when the payload is unreadable", async () => {
    const res = await POST(push("push-secret"));
    expect(res.status).toBe(204);
    expect(h.after).toHaveBeenCalledOnce();
  });
});
