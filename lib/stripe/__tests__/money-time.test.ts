import { describe, expect, it } from "vitest";
import { paymentIntentCapturedAt, stripeEventTime, stripeTime } from "../money-time";

type Intent = Record<string, unknown>;
const stripeWith = (intent: Intent | Error) => ({
  paymentIntents: {
    retrieve: async () => {
      if (intent instanceof Error) throw intent;
      return intent;
    },
  },
});
const capturedAt = (intent: Intent | Error) =>
  paymentIntentCapturedAt(stripeWith(intent) as unknown as Parameters<typeof paymentIntentCapturedAt>[0], "pi_1");

describe("Stripe money time", () => {
  it("reads an event's own time, not the time it was delivered", () => {
    expect(stripeEventTime({ created: 1_780_000_000 })).toBe("2026-05-28T20:26:40.000Z");
    expect(stripeTime(1_780_000_000)).toBe("2026-05-28T20:26:40.000Z");
  });

  it("dates a capture by its balance transaction, not the authorisation days before", () => {
    const at = capturedAt({
      capture_method: "manual",
      latest_charge: { captured: true, created: 1_779_000_000, balance_transaction: { created: 1_780_000_000 } },
    });
    return expect(at).resolves.toBe("2026-05-28T20:26:40.000Z");
  });

  it("dates an immediate payment by its charge when the balance transaction is not expanded", () => {
    const at = capturedAt({
      capture_method: "automatic",
      latest_charge: { captured: true, created: 1_780_000_000, balance_transaction: "txn_1" },
    });
    return expect(at).resolves.toBe("2026-05-28T20:26:40.000Z");
  });

  it("has no time for an uncaptured hold, or when Stripe cannot be asked", async () => {
    await expect(
      capturedAt({ capture_method: "manual", latest_charge: { captured: false, created: 1, balance_transaction: null } }),
    ).resolves.toBeNull();
    await expect(capturedAt({ capture_method: "manual", latest_charge: "ch_1" })).resolves.toBeNull();
    await expect(capturedAt(new Error("network"))).resolves.toBeNull();
  });
});
