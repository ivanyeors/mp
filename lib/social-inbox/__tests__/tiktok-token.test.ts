import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type Row } from "@/lib/reviews/__tests__/fake-supabase";

/**
 * TikTok's access token lasts a day and every refresh rotates the refresh
 * token. A fresh token is used as is; an expiring one is refreshed and the new
 * pair stored; a failed refresh never throws away a token that still works.
 */

const h = vi.hoisted(() => ({ db: null as unknown, tables: {} as Record<string, Record<string, unknown>[]> }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => h.db }));

const { tiktokAccess } = await import("@/lib/social-inbox/tiktok");

const NOW = new Date("2026-10-03T12:00:00Z");
const inHours = (n: number) => new Date(NOW.getTime() + n * 3_600_000).toISOString();
const row = () => h.tables.social_channel_tokens[0] as Row;

function tiktokReply(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

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
