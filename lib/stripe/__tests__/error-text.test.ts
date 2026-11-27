import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { errorTextWithoutStripeRequestId } from "../error-text";

describe("Stripe error text shown to people", () => {
  it("drops the request id the SDK puts in front of an API error", () => {
    const err = new Stripe.errors.StripeInvalidRequestError({
      requestId: "req_AbC123",
      message: "No such price: 'price_1'",
    });
    expect(err.message).toBe("[req_AbC123] No such price: 'price_1'");
    expect(errorTextWithoutStripeRequestId(err, "fallback")).toBe("No such price: 'price_1'");
  });

  it("leaves a Stripe error with no request id as it is", () => {
    const err = new Stripe.errors.StripeConnectionError({ message: "An error occurred with our connection to Stripe." });
    expect(errorTextWithoutStripeRequestId(err, "fallback")).toBe("An error occurred with our connection to Stripe.");
  });

  it("leaves this site's own errors as they are, brackets included", () => {
    expect(errorTextWithoutStripeRequestId(new Error("[hold] Pricing changed"), "fallback")).toBe("[hold] Pricing changed");
  });

  it("uses the fallback for something that is not an error", () => {
    expect(errorTextWithoutStripeRequestId("boom", "Could not start payment")).toBe("Could not start payment");
  });
});
