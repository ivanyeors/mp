// Deterministic origin before anything imports the email shell.
process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailTransport, OutgoingEmail } from "@/lib/email/types";
import { PROBE_CUSTOMER_ID, unsubscribeToken, verifyUnsubscribeToken } from "@/lib/marketing-consent/unsubscribe";
import { FIRST_CAMPAIGN_DRAFT, campaignLedgerKey, type Campaign } from "../rules";
import {
  BATCH_SIZE,
  campaignButton,
  campaignSlug,
  planWave,
  renderCampaignPreview,
  sendCampaignBatch,
  sendCampaignTest,
  withEmailCampaignUtm,
  type CampaignSenderSetup,
} from "../sender";
import { emptyWorld, fakeCampaignsClient, type FakeWorld } from "./fake-db";

const ORIGIN = "https://custom.mpillow.com";
const SECRET = "campaign-test-secret";
const CAMPAIGN = "5a1d3c2e-7b4f-4e6a-9c8d-0f1e2d3c4b5a";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ANN = id(1); // imported, unclaimed, subscribed, buyer
const BEA = id(2); // signed up here, subscribed
const CAL = id(3); // imported, unsubscribed
const DAN = id(4); // imported, Claimed, subscribed

let world: FakeWorld;

function seed(w: FakeWorld) {
  w.customers.push(
    { id: ANN, email: "ann@x.test", first_name: "Ann", locale: "zh-CN", marketing_email: "subscribed" },
    { id: BEA, email: "bea@x.test", first_name: "Bea", marketing_email: "subscribed", total_orders: 1, created_at: "2026-10-18T00:00:00Z" },
    { id: CAL, email: "cal@x.test", marketing_email: "unsubscribed" },
    { id: DAN, email: "dan@x.test", first_name: "Dan", marketing_email: "subscribed" },
  );
  w.migrated.push(
    { customer_id: ANN, shopify_orders_count: 2, imported_at: "2026-10-10T00:00:00Z" },
    { customer_id: CAL, imported_at: "2026-10-10T00:00:00Z" },
    { customer_id: DAN, imported_at: "2026-10-10T00:00:00Z", claimed_at: "2026-10-15T00:00:00Z" },
  );
  w.campaigns.push({ id: CAMPAIGN, audience: "subscribed" });
}

const campaign = (over: Partial<Campaign> = {}): Campaign => ({
  ...FIRST_CAMPAIGN_DRAFT,
  audience: "subscribed",
  id: CAMPAIGN,
  createdAt: "2026-10-21T00:00:00Z",
  updatedAt: "2026-10-21T00:00:00Z",
  lockedAt: "2026-10-21T01:00:00Z",
  archivedAt: null,
  createdBy: null,
  ...over,
});

/** The site: its one-click route verifies links with `siteSecret`. */
function site({ siteSecret = SECRET } = {}) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname !== "/api/email/unsubscribe") return new Response("not found", { status: 404 });
    if (!verifyUnsubscribeToken(url.searchParams.get("u"), url.searchParams.get("t"), siteSecret)) {
      return Response.json({ ok: false, error: "invalid_link" }, { status: 400 });
    }
    return Response.json({ ok: true });
  });
}

function fakeTransport(opts: { failFor?: Set<string>; failAll?: boolean; name?: string } = {}) {
  const sent: OutgoingEmail[] = [];
  const transport: EmailTransport = {
    name: opts.name ?? "resend",
    async send(email) {
      if (opts.failAll || opts.failFor?.has(email.to)) throw new Error("Resend send failed (500)");
      sent.push(email);
      return { id: `re_${sent.length}` };
    },
  };
  return { transport, sent };
}

function setup(over: Partial<CampaignSenderSetup> & { failFor?: Set<string>; failAll?: boolean } = {}) {
  const { transport, sent } = fakeTransport({ failFor: over.failFor, failAll: over.failAll });
  const admin = fakeCampaignsClient(world);
  const s: CampaignSenderSetup = {
    admin: admin as unknown as SupabaseClient,
    transport,
    campaignFrom: "Mpillow <hello@hello.mpillow.com>",
    campaignDomain: "hello.mpillow.com",
    orderFrom: "orders@mpillow.com",
    replyTo: "Mpillow Support <support@mpillow.com>",
    origin: ORIGIN,
    unsubscribeSecret: SECRET,
    fetchImpl: site() as unknown as typeof fetch,
    sleep: vi.fn(async () => undefined),
    ...over,
  };
  return { s, sent, admin };
}

beforeEach(() => {
  world = emptyWorld();
  seed(world);
});

describe("sendCampaignBatch", () => {
  it("claims each person, then sends them the campaign with their own unsubscribe link and the one-click headers", async () => {
    const { s, sent } = setup();
    const r = await sendCampaignBatch(campaign(), { wave: "w1", customerIds: [ANN, BEA] }, s);
    expect(r).toMatchObject({ sent: 2, failed: 0, stopped: null });
    expect(sent.map((e) => e.to)).toEqual(["ann@x.test", "bea@x.test"]);
    const ann = sent[0];
    expect(ann.from).toBe("Mpillow <hello@hello.mpillow.com>");
    expect(ann.replyTo).toBe("support@mpillow.com");
    expect(ann.subject).toBe(FIRST_CAMPAIGN_DRAFT.subject);
    expect(ann.html).toContain("Hi Ann,");
    const token = unsubscribeToken(ANN, SECRET)!;
    expect(ann.headers?.["List-Unsubscribe"]).toContain(`${ORIGIN}/api/email/unsubscribe?u=${ANN}&t=${token}`);
    expect(ann.headers?.["List-Unsubscribe"]).toContain("mailto:support@mpillow.com");
    expect(ann.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(ann.html).toContain(`/zh-CN/unsubscribe?u=${ANN}`);

    const rows = world.sends.filter((x) => x.template === campaignLedgerKey(CAMPAIGN));
    expect(rows.map((x) => [x.customer_id, x.status, x.wave, x.provider_message_id])).toEqual([
      [ANN, "sent", "w1", "re_1"],
      [BEA, "sent", "w1", "re_2"],
    ]);
  });

  it("gives an unclaimed Migrated customer their own Claim link, and anyone else their account", async () => {
    const { s, sent } = setup();
    await sendCampaignBatch(campaign(), { wave: "w1", customerIds: [ANN, BEA, DAN] }, s);
    expect(world.claimLinks).toEqual([expect.objectContaining({ customer_id: ANN, template: `campaign:${CAMPAIGN}` })]);
    expect(sent[0].html).toMatch(/\/zh-CN\/account\/welcome\?c=[A-Za-z0-9_-]{43}/);
    expect(sent[1].html).toContain(`${ORIGIN}/en-US/account?utm_source=email_campaign`);
    expect(sent[1].html).not.toContain("welcome?c=");
    expect(sent[2].html).not.toContain("welcome?c=");
  });

  it("never sends anyone the same campaign twice, in any wave", async () => {
    const { s, sent } = setup();
    await sendCampaignBatch(campaign(), { wave: "w1", customerIds: [ANN] }, s);
    const again = await sendCampaignBatch(campaign(), { wave: "w2", customerIds: [ANN] }, s);
    expect(again).toMatchObject({ sent: 0, skipped: { already_sent: 1 } });
    expect(sent).toHaveLength(1);
  });

  it("skips someone who unsubscribed after the wave was planned", async () => {
    world.onClaim = (customerId) => {
      if (customerId === BEA) world.customers.find((c) => c.id === BEA)!.marketing_email = "unsubscribed";
    };
    const { s, sent } = setup();
    const r = await sendCampaignBatch(campaign(), { wave: "w1", customerIds: [ANN, BEA, CAL] }, s);
    expect(r).toMatchObject({ sent: 1, skipped: { unsubscribed: 2 } });
    expect(sent.map((e) => e.to)).toEqual(["ann@x.test"]);
  });

  it("marks a failed send failed, and retries it only when asked", async () => {
    const first = setup({ failFor: new Set(["bea@x.test"]) });
    const r = await sendCampaignBatch(campaign(), { wave: "w1", customerIds: [BEA] }, first.s);
    expect(r).toMatchObject({ sent: 0, failed: 1, failuresInARow: 1 });
    expect(world.sends[0]).toMatchObject({ status: "failed", last_error: "Resend send failed (500)" });

    const second = setup();
    expect(await sendCampaignBatch(campaign(), { wave: "w2", customerIds: [BEA] }, second.s)).toMatchObject({ skipped: { failed: 1 } });
    expect(await sendCampaignBatch(campaign(), { wave: "w2", customerIds: [BEA], retryFailed: true }, second.s)).toMatchObject({ sent: 1 });
    expect(world.sends[0]).toMatchObject({ status: "sent", wave: "w2", attempts: 2 });
  });

  it("stops after five failures in a row, counting across batches", async () => {
    for (let i = 10; i < 20; i++) {
      world.customers.push({ id: id(i), email: `p${i}@x.test`, marketing_email: "subscribed" });
    }
    const { s, sent } = setup({ failAll: true });
    const ids = Array.from({ length: 10 }, (_, i) => id(10 + i));
    const r = await sendCampaignBatch(campaign(), { wave: "w1", customerIds: ids, failuresInARow: 3 }, s);
    expect(r.failed).toBe(2);
    expect(r.stopped).toBe("5 sends in a row failed");
    expect(sent).toHaveLength(0);
    expect(world.sends).toHaveLength(2);
  });

  it("refuses, claiming nobody, when the wave was not started, the transport is not Resend, or the batch is too big", async () => {
    const cases: [Campaign, Partial<CampaignSenderSetup>, string[]][] = [
      [campaign({ lockedAt: null }), {}, [ANN]],
      [campaign({ archivedAt: "2026-10-21T02:00:00Z" }), {}, [ANN]],
      [campaign(), { transport: null }, [ANN]],
      [campaign(), { transport: fakeTransport({ name: "gmail" }).transport }, [ANN]],
      [campaign(), { campaignFrom: "orders@mpillow.com" }, [ANN]],
      [campaign(), {}, Array.from({ length: BATCH_SIZE + 1 }, (_, i) => id(100 + i))],
    ];
    for (const [c, over, ids] of cases) {
      const { s, sent, admin } = setup(over);
      const r = await sendCampaignBatch(c, { wave: "w1", customerIds: ids }, s);
      expect(r.stopped).toBeTruthy();
      expect(sent).toHaveLength(0);
      expect(admin.rpcCalls).toHaveLength(0);
    }
  });

  it("stops at once when the campaign is archived mid-wave", async () => {
    world.campaigns[0].archived = true;
    const { s, sent } = setup();
    const r = await sendCampaignBatch(campaign(), { wave: "w1", customerIds: [ANN, BEA] }, s);
    expect(r.stopped).toBe("the campaign is archived");
    expect(sent).toHaveLength(0);
  });
});

describe("planWave", () => {
  it("passes every check, plans buyers first, and names the next wave", async () => {
    world.campaigns[0].audience = "subscribed";
    const { s } = setup();
    const r = await planWave(campaign(), { size: 2 }, s);
    expect(r.readiness.ready).toBe(true);
    expect(r.readiness.checks.map((c) => c.key)).toEqual([
      "transport",
      "from",
      "reply_to",
      "site",
      "unsubscribe_route",
      "unsubscribe_secret",
      "pause",
    ]);
    expect(r.wave).toBe("w1");
    // Ann (2 Shopify orders) and Bea (1 here) are buyers, Bea the newer; Dan
    // Claimed, but this audience is everyone subscribed.
    expect(r.plan.eligible).toBe(3);
    expect(r.customerIds).toEqual([BEA, ANN]);
    expect(r.plan.excluded).toEqual({ unsubscribed: 1 });
  });

  it("is not ready while the site refuses links signed here", async () => {
    const { s } = setup({ fetchImpl: site({ siteSecret: "another" }) as unknown as typeof fetch });
    const r = await planWave(campaign(), { size: 10 }, s);
    expect(r.readiness.ready).toBe(false);
    expect(r.readiness.checks.find((c) => c.key === "unsubscribe_secret")?.ok).toBe(false);
  });

  it("holds the pause rule after a wave with too many bounces, until Staff resume", async () => {
    for (let i = 0; i < 10; i++) {
      world.sends.push({
        id: `old-${i}`,
        customer_id: id(200 + i),
        template: "migration_announcement",
        campaign_id: null,
        wave: "pilot",
        status: i < 2 ? "bounced" : "sent",
        provider_message_id: `re_old_${i}`,
        sent_at: "2026-10-20T00:00:00Z",
        attempts: 1,
        last_error: null,
        bounced_at: i < 2 ? "2026-10-20T01:00:00Z" : null,
        complained_at: null,
      });
    }
    const { s } = setup();
    expect((await planWave(campaign(), { size: 10 }, s)).readiness.ready).toBe(false);
    expect((await planWave(campaign(), { size: 10, resume: true }, s)).readiness.ready).toBe(true);
  });

  it("refuses a wave size outside 1 to 1,000", async () => {
    const { s } = setup();
    await expect(planWave(campaign(), { size: 0 }, s)).rejects.toThrow(/1 to 1000/);
    await expect(planWave(campaign(), { size: 1001 }, s)).rejects.toThrow(/1 to 1000/);
  });

  it("follows the imported audience, and a Segment's ids", async () => {
    const { s } = setup();
    const imported = await planWave(campaign({ audience: "imported_not_signed_in" }), { size: 10 }, s);
    expect(imported.customerIds).toEqual([ANN]);
    expect(imported.plan.excluded).toEqual({ unsubscribed: 1, claimed: 1 });

    const segment = await planWave(
      campaign({ audience: "segment", segmentId: "3f2b6c1e-8d4a-4f0b-9c7e-1a2b3c4d5e6f" }),
      { size: 10 },
      s,
      async function* () {
        yield [BEA, CAL];
      },
    );
    expect(segment.plan.considered).toBe(2);
    expect(segment.customerIds).toEqual([BEA]);
  });
});

describe("sendCampaignTest", () => {
  it("sends the campaign with [Test] in the subject, writes nothing to the ledger, and its unsubscribe link belongs to nobody", async () => {
    const { s, sent, admin } = setup();
    const r = await sendCampaignTest(campaign(), { to: ["Me <me@mpillow.com>", "me@mpillow.com", "ops@mpillow.com"], firstName: "Ivan" }, s);
    expect(r).toEqual({ sent: ["me@mpillow.com", "ops@mpillow.com"], failed: [] });
    expect(sent[0].subject).toBe(`[Test] ${FIRST_CAMPAIGN_DRAFT.subject}`);
    expect(sent[0].html).toContain("Hi Ivan,");
    expect(sent[0].headers?.["List-Unsubscribe"]).toContain(`u=${PROBE_CUSTOMER_ID}`);
    expect(sent[0].html).toContain(`${ORIGIN}/en-US/account?utm_source=email_campaign`);
    expect(admin.rpcCalls).toHaveLength(0);
    expect(world.sends).toHaveLength(0);
  });

  it("refuses no address, more than three, or a transport that is not set up", async () => {
    const { s } = setup();
    expect(await sendCampaignTest(campaign(), { to: ["nope"], firstName: null }, s)).toHaveProperty("refused");
    expect(await sendCampaignTest(campaign(), { to: ["a@x.test", "b@x.test", "c@x.test", "d@x.test"], firstName: null }, s)).toHaveProperty("refused");
    expect(await sendCampaignTest(campaign(), { to: ["a@x.test"], firstName: null }, setup({ transport: null }).s)).toHaveProperty("refused");
  });
});

describe("links", () => {
  it("adds the campaign's UTMs to the site's links only", () => {
    expect(withEmailCampaignUtm(`${ORIGIN}/en-US/shop?x=1`, "October news!", ORIGIN)).toBe(
      `${ORIGIN}/en-US/shop?x=1&utm_source=email_campaign&utm_medium=email&utm_campaign=october-news`,
    );
    expect(withEmailCampaignUtm("https://instagram.com/mpillow", "October", ORIGIN)).toBe("https://instagram.com/mpillow");
    expect(campaignSlug("¡¡¡")).toBe("campaign");
  });

  it("resolves the button per recipient", () => {
    const c = campaign();
    expect(campaignButton(c, { origin: ORIGIN, locale: "en-US", claimUrl: "https://custom.mpillow.com/en-US/account/welcome?c=t" })?.href).toBe(
      "https://custom.mpillow.com/en-US/account/welcome?c=t",
    );
    expect(campaignButton({ ...c, button: null }, { origin: ORIGIN, locale: "en-US", claimUrl: null })).toBeNull();
    expect(
      campaignButton({ ...c, button: { target: "url", label: "Shop", url: "https://custom.mpillow.com/shop" } }, { origin: ORIGIN, locale: "en-US", claimUrl: "ignored" })?.href,
    ).toContain("/shop?utm_source=email_campaign");
  });

  it("previews with an unsubscribe link that unsubscribes nobody", () => {
    const html = renderCampaignPreview(campaign(), { origin: ORIGIN, firstName: "Ivan" }).html;
    expect(html).toContain(`${ORIGIN}/en-US/unsubscribe"`);
    expect(html).toContain("Hi Ivan,");
  });
});
