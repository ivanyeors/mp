import { describe, expect, it } from "vitest";
import {
  ECHO_NOTE_PREFIX,
  INBOX_CARD_HEADERS,
  TELEGRAM_MAX_CAPTION,
  customerLabel,
  inboxPreviewPlatform,
  isInboxBotText,
  renderEchoNote,
  renderInboxCard,
  renderSentNote,
} from "@/lib/social-inbox/cards";
import { inboxPreviewCard } from "@/lib/social-inbox/preview";

/**
 * Message cards: the header names the platform and person, the footer always
 * says how to answer, and the card always fits what Telegram will deliver.
 */

const lines = (text: string) => text.split("\n");

describe("renderInboxCard", () => {
  it("names the platform and person, quotes the message, and says how to answer", () => {
    const card = renderInboxCard({
      platform: "instagram",
      customer: { displayName: "Jane Tan", username: "janetan" },
      text: "Do you have size M?",
      attachments: [{ kind: "video", url: "https://cdn.example/v.mp4" }],
      sentAt: "2026-10-03T07:15:00Z",
    });
    expect(lines(card)[0]).toBe("💬 INSTAGRAM DM · Jane Tan (@janetan)");
    expect(lines(card)[1]).toBe("3 Oct 2026, 3:15 pm");
    expect(card).toContain("“Do you have size M?”");
    expect(card).toContain("🎥 Video: https://cdn.example/v.mp4");
    expect(lines(card).at(-1)).toBe("↩️ Reply to this message to answer on Instagram. Start with // for a team-only note.");
  });

  it("leaves out the photo it is the caption of, and points to the app for one Telegram can't show", () => {
    const shown = renderInboxCard({
      platform: "facebook",
      customer: { displayName: null, username: null },
      text: null,
      attachments: [{ kind: "image", url: "https://cdn.example/p.jpg" }],
      sentAt: null,
      photoIndex: 0,
    });
    expect(lines(shown)[0]).toBe("💬 FACEBOOK MESSAGE · A Facebook user");
    expect(shown).not.toContain("📷");

    const tiktok = renderInboxCard({
      platform: "tiktok",
      customer: { displayName: null, username: "sleepy.sam" },
      text: null,
      attachments: [{ kind: "image", url: null }],
      sentAt: null,
    });
    expect(lines(tiktok)[0]).toBe("💬 TIKTOK DM · @sleepy.sam");
    expect(tiktok).toContain("📷 Photo — open the TikTok app to see it");
  });

  it("clips a long message, never the header or the footer, to fit a caption", () => {
    const card = renderInboxCard(
      {
        platform: "instagram",
        customer: { displayName: "Jane", username: null },
        text: "z".repeat(5000),
        attachments: [{ kind: "share", url: `https://cdn.example/${"x".repeat(900)}` }],
        sentAt: "2026-10-03T07:15:00Z",
      },
      TELEGRAM_MAX_CAPTION,
    );
    expect(card.length).toBeLessThanOrEqual(TELEGRAM_MAX_CAPTION);
    expect(lines(card)[0]).toBe("💬 INSTAGRAM DM · Jane");
    expect(card).toContain("…”");
    expect(lines(card).at(-1)).toContain("Reply to this message");
  });
});

describe("labels and routing prefixes", () => {
  it("prefers name and handle, falls back per platform", () => {
    expect(customerLabel("instagram", { displayName: null, username: "@meilin" })).toBe("@meilin");
    expect(customerLabel("instagram", { displayName: null, username: null })).toBe("An Instagram user");
    expect(customerLabel("facebook", { displayName: "Ann Lee", username: "ignored" })).toBe("Ann Lee");
  });

  it("recognises every bot message about a conversation, and nothing else", () => {
    for (const header of Object.values(INBOX_CARD_HEADERS)) expect(isInboxBotText(`${header} · x`)).toBe(true);
    expect(isInboxBotText(renderSentNote("tiktok", { displayName: null, username: "sam" }, "Ivan"))).toBe(true);
    expect(isInboxBotText(renderEchoNote("instagram", "Yes we do", []))).toBe(true);
    expect(renderEchoNote("instagram", "Yes we do", [])).toBe(`${ECHO_NOTE_PREFIX}Instagram or Business Suite: “Yes we do”`);
    expect(isInboxBotText("⭐ GOOGLE MAPS REVIEW\n…")).toBe(false);
    expect(isInboxBotText("Enter quantity for IN – x")).toBe(false);
    expect(isInboxBotText(undefined)).toBe(false);
  });

  it("marks the preview card so a reply to it only checks access", () => {
    const card = inboxPreviewCard(new Date("2026-10-03T07:15:00Z"));
    expect(inboxPreviewPlatform(card.text)).toBe("instagram");
    expect(isInboxBotText(card.text)).toBe(true);
    expect(inboxPreviewPlatform(`${INBOX_CARD_HEADERS.instagram} · x`)).toBeNull();
  });
});
