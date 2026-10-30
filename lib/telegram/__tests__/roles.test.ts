import { describe, expect, it } from "vitest";
import { TELEGRAM_ACTIONS, describeActions, isTelegramAction, telegramActionLabel } from "@/lib/telegram/roles";
import {
  LINK_CODE_LENGTH,
  generateLinkCode,
  hashLinkCode,
  linkCodeExpiry,
  normalizeLinkCode,
} from "@/lib/telegram/link-codes";

describe("Telegram actions", () => {
  it("are the catalog's Telegram keys", () => {
    expect(TELEGRAM_ACTIONS).toEqual([
      "telegram.google-review-reply",
      "telegram.shop-review-moderate",
      "telegram.shop-review-reply",
      "telegram.social-inbox-reply",
    ]);
    expect(isTelegramAction("telegram.shop-review-moderate")).toBe(true);
    expect(isTelegramAction("orders")).toBe(false);
    expect(isTelegramAction("review_manager")).toBe(false);
  });

  it("read as their catalog labels", () => {
    expect(telegramActionLabel("telegram.google-review-reply")).toBe("Reply to Google reviews");
    expect(describeActions(["telegram.google-review-reply", "telegram.shop-review-moderate"])).toBe(
      "Reply to Google reviews, Moderate shop reviews",
    );
    expect(describeActions([])).toBe("no actions");
  });
});
describe("link codes", () => {
  it("are 8 unambiguous characters", () => {
    for (let i = 0; i < 50; i += 1) {
      const code = generateLinkCode();
      expect(code).toHaveLength(LINK_CODE_LENGTH);
      expect(code).toMatch(/^[A-HJKMNP-Z2-9]+$/);
    }
  });

  it("hash the same however they are typed", () => {
    expect(normalizeLinkCode(" k7q2-mx9p ")).toBe("K7Q2MX9P");
    expect(hashLinkCode("k7q2 mx9p")).toBe(hashLinkCode("K7Q2MX9P"));
    expect(hashLinkCode("K7Q2MX9P")).not.toBe(hashLinkCode("K7Q2MX9Q"));
    expect(hashLinkCode("K7Q2MX9P")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("expire after 72 hours", () => {
    const now = new Date("2026-10-02T00:00:00Z");
    expect(linkCodeExpiry(now).toISOString()).toBe("2026-10-05T00:00:00.000Z");
  });
});
