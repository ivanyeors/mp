import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  campaignSendLimits,
  checkCampaignDomain,
  checkCampaignFrom,
  emailAddressOf,
  emailDomainOf,
  getCampaignTransport,
  RESEND_FREE_SEND_LIMITS,
  transactionalFromAddress,
} from "../campaign-transport";
import { getDefaultTransport, ResendTransport, resetTransportCache } from "../transport";

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

describe("checkCampaignDomain", () => {
  const resend = (domains: { name: string; status: string }[]) => ({ sendingDomains: async () => domains });
  const UNVERIFIED = '{"statusCode":403,"message":"The custom.mpillow.com domain is not verified. Please, add and verify your domain on https://resend.com/domains","name":"validation_error"}';

  it("passes a domain Resend has verified", async () => {
    expect(await checkCampaignDomain(resend([{ name: "hello.mpillow.com", status: "verified" }]), "hello.mpillow.com")).toEqual({
      ok: true,
      detail: "Resend has verified hello.mpillow.com",
    });
  });

  it("fails a From on a domain Resend does not have, and names the ones it has", async () => {
    const r = await checkCampaignDomain(resend([{ name: "hello.mpillow.com", status: "verified" }]), "custom.mpillow.com");
    expect(r.ok).toBe(false);
    expect(r.detail).toBe(
      "Resend has no domain custom.mpillow.com, so it refuses mail sent from it. It has hello.mpillow.com (verified). Set CAMPAIGN_EMAIL_FROM and CAMPAIGN_EMAIL_DOMAIN in Vercel to a verified domain and redeploy, or add custom.mpillow.com in Resend → Domains.",
    );
    expect((await checkCampaignDomain(resend([]), "custom.mpillow.com")).detail).toContain("It has no domains yet.");
  });

  it("does not take a verified parent domain for its subdomain", async () => {
    expect((await checkCampaignDomain(resend([{ name: "mpillow.com", status: "verified" }]), "hello.mpillow.com")).ok).toBe(false);
  });

  it.each(["not_started", "pending", "failed"])("fails a domain Resend holds as %s", async (status) => {
    const r = await checkCampaignDomain(resend([{ name: "hello.mpillow.com", status }]), "hello.mpillow.com");
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/^hello\.mpillow\.com is in Resend but not verified \(.+\), so Resend refuses mail sent from it\. Add the DNS records/);
  });

  it("does not hold a send on a status that may still send, and says to look", async () => {
    const r = await checkCampaignDomain(resend([{ name: "hello.mpillow.com", status: "temporary_failure" }]), "hello.mpillow.com");
    expect(r).toEqual({ ok: true, detail: "Resend reports hello.mpillow.com as temporary failure: look at Resend → Domains if a test does not arrive" });
  });

  it("does not hold a send when Resend will not answer, and says it was not checked", async () => {
    const sendOnly = { sendingDomains: async () => { throw new Error("Resend domains failed (401): restricted_api_key: This API key is restricted to only send emails"); } };
    expect(await checkCampaignDomain(sendOnly, "hello.mpillow.com")).toEqual({
      ok: true,
      detail: "not checked: the Resend key can only send, so Resend will not say whether hello.mpillow.com is verified. A test send shows it.",
    });
    const down = { sendingDomains: async () => { throw new Error("fetch failed"); } };
    expect((await checkCampaignDomain(down, "hello.mpillow.com")).detail).toMatch(/^not checked: Resend did not say .+ \(fetch failed\)/);
    expect((await checkCampaignDomain({}, "hello.mpillow.com")).ok).toBe(true);
  });

  describe("through Resend", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("asks Resend for its domains with the campaign key", async () => {
      const fetchMock = vi.fn(async () =>
        Response.json({ object: "list", has_more: false, data: [{ id: "d1", name: "Hello.Mpillow.com", status: "verified", region: "ap-northeast-1" }, { id: "d2" }] }),
      );
      vi.stubGlobal("fetch", fetchMock);
      expect(await new ResendTransport("re_campaign_key").sendingDomains()).toEqual([{ name: "hello.mpillow.com", status: "verified" }]);
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("https://api.resend.com/domains");
      expect(init.method ?? "GET").toBe("GET");
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_campaign_key");
    });

    it("says why Resend refused, in its words and without the JSON", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => new Response('{"statusCode":401,"message":"This API key is restricted to only send emails","name":"restricted_api_key"}', { status: 401 })));
      await expect(new ResendTransport("re_k").sendingDomains()).rejects.toThrow(
        "Resend domains failed (401): restricted_api_key: This API key is restricted to only send emails",
      );
      vi.stubGlobal("fetch", vi.fn(async () => new Response(UNVERIFIED, { status: 403 })));
      await expect(new ResendTransport("re_k").send({ to: "a@x.test", from: "hello@custom.mpillow.com", subject: "s", html: "<p>h</p>", text: "h" })).rejects.toThrow(
        "Resend send failed (403): validation_error: The custom.mpillow.com domain is not verified. Please, add and verify your domain on https://resend.com/domains",
      );
      vi.stubGlobal("fetch", vi.fn(async () => new Response("Bad gateway", { status: 502 })));
      await expect(new ResendTransport("re_k").send({ to: "a@x.test", from: "hello@hello.mpillow.com", subject: "s", html: "<p>h</p>", text: "h" })).rejects.toThrow(
        "Resend send failed (502): Bad gateway",
      );
    });
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

describe("campaignSendLimits", () => {
  it("is Resend's free plan unless the plan's limits are set", () => {
    expect(RESEND_FREE_SEND_LIMITS).toEqual({ daily: 100, monthly: 3000 });
    expect(campaignSendLimits({})).toEqual(RESEND_FREE_SEND_LIMITS);
    expect(campaignSendLimits({ CAMPAIGN_DAILY_SEND_LIMIT: " ", CAMPAIGN_MONTHLY_SEND_LIMIT: "" })).toEqual(RESEND_FREE_SEND_LIMITS);
    expect(campaignSendLimits({ CAMPAIGN_DAILY_SEND_LIMIT: "80" })).toEqual({ daily: 80, monthly: 3000 });
    expect(campaignSendLimits({ CAMPAIGN_DAILY_SEND_LIMIT: "5000", CAMPAIGN_MONTHLY_SEND_LIMIT: "50000" })).toEqual({
      daily: 5000,
      monthly: 50000,
    });
  });

  it("refuses a limit that is not a whole number of emails", () => {
    for (const bad of ["0", "-1", "1.5", "100/day", "lots"]) {
      expect(() => campaignSendLimits({ CAMPAIGN_DAILY_SEND_LIMIT: bad })).toThrow(/CAMPAIGN_DAILY_SEND_LIMIT must be a whole number/);
    }
    expect(() => campaignSendLimits({ CAMPAIGN_MONTHLY_SEND_LIMIT: "0" })).toThrow(/CAMPAIGN_MONTHLY_SEND_LIMIT/);
  });
});
