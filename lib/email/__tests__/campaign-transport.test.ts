import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkCampaignFrom,
  emailAddressOf,
  emailDomainOf,
  getCampaignTransport,
  transactionalFromAddress,
} from "../campaign-transport";
import { getDefaultTransport, resetTransportCache } from "../transport";

/**
 * Campaign mail never goes through the mailbox that sends order email
 * (migration slice 08; ADR 0029 i). The campaign's Resend key is
 * CAMPAIGN_RESEND_API_KEY, and the app's own transport never reads it: a key
 * named RESEND_API_KEY would have moved every order email to Resend.
 */

const PROVIDER_ENV = [
  "EMAIL_PROVIDER",
  "RESEND_API_KEY",
  "GMAIL_CLIENT_EMAIL",
  "GMAIL_PRIVATE_KEY",
  "GMAIL_SENDER",
  "CAMPAIGN_RESEND_API_KEY",
  "CAMPAIGN_EMAIL_FROM",
  "CAMPAIGN_EMAIL_DOMAIN",
];

beforeEach(() => {
  for (const name of PROVIDER_ENV) vi.stubEnv(name, "");
  resetTransportCache();
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetTransportCache();
});

describe("getDefaultTransport ignores the campaign's key", () => {
  it("stays on the console with only the campaign key set", () => {
    vi.stubEnv("CAMPAIGN_RESEND_API_KEY", "re_campaign_key");
    expect(getDefaultTransport().name).toBe("console");
  });

  it("stays on Gmail, the order mailbox, with the campaign key set beside it", () => {
    vi.stubEnv("CAMPAIGN_RESEND_API_KEY", "re_campaign_key");
    vi.stubEnv("GMAIL_CLIENT_EMAIL", "svc@project.iam.gserviceaccount.com");
    vi.stubEnv("GMAIL_PRIVATE_KEY", "-----BEGIN PRIVATE KEY-----\\nx\\n-----END PRIVATE KEY-----");
    vi.stubEnv("GMAIL_SENDER", "orders@mpillow.com");
    expect(getDefaultTransport().name).toBe("gmail");
  });

  it("with EMAIL_PROVIDER=gmail, as production sets it, even if RESEND_API_KEY appears", () => {
    vi.stubEnv("EMAIL_PROVIDER", "gmail");
    vi.stubEnv("RESEND_API_KEY", "re_someone_elses_key");
    vi.stubEnv("GMAIL_CLIENT_EMAIL", "svc@project.iam.gserviceaccount.com");
    vi.stubEnv("GMAIL_PRIVATE_KEY", "-----BEGIN PRIVATE KEY-----\\nx\\n-----END PRIVATE KEY-----");
    vi.stubEnv("GMAIL_SENDER", "orders@mpillow.com");
    expect(getDefaultTransport().name).toBe("gmail");
  });
});

describe("getCampaignTransport", () => {
  it("is Resend from CAMPAIGN_RESEND_API_KEY, and a separate instance from the app's", () => {
    vi.stubEnv("CAMPAIGN_RESEND_API_KEY", "re_campaign_key");
    const campaign = getCampaignTransport();
    expect(campaign?.name).toBe("resend");
    expect(campaign).not.toBe(getDefaultTransport());
  });

  it("is none without the key (owner decision 4), and never falls back to the order mailbox", () => {
    vi.stubEnv("RESEND_API_KEY", "re_order_key");
    vi.stubEnv("GMAIL_SENDER", "orders@mpillow.com");
    expect(getCampaignTransport()).toBeNull();
  });

  it("sends with the campaign's key", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "re_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const t = getCampaignTransport({ CAMPAIGN_RESEND_API_KEY: "re_campaign_key", RESEND_API_KEY: "re_order_key" })!;
    await t.send({ to: "a@x.test", from: "hello@hello.mpillow.com", subject: "s", html: "<p>h</p>", text: "hello there" });
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_campaign_key");
    vi.unstubAllGlobals();
  });
});

describe("checkCampaignFrom", () => {
  const ok = { from: "Mpillow <hello@hello.mpillow.com>", domain: "hello.mpillow.com", orderFrom: "orders@mpillow.com" };

  it("accepts an address on exactly the campaign subdomain", () => {
    expect(checkCampaignFrom(ok)).toEqual({ ok: true, from: "Mpillow <hello@hello.mpillow.com>", domain: "hello.mpillow.com" });
    expect(checkCampaignFrom({ ...ok, from: "HELLO@Hello.Mpillow.com", domain: "Hello.mpillow.com." }).ok).toBe(true);
  });

  it.each([
    [{ ...ok, from: "hello@mpillow.com" }, /not the campaign subdomain/],
    [{ ...ok, from: "hello@news.hello.mpillow.com" }, /not the campaign subdomain/],
    [{ ...ok, from: "Mpillow <sg@gmail.com>" }, /not the campaign subdomain/],
    [{ ...ok, from: "" }, /CAMPAIGN_EMAIL_FROM is not set/],
    [{ ...ok, from: "not an address" }, /not an email address/],
    [{ ...ok, domain: "" }, /CAMPAIGN_EMAIL_DOMAIN .* is not set/],
    [{ ...ok, domain: "mpillow.com", from: "hello@mpillow.com" }, /not a subdomain/],
    [{ ...ok, domain: "x.resend.dev", from: "a@x.resend.dev" }, /Resend's test domain/],
    [{ ...ok, orderFrom: "Orders <orders@hello.mpillow.com>" }, /the domain order email is sent from/],
  ])("refuses %o", (input, reason) => {
    const r = checkCampaignFrom(input);
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.reason).toMatch(reason);
  });
});

describe("address helpers", () => {
  it("read the bare address and its domain", () => {
    expect(emailAddressOf("Mpillow Support <Support@Mpillow.com>")).toBe("support@mpillow.com");
    expect(emailAddressOf("a@b.co")).toBe("a@b.co");
    expect(emailAddressOf("nope")).toBeNull();
    expect(emailDomainOf("x <a@hello.mpillow.com>")).toBe("hello.mpillow.com");
  });

  it("find the order mailbox the way getDefaultFromAddress does", () => {
    expect(transactionalFromAddress({ EMAIL_FROM: "a@x.com", GMAIL_SENDER: "b@x.com" })).toBe("a@x.com");
    expect(transactionalFromAddress({ GMAIL_SENDER: "b@x.com" })).toBe("b@x.com");
    expect(transactionalFromAddress({})).toBeNull();
  });
});
