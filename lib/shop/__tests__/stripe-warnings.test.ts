import { describe, expect, it } from "vitest";
import { productName, stripeWarningToast } from "@/lib/shop/stripe-warnings";

describe("the Stripe warning staff see after a price save", () => {
  it("names each product, gives the message and points at Sync to Stripe", () => {
    const [title, options] = stripeWarningToast("Costings saved, but a price did not reach Stripe", [
      { product: "Ear Pad", message: "Couldn't sync to Stripe: Rate limit exceeded" },
      { product: "Satin White Cover", message: "Couldn't save the new price for Size S: timeout" },
    ]);

    expect(title).toBe("Costings saved, but a price did not reach Stripe");
    expect(options.description.split("\n\n")).toEqual([
      "Ear Pad: Couldn't sync to Stripe: Rate limit exceeded. Open Ear Pad in Products and use Sync to Stripe to try again.",
      "Satin White Cover: Couldn't save the new price for Size S: timeout. Open Satin White Cover in Products and use Sync to Stripe to try again.",
    ]);
  });

  it("stays until staff close it", () => {
    const [, options] = stripeWarningToast("t", [{ product: "p", message: "m" }]);
    expect(options.duration).toBe(Infinity);
    expect(options.closeButton).toBe(true);
  });

  it("names a product by its default-locale title, else its slug", () => {
    expect(productName({ slug: "ear-pad", content: { "zh-CN": { title: "耳垫" }, "en-US": { title: "Ear Pad" } } })).toBe(
      "Ear Pad",
    );
    expect(productName({ slug: "ear-pad", content: { "zh-CN": { title: "耳垫" } } })).toBe("ear-pad");
    expect(productName({ slug: "ear-pad", content: null })).toBe("ear-pad");
  });
});
