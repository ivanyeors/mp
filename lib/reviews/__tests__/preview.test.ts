import { describe, expect, it, vi } from "vitest";
import {
  GOOGLE_CARD_HEADER,
  PREVIEW_CARD_PREFIX,
  PREVIEW_REVIEW_ID,
  SHOP_CARD_HEADER,
  parseReviewCallback,
} from "@/lib/reviews/cards";
import { PREVIEW_INTRO, buildReviewCardPreview, sendReviewCardPreview } from "@/lib/reviews/preview";
import { isReviewUpdate } from "@/lib/reviews/telegram-handler";

/**
 * The Telegram preview: sample reviews through the production card renderer,
 * marked as previews, with buttons that can only check access.
 */

const NOW = new Date("2026-10-02T09:00:00Z");
const lines = (text: string) => text.split("\n");

describe("buildReviewCardPreview", () => {
  it("renders every kind of card, each marked PREVIEW above the real header", async () => {
    const { cards, usedClaude } = await buildReviewCardPreview({ now: NOW, draft: null });

    expect(usedClaude).toBe(false);
    expect(cards.map((c) => c.what)).toEqual([
      "a new 5★ review, with a thank-you reply",
      "a new 3★ review, with a constructive reply",
      "a new 1★ review, with a service-recovery reply",
      "a review reopened after its rating dropped from 5★ to 2★",
      "how a card looks after a review manager taps Post",
      "a new shop review",
    ]);
    for (const { card } of cards) {
      expect(lines(card.text)[0]).toMatch(/^🧪 PREVIEW — .*Sample review, not real\./);
      expect([GOOGLE_CARD_HEADER, SHOP_CARD_HEADER]).toContain(lines(card.text)[1]);
      expect(card.text.length).toBeLessThanOrEqual(4096);
      // Sample replies follow the rules the real ones are held to.
      expect(card.text).not.toContain("⚠️");
    }
  });

  it("gives every button the preview id, which matches no review", async () => {
    const { cards } = await buildReviewCardPreview({ now: NOW, draft: null });
    const buttons = cards.flatMap((c) => c.card.replyMarkup?.inline_keyboard.flat() ?? []);
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) expect(parseReviewCallback(b.callback_data)).toMatchObject({ id: PREVIEW_REVIEW_ID });
  });

  it("shows the recovery and reopened cards the way they will really look", async () => {
    const { cards } = await buildReviewCardPreview({ now: NOW, draft: null });
    const [, , recovery, reopened, posted] = cards.map((c) => c.card);

    expect(recovery.text).toContain("🛟 SERVICE RECOVERY");
    expect(recovery.text).toContain("WhatsApp at +65 8780 5311");
    expect(reopened.text).toContain("🔄 REOPENED — the rating changed from 5★ to 2★ after it was answered.");
    expect(reopened.text).toContain("💬 Our reply on Google now (posting replaces it):");
    expect(reopened.replyMarkup?.inline_keyboard.flat().map((b) => b.text)).toEqual(["✅ Post reply", "🙈 Skip"]);
    expect(posted.text).toContain("✅ Replied on Google Maps by Ivan");
    expect(posted.replyMarkup).toBeUndefined();
  });

  it("uses real Claude drafts when it can, with the reopened review's history", async () => {
    const draft = vi.fn(async () => ({ ok: true as const, reply: "A fresh Claude draft.", model: "claude-opus-5-5" }));
    const { cards, usedClaude } = await buildReviewCardPreview({ now: NOW, draft });

    expect(usedClaude).toBe(true);
    expect(draft).toHaveBeenCalledTimes(4);
    expect(draft).toHaveBeenCalledWith(
      expect.objectContaining({ starRating: 2, update: expect.objectContaining({ previousRating: 5 }) }),
    );
    expect(cards[0].card.text).toContain("The reply is a real Claude draft.");
    expect(cards[0].card.text).toContain("A fresh Claude draft.");
  });

  it("falls back to sample text, and says so, when Claude fails", async () => {
    const draft = vi.fn(async () => ({ ok: false as const, error: "ANTHROPIC_API_KEY was rejected" }));
    const { cards, usedClaude, draftErrors } = await buildReviewCardPreview({ now: NOW, draft });
    expect(usedClaude).toBe(false);
    expect(draftErrors).toHaveLength(4);
    expect(cards[0].card.text).toContain("The reply is sample text standing in for Claude's draft.");
  });

  it("routes a reply to a Google preview card, marked so the handler explains instead of saving", async () => {
    const { cards } = await buildReviewCardPreview({ now: NOW, draft: null });
    const reply = (text: string) => ({
      message: {
        message_id: 9,
        chat: { id: -1001279910218 },
        from: { id: 1 },
        text: "Looks good!",
        reply_to_message: { message_id: 8, text },
      },
    });
    expect(cards[0].card.text.startsWith(PREVIEW_CARD_PREFIX)).toBe(true);
    expect(isReviewUpdate(reply(cards[0].card.text))).toBe(true);
    expect(isReviewUpdate(reply(cards.at(-1)!.card.text))).toBe(false);
  });
});

describe("sendReviewCardPreview", () => {
  it("sends the intro, then every card, in order", async () => {
    let id = 0;
    const send = vi.fn(async () => ({ ok: true as const, chatId: -1, messageId: (id += 1) }));
    const result = await sendReviewCardPreview({ now: NOW, draft: null, send });

    expect(result).toEqual({ ok: true, sent: 7, total: 7, usedClaude: false });
    expect(send.mock.calls[0]).toEqual([PREVIEW_INTRO, undefined]);
    expect(String((send.mock.calls[1] as unknown[])[0])).toMatch(/^🧪 PREVIEW — a new 5★ review/);
  });

  it("stops at the first failure and says why", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, chatId: -1, messageId: 1 })
      .mockResolvedValueOnce({ ok: false, error: "Forbidden: bot was kicked from the supergroup chat" });
    const result = await sendReviewCardPreview({ now: NOW, draft: null, send });
    expect(result).toEqual({
      ok: false,
      sent: 1,
      total: 7,
      usedClaude: false,
      error: "Forbidden: bot was kicked from the supergroup chat",
    });
    expect(send).toHaveBeenCalledTimes(2);
  });
});
