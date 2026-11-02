import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type Row } from "@/lib/reviews/__tests__/fake-supabase";

/**
 * TikTok's access token lasts a day and every refresh rotates the refresh
 * token. A fresh token is used as is; an expiring one is refreshed and the new
 * pair stored; a failed refresh never throws away a token that still works.
 */

const h = vi.hoisted(() => ({ db: null as unknown, tables: {} as Record<string, Record<string, unknown>[]> }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => h.db }));

const { disconnectTikTok, sendTikTokText, tiktokAccess } = await import("@/lib/social-inbox/tiktok");
const { sendToCustomer } = await import("@/lib/social-inbox/send");

const NOW = new Date("2026-10-03T12:00:00Z");
const inHours = (n: number) => new Date(NOW.getTime() + n * 3_600_000).toISOString();
const row = () => h.tables.social_channel_tokens[0] as Row;

function tiktokReply(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

beforeEach(() => {
  vi.stubEnv("TIKTOK_APP_ID", "app");
  vi.stubEnv("TIKTOK_APP_SECRET", "secret");
  h.tables = {
    social_channel_tokens: [
      {
        platform: "tiktok",
        account_id: "BIZ",
        account_name: "@mpillow",
        access_token: "access-1",
        access_expires_at: inHours(6),
        refresh_token: "refresh-1",
        refresh_expires_at: inHours(24 * 300),
        connected_by: "sg@mpillow.com",
        last_error: null,
      },
    ],
  };
  h.db = createFakeSupabase(h.tables);
});

describe("tiktokAccess", () => {
  it("uses a token that is still fresh without calling TikTok", async () => {
    const fetch = tiktokReply({});
    expect(await tiktokAccess({ now: NOW, fetch })).toEqual({ ok: true, businessId: "BIZ", token: "access-1" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refreshes an expiring token and stores the rotated pair", async () => {
    row().access_expires_at = inHours(0.05);
    const fetch = tiktokReply({
      code: 0,
      data: { access_token: "access-2", refresh_token: "refresh-2", expires_in: 86_400, refresh_token_expires_in: 31_536_000 },
    });
    expect(await tiktokAccess({ now: NOW, fetch })).toEqual({ ok: true, businessId: "BIZ", token: "access-2" });
    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("https://business-api.tiktok.com/open_api/v1.3/tt_user/oauth2/refresh_token/");
    expect(JSON.parse(String(init.body))).toEqual({
      client_id: "app",
      client_secret: "secret",
      grant_type: "refresh_token",
      refresh_token: "refresh-1",
    });
    expect(row()).toMatchObject({ access_token: "access-2", refresh_token: "refresh-2", access_expires_at: inHours(24) });
  });

  it("keeps a working token when a forced refresh fails, and records why", async () => {
    const fetch = tiktokReply({ code: 40104, message: "refresh_token is invalid" });
    expect(await tiktokAccess({ now: NOW, force: true, fetch })).toEqual({ ok: true, businessId: "BIZ", token: "access-1" });
    expect(row().last_error).toBe("refresh_token is invalid (40104)");
  });

  it("asks for a reconnect once the refresh token has expired, or before anyone connected", async () => {
    row().access_expires_at = inHours(-1);
    row().refresh_expires_at = inHours(-1);
    const expired = await tiktokAccess({ now: NOW, fetch: tiktokReply({}) });
    expect(expired).toMatchObject({ ok: false, error: expect.stringContaining("connect TikTok again") });

    h.tables.social_channel_tokens = [];
    const none = await tiktokAccess({ now: NOW });
    expect(none).toMatchObject({ ok: false, error: expect.stringContaining("isn't connected yet") });
  });
});

describe("sending on TikTok", () => {
  it("retries once with a refreshed token when TikTok says the token is no longer valid", async () => {
    const replies = [
      { code: 40105, message: "Access token is invalid" },
      { code: 0, data: { access_token: "access-2", refresh_token: "refresh-2", expires_in: 86_400, refresh_token_expires_in: 31_536_000 } },
      { code: 0, data: { message: { message_id: "tt-out-1" } } },
    ];
    const fetch = vi.fn(async () => new Response(JSON.stringify(replies.shift()), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    // The send path reads the real clock: a token that is fresh right now.
    row().access_expires_at = new Date(Date.now() + 6 * 3_600_000).toISOString();

    const sent = await sendToCustomer({ platform: "tiktok", external_id: "conv-1" }, "Size M is in stock", null);
    expect(sent).toEqual({ ok: true, messageId: "tt-out-1" });
    const calls = fetch.mock.calls as unknown as [URL, RequestInit][];
    expect(calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
      "/open_api/v1.3/business/message/send/",
      "/open_api/v1.3/tt_user/oauth2/refresh_token/",
      "/open_api/v1.3/business/message/send/",
    ]);
    expect((calls[2][1].headers as Record<string, string>)["Access-Token"]).toBe("access-2");
    expect(JSON.parse(String(calls[2][1].body))).toMatchObject({ recipient_type: "CONVERSATION", recipient: "conv-1", text: { body: "Size M is in stock" } });
  });

  it("explains TikTok's messaging limit in words", async () => {
    const fetch = tiktokReply({ code: 40064, message: "The message is blocked due to limitation of direct message rules" });
    const sent = await sendTikTokText("BIZ", "access-1", "conv-1", "hello", { fetch });
    expect(sent).toMatchObject({ ok: false, code: 40064, error: expect.stringContaining("reopens when the customer writes again") });
  });
});

describe("disconnectTikTok", () => {
  beforeEach(() => {
    // Disconnect reads the real clock: a token that is fresh right now.
    row().access_expires_at = new Date(Date.now() + 6 * 3_600_000).toISOString();
    h.tables.social_conversations = [
      { id: "c-tt", platform: "tiktok" },
      { id: "c-ig", platform: "instagram" },
    ];
    h.tables.social_messages = [
      { id: "m-tt", conversation_id: "c-tt", platform: "tiktok" },
      { id: "m-ig", conversation_id: "c-ig", platform: "instagram" },
    ];
  });

  it("revokes the token with TikTok and deletes every TikTok message, conversation and token", async () => {
    const fetch = tiktokReply({ code: 0, data: {} });
    expect(await disconnectTikTok({ fetch })).toMatchObject({ revokeError: null });

    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("https://business-api.tiktok.com/open_api/v1.3/tt_user/oauth2/revoke/");
    expect(JSON.parse(String(init.body))).toEqual({ client_id: "app", client_secret: "secret", access_token: "access-1" });
    expect(h.tables.social_channel_tokens).toEqual([]);
    expect(h.tables.social_conversations.map((r) => r.id)).toEqual(["c-ig"]);
    expect(h.tables.social_messages.map((r) => r.id)).toEqual(["m-ig"]);
  });

  it("still deletes everything when TikTok refuses the revoke, and says why", async () => {
    const fetch = tiktokReply({ code: 40105, message: "Access token is invalid" });
    expect(await disconnectTikTok({ fetch })).toMatchObject({ revokeError: "Access token is invalid (40105)" });
    expect(h.tables.social_channel_tokens).toEqual([]);
    expect(h.tables.social_messages.map((r) => r.id)).toEqual(["m-ig"]);
  });
});
