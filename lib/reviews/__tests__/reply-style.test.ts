import { describe, expect, it } from "vitest";
import { replyStyleFor } from "@/lib/reviews/reply-style";

describe("replyStyleFor", () => {
  it("gives 1–2★ a service-recovery reply", () => {
    expect(replyStyleFor(1)).toBe("service_recovery");
    expect(replyStyleFor(2)).toBe("service_recovery");
  });

  it("gives 3★ a constructive reply and 4–5★ a thank-you", () => {
    expect(replyStyleFor(3)).toBe("constructive");
    expect(replyStyleFor(4)).toBe("thank_you");
    expect(replyStyleFor(5)).toBe("thank_you");
  });

  it("never sells to a review with no rating", () => {
    expect(replyStyleFor(null)).toBe("constructive");
    expect(replyStyleFor(undefined)).toBe("constructive");
  });
});
