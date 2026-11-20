import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  HoldShippingFields,
  HoldShippingTotalRow,
  holdShippingAmount,
  holdShippingCheck,
  type HoldShippingMethod,
  type HoldShippingOption,
} from "../hold-shipping-fields";
import type { HoldShippingAddress } from "../saved-address-select";

const method = (over: Partial<HoldShippingMethod>): HoldShippingMethod => ({
  id: "m",
  slug: "standard",
  base_rate: 0,
  free_above: null,
  currency: "SGD",
  rate_source: "easyship",
  content: { "en-US": { name: "Standard Shipping" } },
  ...over,
});

const priced = (over: Partial<HoldShippingOption> = {}): HoldShippingOption => ({
  method: method({}),
  price: 37.5,
  status: "priced",
  currency: "SGD",
  window: "3–5 business days",
  courier: "J&T Express",
  ...over,
});

const address: HoldShippingAddress = {
  recipient: "Ada",
  line1: "1 Road",
  line2: "",
  city: "North Hollywood",
  postal_code: "91606",
  country: "US",
};

function render(options: HoldShippingOption[], over: Partial<HoldShippingAddress> = {}) {
  return renderToStaticMarkup(
    <HoldShippingFields
      options={options}
      goodsSubtotal={448}
      selectedId={options[0]?.method.id ?? ""}
      onSelect={() => {}}
      address={{ ...address, ...over }}
      setAddress={() => {}}
      errors={{}}
      savedAddresses={{ signedIn: false, addresses: [], value: "new", onValueChange: () => {} }}
      recipientPlaceholder="Name"
    />,
  );
}

describe("Customisation shipping (ADR 0032)", () => {
  it("asks where it ships and prices a live method as one figure with its delivery window", () => {
    const html = render([priced()]);
    expect(html).toContain("Ship to");
    expect(html).toContain("Standard Shipping");
    expect(html).toContain("SGD 37.50");
    expect(html).toContain("3–5 business days");
    expect(html).toContain("via J&amp;T Express");
    expect(html).toContain("State / Province");
  });

  it("shows the delivery time Staff set, even before the address is priced", () => {
    const html = render([
      priced({ price: null, status: "needs_postal", window: "About 2 weeks", courier: null }),
    ]);
    expect(html).toContain("About 2 weeks");
    expect(html).not.toContain("via ");
  });

  it("says what a live method still needs instead of a price", () => {
    const html = render([priced({ price: null, status: "needs_postal", window: null })], { postal_code: "" });
    expect(html).toContain("Enter postal code");
    expect(html).toContain("Enter your postal code below to see the rate");
    expect(holdShippingCheck("needs_postal")).toMatchObject({ valid: false });
    expect(holdShippingCheck("priced")).toMatchObject({ valid: true });
  });

  it("disables a method no courier delivers to the address", () => {
    const html = render([priced({ price: null, status: "unavailable", window: null })]);
    expect(html).toContain("No courier delivers this to your address");
    expect(html).toContain("disabled");
  });

  it("marks the postal code optional where the country has none, and asks no state where none is needed", () => {
    const html = render([priced()], { country: "HK", postal_code: "" });
    expect(html).toContain("(optional)");
    expect(html).not.toContain("State / Province");
  });

  it("puts the shipping into the footer, free once the goods reach free_above", () => {
    const option = priced({ method: method({ free_above: 400 }) });
    expect(holdShippingAmount(option, 399)).toBe(37.5);
    expect(holdShippingAmount(option, 400)).toBe(0);
    expect(holdShippingAmount(priced({ price: null, status: "quoting" }), 100)).toBeNull();
    expect(renderToStaticMarkup(<HoldShippingTotalRow option={option} goodsSubtotal={399} />)).toContain(
      "SGD 37.50",
    );
    expect(renderToStaticMarkup(<HoldShippingTotalRow option={option} goodsSubtotal={400} />)).toContain("Free");
  });
});
