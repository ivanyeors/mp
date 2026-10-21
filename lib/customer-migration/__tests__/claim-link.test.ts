import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CAMPAIGN_UTM_SOURCE,
  claimLinkUrl,
  generateClaimToken,
  hashClaimToken,
  isClaimTokenShape,
  mintClaimLink,
  openClaimLink,
  readClaimLinkRow,
  welcomePath,
  withCampaignUtm,
} from "@/lib/customer-migration/claim-link";

/**
 * The Claim link (migration slice 06): a 32-byte base64url token whose hash
 * alone is stored, a welcome URL with the campaign's UTMs, and the open that
 * records the click without ever signing anyone in.
 */

describe("the token", () => {
  it("is 32 random bytes, base64url, and fresh every time", () => {
    const a = generateClaimToken();
    const b = generateClaimToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(a, "base64url")).toHaveLength(32);
    expect(a).not.toBe(b);
    expect(isClaimTokenShape(a)).toBe(true);
  });

  it("is stored only as its SHA-256, hex", async () => {
    const token = generateClaimToken();
    expect(await hashClaimToken(token)).toBe(createHash("sha256").update(token).digest("hex"));
    expect(await hashClaimToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses anything that could not be a token", () => {
    for (const v of ["", "short", "A".repeat(42), "A".repeat(44), `${"A".repeat(42)}=`, `${"A".repeat(42)}/`, null, 7]) {
      expect(isClaimTokenShape(v)).toBe(false);
    }
  });
});

describe("the link", () => {
  it("is the localised welcome page with the token, and the campaign's UTMs", () => {
    const url = new URL(claimLinkUrl("T".repeat(43), "migration_announcement", { origin: "https://mpillow.test" }));
    expect(url.origin + url.pathname).toBe("https://mpillow.test/en-US/account/welcome");
    expect(url.searchParams.get("c")).toBe("T".repeat(43));
    expect(url.searchParams.get("utm_source")).toBe(CAMPAIGN_UTM_SOURCE);
    expect(url.searchParams.get("utm_source")).toBe("shopify_migration");
    expect(url.searchParams.get("utm_medium")).toBe("email");
    expect(url.searchParams.get("utm_campaign")).toBe("migration_announcement");
  });

  it("puts the UTMs on any campaign link, keeping its own parameters", () => {
    const url = new URL(withCampaignUtm("https://mpillow.test/zh-CN/shop?sort=new", "migration_reminder"));
    expect(url.searchParams.get("sort")).toBe("new");
    expect(url.searchParams.get("utm_campaign")).toBe("migration_reminder");
  });

  it("returns the sign-in form to the welcome page, without UTMs", () => {
    expect(welcomePath("en-US", "T".repeat(43))).toBe(`/en-US/account/welcome?c=${"T".repeat(43)}`);
    expect(welcomePath("zh-CN", null)).toBe("/zh-CN/account/welcome");
  });
});

describe("mintClaimLink", () => {
  it("writes the hash and the template, never the token, and returns the token for the one email", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const admin = { rpc } as unknown as SupabaseClient;
    const { token, url } = await mintClaimLink(admin, {
      customerId: "c1",
      template: "migration_announcement",
      origin: "https://mpillow.test",
    });
    expect(rpc).toHaveBeenCalledWith("mint_claim_link", {
      p_customer_id: "c1",
      p_token_hash: await hashClaimToken(token),
      p_template: "migration_announcement",
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(token);
    expect(url).toContain(`c=${token}`);
  });

  it("throws when the row cannot be written, so no email carries a dead link", async () => {
    const admin = {
      rpc: () => Promise.resolve({ data: null, error: { message: "boom" } }),
    } as unknown as SupabaseClient;
    await expect(mintClaimLink(admin, { customerId: "c1", template: "t" })).rejects.toThrow(/boom/);
  });
});

describe("openClaimLink", () => {
  const rpcAdmin = (result: unknown) => {
    const rpc = vi.fn().mockResolvedValue(result);
    return { admin: { rpc } as unknown as SupabaseClient, rpc };
  };

  it("records the click by hash and returns whose link it is", async () => {
    const token = generateClaimToken();
    const { admin, rpc } = rpcAdmin({
      data: [{ customer_id: "c1", first_name: " Jane ", email: "jane@x.test" }],
      error: null,
    });
    expect(await openClaimLink(admin, token, { count: true })).toEqual({
      customerId: "c1",
      firstName: "Jane",
      email: "jane@x.test",
    });
    expect(rpc).toHaveBeenCalledWith("open_claim_link", { p_token_hash: await hashClaimToken(token), p_count: true });
  });

  it("passes count: false for a signed-in visit", async () => {
    const { admin, rpc } = rpcAdmin({ data: [], error: null });
    await openClaimLink(admin, generateClaimToken(), { count: false });
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_count: false });
  });

  it("never looks up a malformed token", async () => {
    const { admin, rpc } = rpcAdmin({ data: [], error: null });
    expect(await openClaimLink(admin, "nope", { count: true })).toBeNull();
    expect(await openClaimLink(admin, null, { count: true })).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("is null for an unknown token, a failed read and a throw alike, and never logs the token", async () => {
    const token = generateClaimToken();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await openClaimLink(rpcAdmin({ data: [], error: null }).admin, token, { count: true })).toBeNull();
    expect(await openClaimLink(rpcAdmin({ data: null, error: { message: "down" } }).admin, token, { count: true })).toBeNull();
    const throwing = { rpc: () => Promise.reject(new Error("net")) } as unknown as SupabaseClient;
    expect(await openClaimLink(throwing, token, { count: true })).toBeNull();
    expect(JSON.stringify(error.mock.calls)).not.toContain(token);
    error.mockRestore();
  });

  it("reads a row without an email as no row", () => {
    expect(readClaimLinkRow([{ customer_id: "c1", first_name: "J", email: null }])).toBeNull();
    expect(readClaimLinkRow(null)).toBeNull();
  });
});
