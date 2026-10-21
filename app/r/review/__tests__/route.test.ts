import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashReviewToken } from "@/lib/aftercare/review-link";

/**
 * GET /r/review (CRM slice 07): every request is a 302 to the Google review
 * link, never an error page. A valid token records the click — the first one
 * stamped once, every one counted — and anything else records nothing.
 */

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  settings: [] as Row[],
  requests: [] as Row[],
  rpcCalls: 0,
  failSettings: false,
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      if (table !== "site_settings") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          in: async (_col: string, keys: string[]) =>
            h.failSettings
              ? { data: null, error: { message: "db down" } }
              : { data: h.settings.filter((r) => keys.includes(r.key as string)), error: null },
        }),
      };
    },
    // record_review_request_click, as the migration defines it.
    rpc: async (name: string, args: { p_token_hash: string }) => {
      if (name !== "record_review_request_click") return { data: null, error: { message: `no rpc ${name}` } };
      h.rpcCalls += 1;
      const row = h.requests.find((r) => r.token_hash === args.p_token_hash);
      if (!row) return { data: false, error: null };
      row.click_count = Number(row.click_count) + 1;
      row.first_clicked_at ??= new Date(Date.now() + h.rpcCalls).toISOString();
      return { data: true, error: null };
    },
  }),
}));

const { GET } = await import("../route");

const REVIEW_URL = "https://g.page/r/CfdGhvgB1hwUEBM/review";
const TOKEN = "Zx81kQpL0aVb3nRt7yUe2w";
const get = (query: string) => GET(new Request(`https://custom.mpillow.com/r/review${query}`));

beforeEach(() => {
  h.settings = [{ key: "google_review_url", value: REVIEW_URL }];
  h.requests = [
    { customer_id: "ann", token_hash: hashReviewToken(TOKEN), click_count: 0, first_clicked_at: null },
  ];
  h.rpcCalls = 0;
  h.failSettings = false;
});

describe("GET /r/review", () => {
  it("records a valid token's click once, counts every click, and redirects to Google", async () => {
    const first = await get(`?t=${TOKEN}`);
    expect(first.status).toBe(302);
    expect(first.headers.get("location")).toBe(REVIEW_URL);
    const firstAt = h.requests[0].first_clicked_at;
    expect(firstAt).toBeTruthy();
    expect(h.requests[0].click_count).toBe(1);

    await get(`?t=${TOKEN}`);
    await get(`?t=${TOKEN}`);
    expect(h.requests[0].click_count).toBe(3);
    expect(h.requests[0].first_clicked_at).toBe(firstAt);
  });

  it.each([
    ["an unknown token", "?t=AAAAAAAAAAAAAAAAAAAAAA"],
    ["a malformed token", "?t=<script>"],
    ["no token", ""],
    ["an empty token", "?t="],
  ])("sends %s to the same review link and records nothing", async (_label, query) => {
    const res = await get(query);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(REVIEW_URL);
    expect(h.requests[0]).toMatchObject({ click_count: 0, first_clicked_at: null });
  });

  it("never looks up a malformed token", async () => {
    await get("?t=not a token at all!");
    expect(h.rpcCalls).toBe(0);
  });

  it("is noindex, uncached, and sends no referrer to Google", async () => {
    const res = await get(`?t=${TOKEN}`);
    expect(res.headers.get("x-robots-tag")).toMatch(/noindex/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("goes to the home page, not an error, when no usable review link is set or settings cannot be read", async () => {
    h.settings = [{ key: "google_review_url", value: "http://not-https.example" }];
    const res = await get(`?t=${TOKEN}`);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://custom.mpillow.com/");
    h.failSettings = true;
    const down = await get(`?t=${TOKEN}`);
    expect(down.status).toBe(302);
  });
});
