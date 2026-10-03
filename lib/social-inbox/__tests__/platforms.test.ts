import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkOutgoingText, replyWindow } from "@/lib/social-inbox/platforms";
import { parseMetaWebhook, verifyMetaChallenge, verifyMetaSignature } from "@/lib/social-inbox/meta";
import { parseTikTokWebhook, verifyTikTokSignature } from "@/lib/social-inbox/tiktok";

/**
 * The platform edges, pure: who may be replied to when, what a webhook says
 * once normalised, and that only a correctly signed webhook gets in.
 */

const NOW = new Date("2026-10-03T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

afterEach(() => vi.unstubAllEnvs());

describe("replyWindow", () => {
  it("lets Meta replies through for 24 hours, untagged", () => {
    expect(replyWindow("instagram", hoursAgo(23.9), NOW, { humanAgent: false })).toEqual({ ok: true, tag: null });
    expect(replyWindow("facebook", hoursAgo(1), NOW, { humanAgent: true })).toEqual({ ok: true, tag: null });
  });

  it("uses Meta's Human Agent tag from 24 hours to 7 days, only when approved", () => {
    expect(replyWindow("instagram", hoursAgo(30), NOW, { humanAgent: true })).toEqual({ ok: true, tag: "HUMAN_AGENT" });
    const refused = replyWindow("instagram", hoursAgo(30), NOW, { humanAgent: false });
    expect(refused).toMatchObject({ ok: false });
    expect(refused.ok ? "" : refused.message).toContain("within 24 hours");
    expect(refused.ok ? "" : refused.message).toContain("the Instagram app");
    const tooOld = replyWindow("facebook", hoursAgo(24 * 8), NOW, { humanAgent: true });
    expect(tooOld.ok ? "" : tooOld.message).toContain("within 7 days");
  });

  it("gives TikTok 48 hours and never a tag", () => {
    expect(replyWindow("tiktok", hoursAgo(47), NOW, { humanAgent: true })).toEqual({ ok: true, tag: null });
    const refused = replyWindow("tiktok", hoursAgo(49), NOW, { humanAgent: true });
    expect(refused.ok ? "" : refused.message).toContain("within 48 hours");
  });

  it("refuses when the customer never wrote", () => {
    expect(replyWindow("facebook", null, NOW, { humanAgent: true }).ok).toBe(false);
  });
});

describe("checkOutgoingText", () => {
  it("holds Messenger to 2,000 characters and Instagram to 1,000 bytes", () => {
    expect(checkOutgoingText("facebook", "a".repeat(2000)).ok).toBe(true);
    expect(checkOutgoingText("facebook", "a".repeat(2001)).ok).toBe(false);
    expect(checkOutgoingText("instagram", "a".repeat(1000)).ok).toBe(true);
    // 300 emoji are 1,200 bytes.
    expect(checkOutgoingText("instagram", "😴".repeat(300)).ok).toBe(false);
    expect(checkOutgoingText("tiktok", "a".repeat(5000)).ok).toBe(true);
  });
});

describe("Meta webhooks", () => {
  const page = (messaging: unknown[], extra: Record<string, unknown> = {}) => ({
    object: "page",
    entry: [{ id: "PAGE1", time: 1, messaging, ...extra }],
  });

  it("normalises a Messenger message, keyed by the sender's PSID", () => {
    const events = parseMetaWebhook(
      page([{ sender: { id: "PSID1" }, recipient: { id: "PAGE1" }, timestamp: 1_790_000_000_000, message: { mid: "m.1", text: "Hi there" } }]),
    );
    expect(events).toEqual([
      {
        kind: "message",
        platform: "facebook",
        externalId: "PSID1",
        messageId: "m.1",
        text: "Hi there",
        attachments: [],
        sentAt: new Date(1_790_000_000_000).toISOString(),
      },
    ]);
  });

  it("reads Instagram photos, story replies, echoes and unsends", () => {
    const events = parseMetaWebhook({
      object: "instagram",
      entry: [
        {
          id: "IG1",
          messaging: [
            {
              sender: { id: "IGSID1" },
              recipient: { id: "IG1" },
              timestamp: 1,
              message: {
                mid: "ig.1",
                attachments: [{ type: "image", payload: { url: "https://cdn.example/p.jpg" } }],
                reply_to: { story: { url: "https://cdn.example/story.mp4", id: "s1" } },
              },
            },
            { sender: { id: "IG1" }, recipient: { id: "IGSID1" }, timestamp: 2, message: { mid: "ig.2", text: "Yes!", is_echo: true } },
            { sender: { id: "IGSID1" }, recipient: { id: "IG1" }, timestamp: 3, message: { mid: "ig.1", is_deleted: true } },
          ],
        },
      ],
    });
    expect(events.map((e) => [e.kind, e.platform, e.externalId, e.messageId])).toEqual([
      ["message", "instagram", "IGSID1", "ig.1"],
      ["echo", "instagram", "IGSID1", "ig.2"],
      ["unsend", "instagram", "IGSID1", "ig.1"],
    ]);
    expect(events[0]).toMatchObject({
      text: null,
      attachments: [
        { kind: "story_reply", url: "https://cdn.example/story.mp4" },
        { kind: "image", url: "https://cdn.example/p.jpg" },
      ],
    });
  });

  it("keeps standby messages and button taps, drops reads and other Pages", () => {
    const events = parseMetaWebhook(
      page(
        [
          { sender: { id: "PSID1" }, recipient: { id: "PAGE1" }, timestamp: 1, read: { watermark: 1 } },
          { sender: { id: "PSID1" }, recipient: { id: "PAGE1" }, timestamp: 2, postback: { mid: "pb.1", title: "Book a fitting" } },
        ],
        { standby: [{ sender: { id: "PSID2" }, recipient: { id: "PAGE1" }, timestamp: 3, message: { mid: "m.2", text: "hello?" } }] },
      ),
      { pageId: "PAGE1", instagramId: null },
    );
    expect(events.map((e) => (e.kind === "message" ? e.text : e.kind))).toEqual(["Book a fitting", "hello?"]);
    expect(parseMetaWebhook(page([{ sender: { id: "P" }, recipient: { id: "X" }, message: { mid: "m" } }]), { pageId: "OTHER", instagramId: null })).toEqual([]);
    expect(parseMetaWebhook({ object: "whatsapp_business_account", entry: [] })).toEqual([]);
  });

  it("accepts only the app secret's signature, and the verify token's handshake", () => {
    const body = JSON.stringify(page([]));
    const sig = `sha256=${createHmac("sha256", "app-secret").update(body).digest("hex")}`;
    expect(verifyMetaSignature(body, sig, "app-secret")).toBe(true);
    expect(verifyMetaSignature(`${body} `, sig, "app-secret")).toBe(false);
    expect(verifyMetaSignature(body, null, "app-secret")).toBe(false);

    vi.stubEnv("META_WEBHOOK_VERIFY_TOKEN", "verify-me");
    expect(verifyMetaChallenge({ mode: "subscribe", token: "verify-me", challenge: "42" })).toBe("42");
    expect(verifyMetaChallenge({ mode: "subscribe", token: "nope", challenge: "42" })).toBeNull();
  });

  it("fails closed in production without an app secret", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("META_APP_SECRET", "");
    expect(verifyMetaSignature("{}", "sha256=abc")).toBe(false);
  });
});

describe("TikTok webhooks", () => {
  const event = (name: string, content: Record<string, unknown>, openid = "BIZ") => ({
    event: name,
    user_openid: openid,
    content: JSON.stringify({ conversation_id: "conv-1", message_id: "tt-1", timestamp: 1_790_000_000_000, ...content }),
  });

  it("reads a customer's text, keyed by the conversation, with their handle", () => {
    const events = parseTikTokWebhook(
      event("im_receive_msg", { type: "text", text: { body: "price?" }, from: "sleepy.sam", from_user: { id: "U1" }, to_user: { id: "BIZ" } }),
      "BIZ",
    );
    expect(events).toEqual([
      {
        kind: "message",
        platform: "tiktok",
        externalId: "conv-1",
        messageId: "tt-1",
        text: "price?",
        attachments: [],
        sentAt: new Date(1_790_000_000_000).toISOString(),
        username: "sleepy.sam",
      },
    ]);
  });

  it("treats our own sends as echoes, images as app-only, and ignores other accounts", () => {
    expect(
      parseTikTokWebhook(event("im_send_msg", { type: "text", text: { body: "hi" }, from_user: { id: "BIZ" }, to_user: { id: "U1" } }), "BIZ")[0],
    ).toMatchObject({ kind: "echo", text: "hi" });
    expect(
      parseTikTokWebhook(event("im_receive_msg", { type: "image", image: { media_id: "m" }, to_user: { id: "BIZ" } }), "BIZ")[0],
    ).toMatchObject({ kind: "message", text: null, attachments: [{ kind: "image", url: null }] });
    expect(parseTikTokWebhook(event("im_receive_msg", { type: "text", text: { body: "x" } }, "SOMEONE-ELSE"), "BIZ")).toEqual([]);
    expect(parseTikTokWebhook({ event: "im_mark_read_msg", content: "{}" }, "BIZ")).toEqual([]);
  });

  it("checks the timestamped signature, and refuses replays older than TikTok's 72-hour retries", () => {
    const body = JSON.stringify(event("im_receive_msg", {}));
    const t = Math.floor(NOW.getTime() / 1000);
    const sign = (ts: number) => `t=${ts},s=${createHmac("sha256", "tt-secret").update(`${ts}.${body}`).digest("hex")}`;
    expect(verifyTikTokSignature(body, sign(t), NOW, "tt-secret")).toBe(true);
    expect(verifyTikTokSignature(body, sign(t - 71 * 3600), NOW, "tt-secret")).toBe(true);
    expect(verifyTikTokSignature(body, sign(t - 73 * 3600), NOW, "tt-secret")).toBe(false);
    expect(verifyTikTokSignature(body, sign(t).replace(/s=./, "s=0"), NOW, "tt-secret")).toBe(false);
    expect(verifyTikTokSignature(body, null, NOW, "tt-secret")).toBe(false);
  });
});
