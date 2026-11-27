import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "whsec_" + "0".repeat(24) + "Zq7x";

vi.mock("@/lib/stripe/client", () => ({ getStripe: () => new Stripe("sk_test_signature_failure") }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => {
    throw new Error("an unverified delivery must not reach the database");
  },
}));

const { POST } = await import("@/app/api/stripe/webhook/route");

function deliver(signature: string) {
  return POST(
    new Request("https://x.test/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": signature },
      body: JSON.stringify({ id: "evt_forged", type: "checkout.session.completed" }),
    }),
  );
}

describe("Stripe webhook: a delivery whose signature does not verify", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("is refused with fixed words, whatever the SDK says about why", async () => {
    const res = await deliver("t=1,v1=00");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Webhook signature verification failed" });
  });

  it("tells a caller nothing about the signing secret when they ask the SDK to compare it", async () => {
    const sdkText = (() => {
      try {
        new Stripe("sk_test_signature_failure").webhooks.constructEvent("{}", "t=1,v1=00,secret=*", SECRET);
        return "";
      } catch (err) {
        return (err as Error).message;
      }
    })();
    expect(sdkText).toContain("Zq7x");

    const res = await deliver("t=1,v1=00,secret=*");
    const body = await res.text();
    expect(res.status).toBe(400);
    expect(body).not.toContain("Zq7x");
    expect(body).not.toContain(String(SECRET.length));
    expect(JSON.parse(body)).toEqual({ error: "Webhook signature verification failed" });
  });
});
