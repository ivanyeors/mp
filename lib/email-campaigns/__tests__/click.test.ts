import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { UNSUBSCRIBE_PAGE, UNSUBSCRIBE_ROUTE } from "@/lib/marketing-consent/unsubscribe";
import {
  CLICK_PARAM,
  UNSUBSCRIBE_PATHS,
  addClickToken,
  hashClickToken,
  isClickTokenShape,
  newClickToken,
  recordCampaignClick,
  stripClickToken,
  withClickToken,
} from "../click";

const ORIGIN = "https://custom.mpillow.com";
const TOKEN = "A".repeat(43);

describe("the token", () => {
  it("is 32 random bytes, base64url, and different every time", () => {
    const a = newClickToken();
    const b = newClickToken();
    expect(isClickTokenShape(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(isClickTokenShape("short")).toBe(false);
    expect(isClickTokenShape(`${TOKEN}=`)).toBe(false);
    expect(isClickTokenShape(null)).toBe(false);
  });

  it("is stored only as its SHA-256, hex, as the SQL check expects", async () => {
    const hash = await hashClickToken(TOKEN);
    expect(hash).toBe(createHash("sha256").update(TOKEN).digest("hex"));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("withClickToken", () => {
  it("adds the token to a link to this site, keeping its UTMs", () => {
    const url = withClickToken(`${ORIGIN}/en-US/shop/fibrecool?utm_source=x&utm_medium=email`, TOKEN, ORIGIN);
    const u = new URL(url);
    expect(u.searchParams.get(CLICK_PARAM)).toBe(TOKEN);
    expect(u.searchParams.get("utm_source")).toBe("x");
  });

  it("leaves another site's link, the unsubscribe page and route, and a broken link alone", () => {
    for (const url of [
      "https://instagram.com/mpillow",
      `${ORIGIN}/en-US/unsubscribe?u=a&t=b`,
      `${ORIGIN}/zh-CN/unsubscribe?u=a&t=b`,
      `${ORIGIN}/unsubscribe`,
      `${ORIGIN}/api/email/unsubscribe?u=a&t=b`,
      "not a url",
    ]) {
      expect(withClickToken(url, TOKEN, ORIGIN)).toBe(url);
    }
  });

  it("knows the unsubscribe paths the module that makes them uses", () => {
    expect(UNSUBSCRIBE_PATHS).toEqual({ route: UNSUBSCRIBE_ROUTE, page: UNSUBSCRIBE_PAGE });
  });
});

describe("addClickToken", () => {
  it("tokens every site href in the HTML and every site address in the text, and nothing else", () => {
    const email = {
      subject: "Sleep cooler",
      html: [
        `<a href="${ORIGIN}/en-US/shop/a?utm_source=e&amp;utm_medium=email">Shop</a>`,
        `<a href="https://instagram.com/mpillow">IG</a>`,
        `<img src="${ORIGIN}/images/x.jpg">`,
        `<a href="${ORIGIN}/en-US/unsubscribe?u=1&amp;t=2">Unsubscribe</a>`,
      ].join(""),
      text: `Shop: ${ORIGIN}/en-US/shop/a?utm_source=e\nUnsubscribe: ${ORIGIN}/en-US/unsubscribe?u=1&t=2\nhttps://instagram.com/mpillow`,
    };
    const out = addClickToken(email, TOKEN, ORIGIN);
    expect(out.subject).toBe("Sleep cooler");
    expect(out.html).toContain(`href="${ORIGIN}/en-US/shop/a?utm_source=e&amp;utm_medium=email&amp;mc=${TOKEN}"`);
    expect(out.html).toContain('href="https://instagram.com/mpillow"');
    expect(out.html).toContain(`src="${ORIGIN}/images/x.jpg"`);
    expect(out.html).toContain(`href="${ORIGIN}/en-US/unsubscribe?u=1&amp;t=2"`);
    expect(out.html.match(/mc=/g)).toHaveLength(1);
    expect(out.text).toContain(`${ORIGIN}/en-US/shop/a?utm_source=e&mc=${TOKEN}`);
    expect(out.text).toContain(`${ORIGIN}/en-US/unsubscribe?u=1&t=2\n`);
    expect(out.text.match(/mc=/g)).toHaveLength(1);
  });
});

describe("stripClickToken", () => {
  it("takes the token off and keeps everything else", () => {
    const r = stripClickToken(new URL(`${ORIGIN}/en-US/shop/a?utm_source=e&mc=${TOKEN}&x=1#top`));
    expect(r?.token).toBe(TOKEN);
    expect(r?.cleanUrl.toString()).toBe(`${ORIGIN}/en-US/shop/a?utm_source=e&x=1#top`);
  });

  it("cleans a malformed token too, and is null without one", () => {
    expect(stripClickToken(new URL(`${ORIGIN}/?mc=bad`))?.cleanUrl.toString()).toBe(`${ORIGIN}/`);
    expect(stripClickToken(new URL(`${ORIGIN}/en-US/shop`))).toBeNull();
  });
});

describe("recordCampaignClick", () => {
  it("sends the hash, never the token, and says whether it counted", async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    const at = new Date("2026-10-31T04:00:00.000Z");
    expect(await recordCampaignClick({ rpc } as unknown as SupabaseClient, TOKEN, at)).toBe(true);
    expect(rpc).toHaveBeenCalledWith("record_campaign_click", { p_token_hash: await hashClickToken(TOKEN), p_at: at.toISOString() });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(TOKEN);
  });

  it("never looks up a malformed token, and never throws", async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    expect(await recordCampaignClick({ rpc } as unknown as SupabaseClient, "bad")).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failing = { rpc: vi.fn(async () => ({ data: null, error: { message: "down" } })) } as unknown as SupabaseClient;
    const throwing = { rpc: vi.fn(() => Promise.reject(new Error("network"))) } as unknown as SupabaseClient;
    expect(await recordCampaignClick(failing, TOKEN)).toBe(false);
    expect(await recordCampaignClick(throwing, TOKEN)).toBe(false);
    expect(JSON.stringify(error.mock.calls)).not.toContain(TOKEN);
    error.mockRestore();
  });
});
