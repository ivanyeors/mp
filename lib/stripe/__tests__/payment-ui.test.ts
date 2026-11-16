import { afterEach, describe, expect, it } from "vitest";
import { onPagePublishableKey, resolvePaymentUi } from "../payment-ui";

/** ADR 0053: the shopper pays on our page only with a publishable key for the secret key's account. */

const SAVED = {
  secret: process.env.STRIPE_SECRET_KEY,
  publishable: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
};

function keys(secret: string | undefined, publishable: string | undefined) {
  if (secret === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = secret;
  if (publishable === undefined) delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  else process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = publishable;
}

afterEach(() => keys(SAVED.secret, SAVED.publishable));

describe("resolvePaymentUi", () => {
  it("pays on the page when asked and the keys are the same mode", () => {
    keys("sk_live_x", "pk_live_y");
    expect(onPagePublishableKey()).toBe("pk_live_y");
    expect(resolvePaymentUi("elements")).toBe("elements");
    keys("rk_test_x", " pk_test_y ");
    expect(resolvePaymentUi("elements")).toBe("elements");
  });

  it("sends the shopper to Stripe's page with no key, a key from the other mode, or not a key", () => {
    keys("sk_live_x", undefined);
    expect(resolvePaymentUi("elements")).toBe("hosted");
    keys("sk_live_x", "pk_test_y");
    expect(resolvePaymentUi("elements")).toBe("hosted");
    keys("sk_test_x", "pk_live_y");
    expect(resolvePaymentUi("elements")).toBe("hosted");
    keys("sk_live_x", "sk_live_oops");
    expect(onPagePublishableKey()).toBeNull();
  });

  it("never upgrades a request for the hosted page, or one that names nothing", () => {
    keys("sk_live_x", "pk_live_y");
    expect(resolvePaymentUi("hosted")).toBe("hosted");
    expect(resolvePaymentUi(undefined)).toBe("hosted");
  });
});
