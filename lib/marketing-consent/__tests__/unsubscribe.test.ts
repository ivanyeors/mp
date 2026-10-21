import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  INVALID_LINK,
  NOT_CONFIGURED,
  UNSUBSCRIBE_ROUTE,
  listUnsubscribeHeaders,
  probeUnsubscribeRoute,
  unsubscribeLinks,
  unsubscribeToken,
  verifyUnsubscribeToken,
} from "@/lib/marketing-consent/unsubscribe";
import { describeConsent, marketingEmailState } from "@/lib/marketing-consent/state";

/**
 * One-click unsubscribe (migration slice 07): a stateless token that never
 * expires, the two links built from it, the RFC 8058 headers, and the probe a
 * campaign sender runs before it sends anything (README, first hazard).
 */

const SECRET = "test-unsubscribe-secret";
const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("unsubscribeToken", () => {
  it("is HMAC-SHA256 of the Customer id under UNSUBSCRIBE_SECRET, base64url", () => {
    const expected = createHmac("sha256", SECRET).update(ID).digest("base64url");
    expect(unsubscribeToken(ID, SECRET)).toBe(expected);
    expect(expected).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("is stable: the same Customer always gets the same link, so it never expires", () => {
    expect(unsubscribeToken(ID, SECRET)).toBe(unsubscribeToken(ID.toUpperCase(), SECRET));
  });

  it("is none without a secret, or for something that is not a Customer id", () => {
    expect(unsubscribeToken(ID, undefined)).toBeNull();
    expect(unsubscribeToken(ID, "")).toBeNull();
    expect(unsubscribeToken("not-a-uuid", SECRET)).toBeNull();
  });
});

describe("verifyUnsubscribeToken", () => {
  const token = unsubscribeToken(ID, SECRET)!;

  it("accepts the Customer's own token", () => {
    expect(verifyUnsubscribeToken(ID, token, SECRET)).toBe(true);
  });

  it("refuses another Customer's token, a changed token, or another secret", () => {
    const other = "1f8fad5b-d9cb-469f-a165-70867728950e";
    const changed = token.replace(/.$/, (c) => (c === "A" ? "B" : "A"));
    expect(verifyUnsubscribeToken(other, token, SECRET)).toBe(false);
    expect(verifyUnsubscribeToken(ID, changed, SECRET)).toBe(false);
    expect(verifyUnsubscribeToken(ID, token.slice(0, 20), SECRET)).toBe(false);
    expect(verifyUnsubscribeToken(ID, token, "another-secret")).toBe(false);
  });

  it("fails closed with nothing to check against", () => {
    expect(verifyUnsubscribeToken(ID, token, undefined)).toBe(false);
    expect(verifyUnsubscribeToken(null, token, SECRET)).toBe(false);
    expect(verifyUnsubscribeToken(ID, null, SECRET)).toBe(false);
    expect(verifyUnsubscribeToken(ID, "", SECRET)).toBe(false);
  });
});

describe("unsubscribeLinks and listUnsubscribeHeaders", () => {
  const links = unsubscribeLinks(ID, { origin: "https://custom.mpillow.com/", secret: SECRET })!;
  const token = unsubscribeToken(ID, SECRET)!;

  it("points a person at the confirm page and a mail client at the route", () => {
    expect(links.pageUrl).toBe(`https://custom.mpillow.com/en-US/unsubscribe?u=${ID}&t=${token}`);
    expect(links.oneClickUrl).toBe(`https://custom.mpillow.com${UNSUBSCRIBE_ROUTE}?u=${ID}&t=${token}`);
  });

  it("keeps the locale the email was written in", () => {
    expect(unsubscribeLinks(ID, { origin: "https://x.test", locale: "zh-CN", secret: SECRET })!.pageUrl).toMatch(
      /^https:\/\/x\.test\/zh-CN\/unsubscribe\?/,
    );
  });

  it("is none without a secret, so a sender cannot mail a link that would not work", () => {
    expect(unsubscribeLinks(ID, { origin: "https://x.test", secret: "" })).toBeNull();
  });

  it("sets the two RFC 8058 headers, with an optional mailto", () => {
    expect(listUnsubscribeHeaders(links)).toEqual({
      "List-Unsubscribe": `<${links.oneClickUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    expect(listUnsubscribeHeaders(links, { mailto: "support@mpillow.com" })["List-Unsubscribe"]).toBe(
      `<${links.oneClickUrl}>, <mailto:support@mpillow.com?subject=unsubscribe>`,
    );
  });
});

describe("probeUnsubscribeRoute", () => {
  const answer = (status: number, body: unknown) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

  it("is ready when the route refuses an empty one-click POST as an invalid link", async () => {
    const fetchImpl = answer(400, { ok: false, error: INVALID_LINK });
    expect(await probeUnsubscribeRoute("https://custom.mpillow.com/", fetchImpl as unknown as typeof fetch)).toEqual({
      ready: true,
    });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://custom.mpillow.com${UNSUBSCRIBE_ROUTE}`);
    expect(init).toMatchObject({ method: "POST", body: "List-Unsubscribe=One-Click" });
  });

  it("is not ready when the route is missing, unconfigured, or the site is down", async () => {
    const notFound = await probeUnsubscribeRoute("https://x.test", answer(404, {}) as unknown as typeof fetch);
    expect(notFound).toMatchObject({ ready: false, reason: expect.stringContaining("404") });

    const noSecret = await probeUnsubscribeRoute(
      "https://x.test",
      answer(503, { ok: false, error: NOT_CONFIGURED }) as unknown as typeof fetch,
    );
    expect(noSecret).toMatchObject({ ready: false, reason: expect.stringContaining("UNSUBSCRIBE_SECRET") });

    // A 400 that is not ours (another app, a proxy) is not the route.
    const stranger = await probeUnsubscribeRoute("https://x.test", answer(400, { error: "bad" }) as unknown as typeof fetch);
    expect(stranger.ready).toBe(false);

    const down = await probeUnsubscribeRoute("https://x.test", (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch);
    expect(down).toMatchObject({ ready: false, reason: expect.stringContaining("ECONNREFUSED") });
  });
});

describe("describeConsent", () => {
  it("names the state, its date in Singapore and its source", () => {
    expect(
      describeConsent({ state: "subscribed", source: "shopify_import", updatedAt: "2026-10-14T16:00:00.000Z" }),
    ).toBe("Subscribed on 15 Oct 2026, from the Shopify export.");
    expect(
      describeConsent({ state: "unsubscribed", source: "unsubscribe_link", updatedAt: "2026-10-20T03:00:00.000Z" }),
    ).toBe("Unsubscribed on 20 Oct 2026, by the unsubscribe link in an email.");
  });

  it("never invents consent for a Customer nobody has asked", () => {
    expect(describeConsent({ state: "not_subscribed", source: null, updatedAt: null })).toMatch(/^Not subscribed/);
    expect(marketingEmailState(undefined)).toBe("not_subscribed");
    expect(marketingEmailState("yes")).toBe("not_subscribed");
  });
});
