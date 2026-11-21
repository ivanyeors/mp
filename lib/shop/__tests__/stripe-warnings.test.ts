import { describe, expect, it } from "vitest";
import {
  costingsSavedToasts,
  productName,
  savedToasts,
  stripeWarningText,
  thrownProblem,
  warningsFor,
} from "@/lib/shop/stripe-warnings";

describe("each problem carries its own next step", () => {
  it("a Stripe failure points at Sync to Stripe on that product", () => {
    const [w] = warningsFor("Ear Pad", [{ message: "Couldn't sync to Stripe: rate limited", next: { kind: "sync-to-stripe" } }]);
    expect(stripeWarningText(w!)).toBe(
      "Ear Pad: Couldn't sync to Stripe: rate limited. Open Ear Pad in Products and use Sync to Stripe to try again.",
    );
  });

  it("a price that could not be written or read points at Resync prices, not Sync to Stripe", () => {
    const [w] = warningsFor("Ear Pad", [{ message: "Couldn't save the new price for Size S: timeout", next: { kind: "resync-prices" } }]);
    expect(w).toEqual({
      product: "Ear Pad",
      message: "Couldn't save the new price for Size S: timeout",
      next: "Use Resync prices in Products to try again.",
    });
    expect(stripeWarningText(w!)).not.toMatch(/Sync to Stripe/);
  });

  it("a thrown reprice points at Resync prices, which retries for every auto-generated product", () => {
    const [w] = warningsFor("Silk Cover", [thrownProblem(new Error("db down"))]);
    expect(stripeWarningText(w!)).toBe(
      "Silk Cover: Couldn't update its prices from Costings: db down. Use Resync prices in Products to try again.",
    );
  });

  it("a failed Inventory step points at running it again", () => {
    const [w] = warningsFor(undefined, [
      { message: "Couldn't read items", next: { kind: "run-again", action: "Sync from Inventory" } },
    ]);
    expect(stripeWarningText(w!)).toBe("Couldn't read items. Run Sync from Inventory again.");
  });

  it("a problem with no next step shows only its message", () => {
    const [w] = warningsFor("Ear Pad", [{ message: "The old payment link was retired" }]);
    expect(w).toEqual({ product: "Ear Pad", message: "The old payment link was retired" });
    expect(stripeWarningText(w!)).toBe("Ear Pad: The old payment link was retired.");
  });

  it("a problem with no product to name still reads", () => {
    const [w] = warningsFor(undefined, [{ message: "Couldn't read the shop products", next: { kind: "resync-prices" } }]);
    expect(w).not.toHaveProperty("product");
    expect(stripeWarningText(w!)).toBe("Couldn't read the shop products. Use Resync prices in Products to try again.");
  });
});

describe("what a screen says after a save", () => {
  const warning = { product: "Ear Pad", message: "Couldn't sync to Stripe: boom", next: "Open Ear Pad in Products and use Sync to Stripe to try again." };

  it("all clear is plain success", () => {
    expect(costingsSavedToasts({})).toEqual([{ type: "success", title: "Costings saved" }]);
    expect(costingsSavedToasts(null)).toEqual([{ type: "success", title: "Costings saved" }]);
  });

  it("a warning replaces plain success, stays until closed and scrolls when long", () => {
    const toasts = costingsSavedToasts({ stripe_warnings: [warning] });
    expect(toasts.map((t) => t.type)).toEqual(["warning"]);
    expect(toasts[0]!.title).toBe("Costings saved, but some shop prices need attention");
    expect(toasts[0]!.options).toMatchObject({
      description: stripeWarningText(warning),
      duration: Infinity,
      closeButton: true,
      classNames: { description: expect.stringContaining("overflow-y-auto") },
    });
    expect(toasts[0]!.options!.classNames!.description).toMatch(/max-h-/);
  });

  it("shows unresolvable variants", () => {
    expect(costingsSavedToasts({ unresolvable_variants: ["v1", "v2"] })).toEqual([
      { type: "success", title: "Costings saved" },
      { type: "warning", title: "2 variant(s) have no costing source" },
    ]);
  });

  it("raises the Stripe warning last, so it sits on top of the others", () => {
    const toasts = costingsSavedToasts({ unresolvable_variants: ["v1"], stripe_warnings: [warning, warning] });
    expect(toasts.map((t) => t.title)).toEqual([
      "1 variant(s) have no costing source",
      "Costings saved, but some shop prices need attention",
    ]);
    expect(toasts[1]!.options!.description!.split("\n\n")).toHaveLength(2);
  });

  it("keeps a screen's own success options when nothing went wrong", () => {
    const options = { description: "It's in the shop, so they're on sale now." };
    expect(savedToasts("1 new size added", { successOptions: options })).toEqual([
      { type: "success", title: "1 new size added", options },
    ]);
  });
});

describe("productName", () => {
  it("uses the default-locale title, else the slug", () => {
    expect(productName({ slug: "ear-pad", content: { "zh-CN": { title: "耳垫" }, "en-US": { title: "Ear Pad" } } })).toBe(
      "Ear Pad",
    );
    expect(productName({ slug: "ear-pad", content: { "zh-CN": { title: "耳垫" } } })).toBe("ear-pad");
    expect(productName({ slug: "ear-pad", content: null })).toBe("ear-pad");
  });
});
