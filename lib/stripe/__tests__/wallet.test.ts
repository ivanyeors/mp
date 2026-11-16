import { describe, expect, it, vi } from "vitest";
import type { Stripe } from "@stripe/stripe-js";
import { confirmWithWallet, fromMinorUnits, toMinorUnits, walletsBeside } from "../wallet";

/**
 * Wallet buttons beside the checkout button (ADR 0052): the sheet shows the
 * page's total, and the Checkout Session the server then makes is paid only if
 * it totals exactly that.
 */

function fakeStripe(opts: {
  totalMinor?: number;
  loadError?: string;
  confirmError?: string;
}) {
  const confirm = vi.fn(async () =>
    opts.confirmError
      ? { type: "error" as const, error: { message: opts.confirmError } }
      : { type: "success" as const },
  );
  const initCheckoutElementsSdk = vi.fn(() => ({
    loadActions: async () =>
      opts.loadError
        ? { type: "error" as const, error: { message: opts.loadError, code: null } }
        : {
            type: "success" as const,
            actions: {
              getSession: () => ({
                total: { total: { minorUnitsAmount: opts.totalMinor ?? 0, amount: "" } },
                minorUnitsAmountDivisor: 100,
              }),
              confirm,
            },
          },
  }));
  const stripe = { initCheckoutElementsSdk } as unknown as Pick<Stripe, "initCheckoutElementsSdk">;
  return { stripe, confirm, initCheckoutElementsSdk };
}

const PAY = { clientSecret: "cs_test_1_secret_abc", paymentMethodId: "pm_applepay_1", authorizedMinor: 12850 };

describe("confirmWithWallet", () => {
  it("pays the Session with the Apple Pay payment method when it totals what the sheet showed", async () => {
    const { stripe, confirm, initCheckoutElementsSdk } = fakeStripe({ totalMinor: 12850 });
    expect(await confirmWithWallet(stripe, PAY)).toEqual({ type: "paid" });
    expect(initCheckoutElementsSdk).toHaveBeenCalledWith({ clientSecret: "cs_test_1_secret_abc" });
    expect(confirm).toHaveBeenCalledWith({ paymentMethod: "pm_applepay_1" });
  });

  it("charges nothing when the server priced the Order differently", async () => {
    // Exclusive GST the page does not show: 128.50 became 140.07.
    const { stripe, confirm } = fakeStripe({ totalMinor: 14007 });
    expect(await confirmWithWallet(stripe, PAY)).toEqual({ type: "total_changed", total: 140.07 });
    expect(confirm).not.toHaveBeenCalled();
  });

  it("charges nothing when the Session will not load", async () => {
    const { stripe, confirm } = fakeStripe({ loadError: "No such checkout session" });
    expect(await confirmWithWallet(stripe, PAY)).toEqual({ type: "failed", message: "No such checkout session" });
    expect(confirm).not.toHaveBeenCalled();
  });

  it("reports a declined payment", async () => {
    const { stripe } = fakeStripe({ totalMinor: 12850, confirmError: "Your card was declined." });
    expect(await confirmWithWallet(stripe, PAY)).toEqual({ type: "failed", message: "Your card was declined." });
  });
});

describe("minor units", () => {
  it("counts cents for SGD, and rounds away float noise", () => {
    expect(toMinorUnits(128.5, "SGD")).toBe(12850);
    expect(toMinorUnits(0.1 + 0.2, "sgd")).toBe(30);
    expect(fromMinorUnits(12850, "SGD")).toBe(128.5);
  });

  it("leaves a zero-decimal currency in whole units", () => {
    expect(toMinorUnits(1500, "JPY")).toBe(1500);
    expect(fromMinorUnits(1500, "jpy")).toBe(1500);
  });
});

describe("walletsBeside", () => {
  it("shows Apple Pay, Google Pay, then the checkout button on a computer that has both", () => {
    expect(walletsBeside(["googlePay", "applePay"], true)).toEqual(["applePay", "googlePay"]);
  });

  it("shows the one wallet a phone has", () => {
    expect(walletsBeside(["applePay"], false)).toEqual(["applePay"]);
    expect(walletsBeside(["googlePay"], false)).toEqual(["googlePay"]);
  });

  it("keeps one wallet beside the button in a phone's bar, even if both could show", () => {
    expect(walletsBeside(["applePay", "googlePay"], false)).toEqual(["applePay"]);
  });

  it("shows none where Stripe offers neither, as while Google Pay is off on a PC", () => {
    expect(walletsBeside([], true)).toEqual([]);
  });
});
