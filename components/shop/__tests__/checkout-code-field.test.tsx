import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { CheckoutCodeField } from "@/components/shop/checkout-code-field";
import type { CheckoutCodeStatus } from "@/lib/checkout-code/shared";

/**
 * The one code field at checkout (ADR 0033): a referral or a discount code
 * says it is active; a discount says what it takes off. Nothing the check turns
 * down ever reads as a blocker.
 */
const render = (status: CheckoutCodeStatus) =>
  renderToString(
    <CheckoutCodeField
      id="code"
      value="X"
      onChange={() => {}}
      status={status}
      formatAmount={(n) => `S$${n.toFixed(2)}`}
    />,
  ).replace(/<!-- -->/g, "");

describe("CheckoutCodeField", () => {
  it("is one field for both kinds of code", () => {
    const html = render({ state: "idle" });
    expect(html).toContain("Discount or referral code");
    expect(html).toContain('maxLength="64"');
  });

  it("says a referral code is active, and whose it is", () => {
    expect(render({ state: "referral", code: "ABCD2345", partnerName: "Spine Clinic" })).toContain(
      "Referral code active — referred by Spine Clinic",
    );
  });

  it("says a discount code is active and what it takes off", () => {
    expect(render({ state: "discount", code: "SAVE10", discount: 36, freeShipping: false })).toContain(
      "Discount code active — S$36.00 off",
    );
    expect(render({ state: "discount", code: "SHIP", discount: 0, freeShipping: true })).toContain(
      "Discount code active — free shipping",
    );
    expect(render({ state: "discount", code: "SAVE10", discount: null, freeShipping: false })).toContain(
      "it comes off your build&#x27;s price",
    );
  });

  it("lets the shopper carry on past a code it cannot use", () => {
    expect(render({ state: "unknown", code: "NOPE" })).toContain("Code not recognised — you can still continue.");
    expect(render({ state: "invalid", code: "OLD", reason: "This code has expired" })).toContain(
      "This code has expired. You can still continue without it.",
    );
  });
});
