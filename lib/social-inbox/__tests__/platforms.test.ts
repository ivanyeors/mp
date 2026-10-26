import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkOutgoingText, replyWindow } from "@/lib/social-inbox/platforms";
import {
  checkMetaSetup,
  connectMetaWebhooks,
  parseMetaWebhook,
  verifyMetaChallenge,
  verifyMetaSignature,
} from "@/lib/social-inbox/meta";
import { parseTikTokWebhook, tiktokAuthorizeUrl, verifyTikTokSignature } from "@/lib/social-inbox/tiktok";

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

  it("leaves TikTok's limit to TikTok, which counts messages rather than hours, and never tags", () => {
    expect(replyWindow("tiktok", hoursAgo(47), NOW, { humanAgent: true })).toEqual({ ok: true, tag: null });
    expect(replyWindow("tiktok", hoursAgo(24 * 30), NOW, { humanAgent: false })).toEqual({ ok: true, tag: null });
  });

  it("refuses when the customer never wrote — no platform lets a business start the chat", () => {
    expect(replyWindow("facebook", null, NOW, { humanAgent: true }).ok).toBe(false);
    expect(replyWindow("tiktok", null, NOW, { humanAgent: true }).ok).toBe(false);
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

describe("Meta setup", () => {
  const URL_OK = "https://custom.mpillow.com/api/webhooks/meta-messages";

  /** A Graph API stand-in: answers by method and path, records every call. */
  function graph(overrides: Record<string, unknown> = {}) {
    const calls: { method: string; path: string; query: URLSearchParams; form: URLSearchParams | null }[] = [];
    const answers: Record<string, unknown> = {
      "GET /me": { id: "PAGE1", name: "Mpillow", instagram_business_account: { id: "IG1", username: "thempillow" } },
      "GET /app": { id: "APP1", name: "Mpillow" },
      "GET /APP1/subscriptions": {
        data: [
          { object: "whatsapp_business_account", callback_url: "https://custom.mpillow.com/api/webhooks/whatsapp", active: true, fields: [] },
          {
            object: "page",
            callback_url: URL_OK,
            active: true,
            fields: [{ name: "messages" }, { name: "message_echoes" }, { name: "messaging_postbacks" }],
          },
          { object: "instagram", callback_url: URL_OK, active: true, fields: [{ name: "messages" }, { name: "messaging_postbacks" }] },
        ],
      },
      "GET /PAGE1/subscribed_apps": {
        data: [{ id: "APP1", name: "Mpillow", subscribed_fields: ["messages", "message_echoes", "messaging_postbacks"] }],
      },
      "POST /APP1/subscriptions": { success: true },
      "POST /PAGE1/subscribed_apps": { success: true },
      ...overrides,
    };
    const fetch = (async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";
      const path = url.pathname.replace(/^\/v[\d.]+/, "");
      calls.push({ method, path, query: url.searchParams, form: init?.body ? new URLSearchParams(String(init.body)) : null });
      const answer = answers[`${method} ${path}`] ?? { error: { message: `unexpected ${method} ${path}`, code: 100 } };
      return new Response(JSON.stringify(answer), { status: (answer as { error?: unknown }).error ? 400 : 200 });
    }) as typeof globalThis.fetch;
    return { fetch, calls };
  }

  function env() {
    vi.stubEnv("META_PAGE_ACCESS_TOKEN", "page-token");
    vi.stubEnv("META_APP_SECRET", "app-secret");
    vi.stubEnv("META_WEBHOOK_VERIFY_TOKEN", "verify-me");
    vi.stubEnv("META_PAGE_ID", "");
    vi.stubEnv("INSTAGRAM_ACCOUNT_ID", "");
  }

  it("is silent without a Page token, and all clear once Meta is set up", async () => {
    vi.stubEnv("META_PAGE_ACCESS_TOKEN", "");
    expect(await checkMetaSetup(URL_OK, graph())).toBeNull();

    env();
    const { fetch, calls } = graph();
    expect(await checkMetaSetup(URL_OK, { fetch })).toEqual({
      ok: true,
      page: { id: "PAGE1", name: "Mpillow" },
      instagram: { id: "IG1", username: "thempillow" },
      problems: [],
    });
    // Page calls carry appsecret_proof; the app's own webhooks are read with its app token.
    expect(calls.find((c) => c.path === "/me")?.query.get("appsecret_proof")).toBeTruthy();
    expect(calls.find((c) => c.path === "/APP1/subscriptions")?.query.get("access_token")).toBe("APP1|app-secret");
  });

  it("names what still keeps messages away", async () => {
    env();
    vi.stubEnv("META_PAGE_ID", "OLDPAGE");
    const setup = await checkMetaSetup(
      URL_OK,
      graph({
        "GET /APP1/subscriptions": {
          data: [{ object: "page", callback_url: "https://old.example.com/hook", active: true, fields: [{ name: "messages" }] }],
        },
        "GET /PAGE1/subscribed_apps": { data: [{ id: "OTHERAPP", subscribed_fields: ["messages"] }] },
      }),
    );
    expect(setup?.ok && setup.problems).toEqual([
      "META_PAGE_ID is OLDPAGE, but the token is for Page PAGE1 — every Facebook message is ignored.",
      `Meta sends Facebook messages to https://old.example.com/hook, not ${URL_OK}.`,
      "Meta doesn't send Instagram messages to the site yet.",
      "The Page doesn't pass its messages to the app yet.",
    ]);
  });

  it("explains a token or app secret that doesn't fit", async () => {
    env();
    const wrongSecret = await checkMetaSetup(
      URL_OK,
      graph({ "GET /me": { error: { message: "Invalid appsecret_proof provided in the API argument", code: 100 } } }),
    );
    expect(wrongSecret).toMatchObject({ ok: false, error: expect.stringContaining("Set META_APP_SECRET") });

    const userToken = await checkMetaSetup(
      URL_OK,
      graph({ "GET /me": { error: { message: "(#100) Tried accessing nonexisting field (instagram_business_account) on node type (User)", code: 100 } } }),
    );
    expect(userToken).toMatchObject({ ok: false, error: expect.stringContaining("not the Page's own token") });
  });

  it("falls back to the WhatsApp app's secret", async () => {
    env();
    vi.stubEnv("META_APP_SECRET", "");
    vi.stubEnv("WHATSAPP_APP_SECRET", "whatsapp-secret");
    const body = "{}";
    const sig = `sha256=${createHmac("sha256", "whatsapp-secret").update(body).digest("hex")}`;
    expect(verifyMetaSignature(body, sig)).toBe(true);
    const { fetch, calls } = graph();
    await checkMetaSetup(URL_OK, { fetch });
    expect(calls.find((c) => c.path === "/APP1/subscriptions")?.query.get("access_token")).toBe("APP1|whatsapp-secret");
  });

  it("connects Facebook first, then the Page, then Instagram", async () => {
    env();
    const { fetch, calls } = graph();
    expect(await connectMetaWebhooks(URL_OK, { fetch })).toEqual({ ok: true });
    const posts = calls.filter((c) => c.method === "POST");
    expect(posts.map((c) => [c.path, c.form?.get("object") ?? c.query.get("subscribed_fields")])).toEqual([
      ["/APP1/subscriptions", "page"],
      ["/PAGE1/subscribed_apps", "messages,message_echoes,messaging_postbacks"],
      ["/APP1/subscriptions", "instagram"],
    ]);
    expect(Object.fromEntries(posts[0].form ?? [])).toEqual({
      object: "page",
      callback_url: URL_OK,
      fields: "messages,message_echoes,messaging_postbacks",
      verify_token: "verify-me",
    });
    expect(posts[2].form?.get("fields")).toBe("messages,messaging_postbacks");
  });

  it("stops at the first refusal, and won't start without a verify token", async () => {
    env();
    const refused = graph({ "POST /APP1/subscriptions": { error: { message: "(#2200) callback verification failed", code: 2200 } } });
    expect(await connectMetaWebhooks(URL_OK, refused)).toEqual({
      ok: false,
      error: "Facebook webhook: (#2200) callback verification failed (#2200)",
    });
    expect(refused.calls.filter((c) => c.method === "POST")).toHaveLength(1);

    vi.stubEnv("META_WEBHOOK_VERIFY_TOKEN", "");
    const untouched = graph();
    expect(await connectMetaWebhooks(URL_OK, untouched)).toEqual({
      ok: false,
      error: "META_WEBHOOK_VERIFY_TOKEN is not set on this deployment.",
    });
    expect(untouched.calls).toHaveLength(0);
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

  it("drops reactions, TikTok's automatic messages and EU/UK placeholders; names videos and emoji", () => {
    const reaction = { type: "reaction", reaction: [{ operation: "ADD", type: "EMOJI", emoji: "❤️" }], to_user: { id: "BIZ" } };
    expect(parseTikTokWebhook(event("im_receive_msg", reaction), "BIZ")).toEqual([]);
    const welcome = { type: "text", text: { body: "Hi! Thanks for reaching out" }, auto_message_type: "WELCOME_MESSAGE" };
    expect(parseTikTokWebhook(event("im_send_msg", { ...welcome, from_user: { id: "BIZ" }, to_user: { id: "U1" } }), "BIZ")).toEqual([]);
    expect(
      parseTikTokWebhook({ event: "im_receive_msg_eu", user_openid: "BIZ", content: JSON.stringify({ to_user: { id: "BIZ" } }) }, "BIZ"),
    ).toEqual([]);
    expect(
      parseTikTokWebhook(event("im_receive_msg", { type: "video", video: { media_id: "v" }, to_user: { id: "BIZ" } }), "BIZ")[0],
    ).toMatchObject({ attachments: [{ kind: "video", url: null }] });
    expect(
      parseTikTokWebhook(event("im_receive_msg", { type: "emoji", emoji: { url: "https://x" }, to_user: { id: "BIZ" } }), "BIZ")[0],
    ).toMatchObject({ attachments: [{ kind: "sticker" }] });
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

  it("accepts a signature over the body re-serialised, as TikTok's sample computes it", () => {
    const compact = JSON.stringify(event("im_receive_msg", {}));
    const spaced = JSON.stringify(JSON.parse(compact), null, 2);
    const t = Math.floor(NOW.getTime() / 1000);
    const header = `t=${t},s=${createHmac("sha256", "tt-secret").update(`${t}.${compact}`).digest("hex")}`;
    expect(verifyTikTokSignature(spaced, header, NOW, "tt-secret")).toBe(true);
    expect(verifyTikTokSignature(`${spaced} `.replace("conv-1", "conv-2"), header, NOW, "tt-secret")).toBe(false);
  });

  it("asks for every Business Messaging permission and always for a fresh code", () => {
    vi.stubEnv("TIKTOK_APP_ID", "app-1");
    vi.stubEnv("TIKTOK_APP_SECRET", "s");
    const url = new URL(tiktokAuthorizeUrl("st", "https://custom.mpillow.com/api/social-inbox/tiktok/callback/") ?? "");
    expect(url.origin + url.pathname).toBe("https://www.tiktok.com/v2/auth/authorize");
    expect(url.searchParams.get("client_key")).toBe("app-1");
    expect(url.searchParams.get("scope")?.split(",")).toEqual(
      expect.arrayContaining(["user.account.type", "message.list.read", "message.list.send", "message.list.manage"]),
    );
    expect(url.searchParams.get("redirect_uri")).toBe("https://custom.mpillow.com/api/social-inbox/tiktok/callback/");
    expect(url.searchParams.get("disable_auto_auth")).toBe("1");
  });
});
