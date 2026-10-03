import { describe, expect, it } from "vitest";
import {
  TELEGRAM_ACTIONS,
  TELEGRAM_ROLES,
  isTelegramRole,
  telegramRoleCan,
} from "@/lib/telegram/roles";
import {
  LINK_CODE_LENGTH,
  generateLinkCode,
  hashLinkCode,
  linkCodeExpiry,
  normalizeLinkCode,
} from "@/lib/telegram/link-codes";

describe("Telegram role matrix", () => {
  it("only review managers can reply on Google", () => {
    expect(telegramRoleCan("review_manager", "google_review.reply")).toBe(true);
    expect(telegramRoleCan("shop_moderator", "google_review.reply")).toBe(false);
  });

  it("review managers and shop moderators moderate shop reviews; inbox agents don't", () => {
    expect(telegramRoleCan("review_manager", "shop_review.moderate")).toBe(true);
    expect(telegramRoleCan("shop_moderator", "shop_review.moderate")).toBe(true);
    expect(telegramRoleCan("inbox_agent", "shop_review.moderate")).toBe(false);
  });

  it("inbox agents and review managers answer customer messages; shop moderators don't", () => {
    expect(telegramRoleCan("inbox_agent", "social_inbox.reply")).toBe(true);
    expect(telegramRoleCan("review_manager", "social_inbox.reply")).toBe(true);
    expect(telegramRoleCan("shop_moderator", "social_inbox.reply")).toBe(false);
    expect(telegramRoleCan("inbox_agent", "google_review.reply")).toBe(false);
  });

  it("every role grants only known actions", () => {
    for (const role of TELEGRAM_ROLES) {
      for (const action of TELEGRAM_ACTIONS) expect(typeof telegramRoleCan(role, action)).toBe("boolean");
    }
    expect(isTelegramRole("review_manager")).toBe(true);
    expect(isTelegramRole("inbox_agent")).toBe(true);
    expect(isTelegramRole("owner")).toBe(false);
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
