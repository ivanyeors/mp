process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { forceDarkMode, FORCED_DARK_STYLE_ID, type EmailShellOptions } from "@/lib/email/base";
import type { CampaignBlocksEmailData } from "@/lib/email/campaign-blocks";
import type { ComposedCampaignEmailData } from "@/lib/email/campaigns";
import type { EmailTransport, OutgoingEmail } from "@/lib/email/types";
import { PROBE_CUSTOMER_ID, unsubscribeToken, verifyUnsubscribeLink, verifyUnsubscribeToken } from "@/lib/marketing-consent/unsubscribe";
import { hashClickToken } from "../click";
import { CAMPAIGN_PLACEHOLDERS, EMPTY_CAMPAIGN_DRAFT, FIRST_CAMPAIGN_DRAFT, campaignLedgerKey, type Campaign } from "../rules";
import { ResendTransport } from "@/lib/email/transport";
import { formatAdminWeekdayTime } from "@/lib/format/admin-date";
import {
  BATCH_SIZE,
  campaignButton,
  campaignSlug,
  planWave,
  readSendingStatus,
  renderCampaignFor,
  renderCampaignPreview,
  sendCampaignBatch,
  sendCampaignTest,
  usesPointsBalance,
  withEmailCampaignUtm,
  type CampaignSenderSetup,
} from "../sender";
import { CONTENT_PLACEHOLDERS, emptyBlock, type CampaignContent } from "../content";
import { emptyWorld, fakeCampaignsClient, type FakeWorld } from "./fake-db";

const ORIGIN = "https://custom.mpillow.com";
const SECRET = "campaign-test-secret";
const CAMPAIGN = "5a1d3c2e-7b4f-4e6a-9c8d-0f1e2d3c4b5a";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ANN = id(1);
const BEA = id(2);
const CAL = id(3);
const DAN = id(4);

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
  w.settings = {
    points_enabled: "true",
    points_launch_at: "2026-10-01T00:00:00.000Z",
    points_claim_bonus: "1000",
    points_claim_bonus_months: "3",
  };
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
    const annSend = world.sends.find((x) => x.customer_id === ANN)!.id;
    const token = unsubscribeToken(ANN, SECRET, annSend)!;
    expect(ann.headers?.["List-Unsubscribe"]).toContain(`${ORIGIN}/api/email/unsubscribe?u=${ANN}&t=${token}&s=${annSend}`);
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

  it("stops before claiming anyone when points were turned off mid-wave", async () => {
    world.settings.points_enabled = "false";
    const { s, sent, admin } = setup();
    const r = await sendCampaignBatch(campaign(), { wave: "w1", customerIds: [ANN, BEA] }, s);
    expect(r.stopped).toMatch(/mentions points, and points are off/);
    expect(sent).toHaveLength(0);
    expect(admin.rpcCalls).toHaveLength(0);
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
      "points",
      "send_limit",
    ]);
    expect(r.wave).toBe("w1");
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

  it("holds a campaign that promises points until points are live, and only that one", async () => {
    world.settings.points_enabled = "false";
    const { s } = setup();
    const r = await planWave(campaign(), { size: 10 }, s);
    expect(r.readiness.ready).toBe(false);
    expect(r.readiness.checks.find((c) => c.key === "points")).toMatchObject({
      ok: false,
      detail: expect.stringMatching(/mentions points, and points are off/),
    });

    world.settings.points_enabled = "true";
    world.settings.points_launch_at = "2099-01-01T00:00:00.000Z";
    expect((await planWave(campaign(), { size: 10 }, s)).readiness.ready).toBe(false);

    world.settings.points_enabled = "false";
    const plain = campaign({ subject: "Our new website", preheader: null, body: "Hello.", button: null });
    const p = await planWave(plain, { size: 10 }, s);
    expect(p.readiness.ready).toBe(true);
    expect(p.readiness.checks.map((c) => c.key)).not.toContain("points");
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

  describe("leaving Segments out", () => {
    const ids = (...pages: string[][]) =>
      async function* () {
        yield* pages;
      };

    it("drops their Customers before the rule, with Everyone subscribed too, and says how many each took", async () => {
      const { s } = setup();
      const r = await planWave(campaign(), { size: 10 }, s, undefined, [
        { segmentId: "seg-staff", name: "Staff and test accounts", ids: ids([BEA], [CAL]) },
        { segmentId: "seg-recent", name: "Bought in the last 14 days", ids: ids([BEA, ANN]) },
      ]);
      expect(r.leftOutBySegment).toEqual([
        { segmentId: "seg-staff", name: "Staff and test accounts", count: 2 },
        { segmentId: "seg-recent", name: "Bought in the last 14 days", count: 1 },
      ]);
      expect(r.customerIds).toEqual([DAN]);
      expect(r.plan.considered).toBe(1);
      expect(r.plan.excluded).toEqual({});
    });

    it("works with a Segment audience, and lists a Segment that took nobody", async () => {
      const { s } = setup();
      const r = await planWave(
        campaign({ audience: "segment", segmentId: "3f2b6c1e-8d4a-4f0b-9c7e-1a2b3c4d5e6f" }),
        { size: 10 },
        s,
        ids([BEA, ANN, DAN]),
        [{ segmentId: "seg-none", name: "Nobody here", ids: ids([id(99)]) }, { segmentId: "seg-ann", name: "Ann", ids: ids([ANN]) }],
      );
      expect(r.leftOutBySegment.map((x) => x.count)).toEqual([0, 1]);
      expect(r.customerIds).toEqual([BEA, DAN]);
    });

    it("leaves nobody out without exclusions", async () => {
      const r = await planWave(campaign(), { size: 10 }, setup().s);
      expect(r.leftOutBySegment).toEqual([]);
      expect(r.plan.considered).toBe(4);
    });

    it("refuses the wave when a left-out Segment cannot be read, never sending to more", async () => {
      const { s } = setup();
      const refused = async function* (): AsyncGenerator<string[]> {
        throw new Error("It leaves out “Staff”, which cannot be used: This Segment is archived.");
      };
      await expect(
        planWave(campaign(), { size: 10 }, s, undefined, [{ segmentId: "seg-staff", name: "Staff", ids: refused }]),
      ).rejects.toThrow(/leaves out “Staff”.*archived/);
    });
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

  it("is not held back by points being off: a test goes to Staff, not customers", async () => {
    world.settings.points_enabled = "false";
    const { s, sent } = setup();
    expect(await sendCampaignTest(campaign(), { to: ["me@mpillow.com"], firstName: "Ivan" }, s)).toMatchObject({ sent: ["me@mpillow.com"] });
    expect(sent).toHaveLength(1);
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

describe("placeholders (PRD-campaign-email-editor slice 01)", () => {
  const escaped = (s: string) => s.replace(/'/g, "&#39;");
  const partly = campaign({
    ...EMPTY_CAMPAIGN_DRAFT,
    content: null,
    audience: "subscribed",
    name: "December",
    subject: "Sleep cooler",
    button: { target: "sign_in", label: "", url: null },
  });

  it("are drawn in the editor's preview of an empty email, dashed and muted, so its layout reads", () => {
    const empty = renderCampaignPreview(
      { ...EMPTY_CAMPAIGN_DRAFT, content: null, button: { target: "sign_in", label: "", url: null } },
      { origin: ORIGIN, firstName: "Ivan" },
    );
    for (const hint of [CAMPAIGN_PLACEHOLDERS.subject, CAMPAIGN_PLACEHOLDERS.body, CAMPAIGN_PLACEHOLDERS.buttonLabel]) {
      expect(empty.html).toContain(escaped(hint));
    }
    expect(empty.html).toContain("dashed");
    expect(empty.subject).toBe("");
    expect(empty.text).not.toContain(CAMPAIGN_PLACEHOLDERS.body);
  });

  it("are never in a test send, which carries only what was typed", async () => {
    const { s, sent } = setup();
    await sendCampaignTest(partly, { to: ["me@mpillow.com"], firstName: "Ivan" }, s);
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe("[Test] Sleep cooler");
    for (const hint of Object.values(CAMPAIGN_PLACEHOLDERS)) {
      expect(sent[0].html).not.toContain(escaped(hint));
      expect(sent[0].text).not.toContain(hint);
    }
    expect(sent[0].html).not.toContain("dashed");
    expect(sent[0].html).toContain(">Sleep cooler</h1>");
    expect(sent[0].html).not.toContain("/en-US/account");
  });

  it("are never in a wave", async () => {
    const { s, sent } = setup();
    await sendCampaignBatch(partly, { wave: "w1", customerIds: [BEA] }, s);
    expect(sent).toHaveLength(1);
    for (const hint of Object.values(CAMPAIGN_PLACEHOLDERS)) expect(sent[0].html).not.toContain(escaped(hint));
    expect(sent[0].html).not.toContain("dashed");
  });
});

describe("the preview's Dark (PRD-campaign-email-editor slice 15)", () => {
  it("forces the shell's own dark rules on the preview, and changes no word", () => {
    const light = renderCampaignPreview(campaign(), { origin: ORIGIN, firstName: "Ivan" });
    const dark = renderCampaignPreview(campaign(), { origin: ORIGIN, firstName: "Ivan", forceDark: true });
    expect(dark.html).toBe(forceDarkMode(light.html));
    expect(dark.html).toContain(`id="${FORCED_DARK_STYLE_ID}"`);
    expect(light.html).not.toContain(FORCED_DARK_STYLE_ID);
    expect({ subject: dark.subject, text: dark.text }).toEqual({ subject: light.subject, text: light.text });
    expect(renderCampaignPreview(campaign(), { origin: ORIGIN, firstName: "Ivan", forceDark: false }).html).toBe(light.html);
  });

  it("can never reach a sent email: nothing a send calls takes forceDark", async () => {
    expectTypeOf<Parameters<typeof renderCampaignPreview>[1]>().toHaveProperty("forceDark");
    expectTypeOf<Parameters<typeof sendCampaignBatch>[0]>().not.toHaveProperty("forceDark");
    expectTypeOf<Parameters<typeof sendCampaignBatch>[1]>().not.toHaveProperty("forceDark");
    expectTypeOf<Parameters<typeof sendCampaignBatch>[2]>().not.toHaveProperty("forceDark");
    expectTypeOf<Parameters<typeof sendCampaignTest>[1]>().not.toHaveProperty("forceDark");
    expectTypeOf<Parameters<typeof sendCampaignTest>[2]>().not.toHaveProperty("forceDark");
    expectTypeOf<Parameters<typeof renderCampaignFor>[1]>().not.toHaveProperty("forceDark");
    expectTypeOf<CampaignBlocksEmailData>().not.toHaveProperty("forceDark");
    expectTypeOf<ComposedCampaignEmailData>().not.toHaveProperty("forceDark");
    expectTypeOf<EmailShellOptions>().not.toHaveProperty("forceDark");

    const { s, sent } = setup();
    await sendCampaignTest(campaign(), { to: ["me@mpillow.com"], firstName: "Ivan" }, s);
    await sendCampaignBatch(campaign(), { wave: "w1", customerIds: [BEA] }, s);
    expect(sent).toHaveLength(2);
    for (const e of sent) {
      expect(e.html).toContain("@media (prefers-color-scheme: dark)");
      expect(e.html).not.toContain(FORCED_DARK_STYLE_ID);
    }
  });
});

describe("a block campaign (PRD-campaign-email-editor slice 03)", () => {
  const escaped = (s: string) => s.replace(/'/g, "&#39;");
  const CONTENT: CampaignContent = {
    v: 1,
    blocks: [
      { id: "title", type: "heading", level: 1, text: "Sleep cooler this December" },
      {
        id: "intro",
        type: "text",
        paragraphs: [
          {
            kind: "p",
            runs: [
              { text: "Hello " },
              { var: "first_name" },
              { text: ", our " },
              { text: "FibreCool", bold: true },
              { text: " covers are back. Read " },
              { text: "the care guide", href: `${ORIGIN}/en-US/faq` },
              { text: "." },
            ],
          },
        ],
      },
      {
        id: "buttons",
        type: "buttons",
        buttons: [
          { label: "Sign in", target: "sign_in", style: "primary" },
          { label: "Customise yours", target: "customise_mpillow", style: "secondary" },
        ],
      },
      { id: "line", type: "divider" },
    ],
    fallbacks: { first_name: "friend" },
  };
  const blocks = (over: Partial<Campaign> = {}) =>
    campaign({
      ...EMPTY_CAMPAIGN_DRAFT,
      name: "December cooling",
      subject: "{first_name}, sleep cooler",
      preheader: "New covers for {first_name}",
      audience: "subscribed",
      content: CONTENT,
      ...over,
    });
  const EVE = id(5);

  it("sends a wave through the same claim, ledger and headers, each button resolved for the recipient", async () => {
    const { s, sent } = setup();
    const r = await sendCampaignBatch(blocks(), { wave: "w1", customerIds: [ANN, BEA] }, s);
    expect(r).toMatchObject({ sent: 2, failed: 0, stopped: null });
    expect(world.sends.filter((x) => x.template === campaignLedgerKey(CAMPAIGN)).map((x) => [x.customer_id, x.status, x.wave])).toEqual([
      [ANN, "sent", "w1"],
      [BEA, "sent", "w1"],
    ]);
    const [ann, bea] = sent;
    expect(ann.subject).toBe("Ann, sleep cooler");
    expect(ann.html).toContain(">Sleep cooler this December</h1>");
    expect(ann.html).toContain("Hi Ann,");
    expect(ann.html).toContain("Hello Ann, our <strong>FibreCool</strong> covers are back.");
    expect(ann.html).toMatch(/<a class="mp-fg" href="https:\/\/custom\.mpillow\.com\/en-US\/faq\?mc=[A-Za-z0-9_-]{43}"[^>]*>the care guide<\/a>/);
    expect(ann.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(world.claimLinks).toEqual([expect.objectContaining({ customer_id: ANN, template: `campaign:${CAMPAIGN}` })]);
    expect(ann.html).toMatch(/\/zh-CN\/account\/welcome\?c=[A-Za-z0-9_-]{43}/);
    expect(ann.html).toContain(`${ORIGIN}/zh-CN/mp-config?utm_source=email_campaign&amp;utm_medium=email&amp;utm_campaign=december-cooling`);
    expect(ann.text).toMatch(/^Sign in: https:\/\/custom\.mpillow\.com\/zh-CN\/account\/welcome\?c=/m);
    expect(ann.text).toMatch(/the care guide: https:\/\/custom\.mpillow\.com\/en-US\/faq\?mc=[A-Za-z0-9_-]{43}/);
    expect(bea.html).toContain(`${ORIGIN}/en-US/account?utm_source=email_campaign`);
    expect(bea.html).not.toContain("welcome?c=");
    expect(bea.html).toContain("max-width:240px");
  });

  it("fills the first name with the campaign's fallback words for a customer who has none", async () => {
    world.customers.push({ id: EVE, email: "eve@x.test", first_name: "  ", marketing_email: "subscribed" });
    const { s, sent } = setup();
    await sendCampaignBatch(blocks(), { wave: "w1", customerIds: [EVE] }, s);
    expect(sent[0].subject).toBe("friend, sleep cooler");
    expect(sent[0].html).toContain("Hello friend, our");
    expect(sent[0].text).toContain("Hello friend, our FibreCool covers are back.");
  });

  it("uses the catalogue's fallback words when the campaign sets none", async () => {
    world.customers.push({ id: EVE, email: "eve@x.test", first_name: null, marketing_email: "subscribed" });
    const { s, sent } = setup();
    await sendCampaignBatch(blocks({ content: { ...CONTENT, fallbacks: {} } }), { wave: "w1", customerIds: [EVE] }, s);
    expect(sent[0].subject).toBe("there, sleep cooler");
    expect(sent[0].html).toContain("Hello there, our");
    expect(sent[0].html).toContain(">Hi there,</p>");
  });

  describe("its Variables (slice 13)", () => {
    const VARS: CampaignContent = {
      v: 1,
      blocks: [
        { id: "h", type: "heading", level: 1, text: "{first_name} {last_name}, sleep cooler" },
        { id: "t", type: "text", paragraphs: [{ kind: "p", runs: [{ text: "You have " }, { var: "points_balance" }, { text: " points waiting." }] }] },
      ],
      fallbacks: { last_name: "friend", points_balance: "some" },
    };
    const named = (over: Partial<Campaign> = {}) => blocks({ subject: "For {first_name} {last_name}", preheader: null, content: VARS, ...over });

    it("fills each recipient's last name from the claim and their points balance, read for them", async () => {
      world.customers.find((c) => c.id === ANN)!.last_name = " Tan ";
      world.customers.find((c) => c.id === ANN)!.points = 1250;
      world.customers.find((c) => c.id === BEA)!.points = 0;
      const { s, sent, admin } = setup();
      await sendCampaignBatch(named(), { wave: "w1", customerIds: [ANN, BEA] }, s);
      const [ann, bea] = sent;
      expect(ann.subject).toBe("For Ann Tan");
      expect(ann.html).toMatch(/<h1 class="mp-fg"[^>]*>Ann Tan, sleep cooler<\/h1>/);
      expect(ann.html).toContain("You have 1,250 points waiting.");
      expect(ann.text).toContain("Ann Tan, sleep cooler\n\nHi Ann,\n\nYou have 1,250 points waiting.");
      expect(bea.subject).toBe("For Bea friend");
      expect(bea.html).toContain("You have some points waiting.");
      expect(admin.rpcCalls.filter((c) => c.name === "points_balance").map((c) => c.args.p_customer_id)).toEqual([ANN, BEA]);
    });

    it("reads no points balance for an email that does not say it", async () => {
      const { s, sent, admin } = setup();
      await sendCampaignBatch(blocks(), { wave: "w1", customerIds: [ANN, BEA] }, s);
      await sendCampaignBatch(campaign(), { wave: "w2", customerIds: [DAN] }, s);
      expect(sent).toHaveLength(3);
      expect(admin.rpcCalls.map((c) => c.name)).not.toContain("points_balance");
      expect(usesPointsBalance(blocks())).toBe(false);
      expect(usesPointsBalance(named())).toBe(true);
      expect(usesPointsBalance(blocks({ subject: "{points_balance} points" }))).toBe(true);
      expect(usesPointsBalance(campaign({ subject: "{points_balance}" }))).toBe(false);
    });

    it("fails one send, not the batch, when a balance can't be read", async () => {
      const { s, sent } = setup();
      const admin = s.admin as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<unknown> };
      const rpc = admin.rpc.bind(admin);
      admin.rpc = async (name, args) => (name === "points_balance" && args.p_customer_id === ANN ? { data: null, error: { message: "timeout" } } : rpc(name, args));
      const r = await sendCampaignBatch(named(), { wave: "w1", customerIds: [ANN, BEA] }, s);
      expect(r).toMatchObject({ sent: 1, failed: 1 });
      expect(r.errors[0]).toContain("Could not read the points balance");
      expect(sent.map((e) => e.to)).toEqual(["bea@x.test"]);
      expect(world.sends.find((x) => x.customer_id === ANN)?.status).toBe("failed");
    });

    it("holds a wave that says the points balance until points are live, and sends a test anyway", async () => {
      world.settings.points_enabled = "false";
      const held = await planWave(named(), { size: 10 }, setup().s);
      expect(held.readiness.checks.find((c) => c.key === "points")).toMatchObject({ ok: false });
      const { s, sent } = setup();
      expect(await sendCampaignBatch(named(), { wave: "w1", customerIds: [ANN] }, s)).toMatchObject({ sent: 0, stopped: expect.stringContaining("points") });
      await sendCampaignTest(named(), { to: ["me@mpillow.com"], firstName: "Mei Ling", lastName: "Tan", pointsBalance: 1250 }, s);
      expect(sent[0].subject).toBe("[Test] For Mei Ling Tan");
      expect(sent[0].html).toContain("You have 1,250 points waiting.");
    });
  });

  it("mints no Claim link when no button signs in", async () => {
    const shop: CampaignContent = { ...CONTENT, blocks: [{ id: "b", type: "buttons", buttons: [{ label: "Shop", target: "shop", style: "primary" }] }] };
    const { s, sent } = setup();
    await sendCampaignBatch(blocks({ content: shop }), { wave: "w1", customerIds: [ANN] }, s);
    expect(world.claimLinks).toEqual([]);
    expect(sent[0].html).toContain(`${ORIGIN}/zh-CN/shop?utm_source=email_campaign`);
  });

  it("sends a test with [Test] before the subject, writing nothing to the ledger", async () => {
    const { s, sent, admin } = setup();
    expect(await sendCampaignTest(blocks(), { to: ["me@mpillow.com"], firstName: "Ivan" }, s)).toEqual({ sent: ["me@mpillow.com"], failed: [] });
    expect(sent[0].subject).toBe("[Test] Ivan, sleep cooler");
    expect(sent[0].html).toContain("Hello Ivan, our");
    expect(sent[0].html).toContain(`${ORIGIN}/en-US/account?utm_source=email_campaign`);
    expect(admin.rpcCalls).toHaveLength(0);
    expect(world.sends).toHaveLength(0);
  });

  it("previews an empty block on its placeholders, and never sends one", async () => {
    const empty: CampaignContent = { v: 1, blocks: [emptyBlock("heading", "h"), emptyBlock("text", "t"), emptyBlock("buttons", "b")], fallbacks: {} };
    const preview = renderCampaignPreview(blocks({ content: empty }), { origin: ORIGIN, firstName: "Ivan" });
    for (const hint of [CONTENT_PLACEHOLDERS.heading, CONTENT_PLACEHOLDERS.text, CAMPAIGN_PLACEHOLDERS.buttonLabel]) {
      expect(preview.html).toContain(escaped(hint));
    }
    expect(preview.html.match(/border:1px dashed/g)).toHaveLength(3);
    expect(renderCampaignPreview(blocks({ content: { v: 1, blocks: [], fallbacks: {} } }), { origin: ORIGIN, firstName: null }).html).toContain(
      CONTENT_PLACEHOLDERS.empty,
    );

    const { s, sent } = setup();
    await sendCampaignTest(blocks({ content: empty }), { to: ["me@mpillow.com"], firstName: "Ivan" }, s);
    await sendCampaignBatch(blocks({ content: empty }), { wave: "w1", customerIds: [BEA] }, s);
    expect(sent).toHaveLength(2);
    for (const e of sent) {
      expect(e.html).not.toContain("dashed");
      for (const hint of [...Object.values(CONTENT_PLACEHOLDERS), ...Object.values(CAMPAIGN_PLACEHOLDERS)]) {
        expect(e.html).not.toContain(escaped(hint));
        expect(e.text).not.toContain(hint);
      }
      expect(e.html).not.toContain("/en-US/shop");
    }
  });

  it("holds a block campaign that promises points until points are live", async () => {
    world.settings.points_enabled = "false";
    const points: CampaignContent = { ...CONTENT, blocks: [{ id: "h", type: "heading", level: 2, text: "1,000 points are waiting" }] };
    const held = await planWave(blocks({ content: points }), { size: 10 }, setup().s);
    expect(held.readiness.checks.find((c) => c.key === "points")).toMatchObject({ ok: false });
    const plain = await planWave(blocks(), { size: 10 }, setup().s);
    expect(plain.readiness.checks.map((c) => c.key)).not.toContain("points");
  });
});

describe("the send limit (Resend's free plan: 100 a day, 3,000 a month, tests included)", () => {
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
  const earlier = (n: number, status: string, h: number) => {
    for (let i = 0; i < n; i++) {
      world.sends.push({
        id: `e-${status}-${h}-${i}`,
        customer_id: `earlier-${h}-${i}`,
        template: "migration_announcement",
        campaign_id: null,
        wave: "pilot",
        status,
        provider_message_id: status === "failed" ? null : `re_e_${h}_${i}`,
        sent_at: hoursAgo(h),
        attempts: 1,
        last_error: null,
        bounced_at: null,
        complained_at: null,
      });
    }
  };
  const tests = (sent: number, h: number) =>
    (world.auditLog ??= []).push({ action: "email_campaign.test", created_at: hoursAgo(h), after: { sent, failed: 0 } });
  const limitOf = (r: { readiness: { checks: { key: string; ok: boolean; detail: string }[] } }) =>
    r.readiness.checks.find((c) => c.key === "send_limit")!;

  it("is the free plan when no limits are given, and counts the ledger and tests over both windows", async () => {
    earlier(10, "sent", 2);
    earlier(3, "failed", 2);
    earlier(40, "sent", 30);
    tests(3, 1);
    tests(2, 24 * 20);
    const r = await planWave(campaign(), { size: 2 }, setup().s);
    expect(limitOf(r)).toEqual({
      key: "send_limit",
      ok: true,
      detail: "13 of 100 sent in the last 24 hours, 55 of 3,000 in the last 31 days: up to 87 more now",
    });
    expect(r.readiness.allowance).toMatchObject({ remaining: 87, binding: "daily", used: { daily: 13, monthly: 55 }, roomAt: null });
    expect(r.limitedBy).toBeNull();
  });

  it("plans no more than today's room, and says how many wait for a later wave", async () => {
    const r = await planWave(campaign(), { size: 10 }, setup({ sendLimits: { daily: 2, monthly: 3000 } }).s);
    expect(r.readiness.ready).toBe(true);
    expect(r.customerIds).toEqual([BEA, ANN]);
    expect(r).toMatchObject({ requested: 10, limitedBy: "daily", waiting: 1 });
    expect(r.plan.eligible).toBe(3);
  });

  it("fails the check at zero, plans nobody, and says when room opens again", async () => {
    earlier(1, "sent", 5);
    earlier(1, "pending", 3);
    const r = await planWave(campaign(), { size: 10 }, setup({ sendLimits: { daily: 2, monthly: 3000 } }).s);
    expect(r.readiness.ready).toBe(false);
    expect(r.customerIds).toEqual([]);
    const roomAt = r.readiness.allowance!.roomAt!;
    expect(Math.abs(Date.parse(roomAt) - (Date.now() + 19 * 3600_000))).toBeLessThan(60_000);
    expect(limitOf(r)).toMatchObject({ ok: false });
    expect(limitOf(r).detail).toBe(
      `2 of 2 sent in the last 24 hours, 2 of 3,000 in the last 31 days: the day's 2 are used; room again from ${formatAdminWeekdayTime(roomAt)}`,
    );
  });

  it("names the month when the month is what is used up", async () => {
    earlier(5, "sent", 24 * 10);
    const r = await planWave(campaign(), { size: 10 }, setup({ sendLimits: { daily: 100, monthly: 5 } }).s);
    expect(r.readiness.allowance).toMatchObject({ remaining: 0, binding: "monthly" });
    expect(limitOf(r).detail).toMatch(/: the month's 5 are used; room again from /);
  });

  it("reads the limits when it counts them, so a bad value fails the check, not the page", async () => {
    const r = await planWave(
      campaign(),
      { size: 10 },
      setup({ sendLimits: () => { throw new Error("CAMPAIGN_DAILY_SEND_LIMIT must be a whole number of emails, not lots"); } }).s,
    );
    expect(limitOf(r)).toEqual({ key: "send_limit", ok: false, detail: "CAMPAIGN_DAILY_SEND_LIMIT must be a whole number of emails, not lots" });
    expect(r.customerIds).toEqual([]);
  });

  it("cuts a batch to the room left and stops there, claiming nobody past it", async () => {
    const { s, sent, admin } = setup({ sendLimits: { daily: 1, monthly: 3000 } });
    const r = await sendCampaignBatch(campaign(), { wave: "w1", customerIds: [BEA, ANN] }, s);
    expect(r).toMatchObject({ sent: 1, failed: 0, stopped: "the send limit is reached; the rest go in the next wave" });
    expect(sent.map((e) => e.to)).toEqual(["bea@x.test"]);
    expect(admin.rpcCalls.filter((c) => c.name === "claim_marketing_campaign_send")).toHaveLength(1);
  });

  it("stops before claiming anyone when another sender used the room since the wave was planned", async () => {
    earlier(1, "sent", 0.5);
    const { s, sent, admin } = setup({ sendLimits: { daily: 1, monthly: 3000 } });
    const r = await sendCampaignBatch(campaign(), { wave: "w1", customerIds: [BEA, ANN] }, s);
    expect(r.sent).toBe(0);
    expect(r.stopped).toMatch(/^the send limit is reached \(room again from .+\); the rest go in the next wave$/);
    expect(sent).toEqual([]);
    expect(admin.rpcCalls).toEqual([]);
  });

  it("stops at once on Resend's quota answer, and marks that send failed so it can be retried", async () => {
    const quota = 'Resend send failed (429): {"name":"daily_quota_exceeded","message":"You have reached your daily email sending quota."}';
    const transport: EmailTransport = { name: "resend", send: vi.fn(async () => { throw new Error(quota); }) };
    const { s, admin } = setup({ transport });
    const r = await sendCampaignBatch(campaign(), { wave: "w1", customerIds: [BEA, ANN] }, s);
    expect(r).toMatchObject({ sent: 0, failed: 1, stopped: "Resend's sending quota is used up: wait for room, then retry the failed send" });
    expect(admin.rpcCalls.filter((c) => c.name === "claim_marketing_campaign_send")).toHaveLength(1);
    expect(world.sends.find((x) => x.customer_id === BEA)).toMatchObject({ status: "failed" });
  });

  it("refuses a test without room, because Resend counts tests too", async () => {
    tests(2, 1);
    const none = await sendCampaignTest(campaign(), { to: ["a@x.test"], firstName: null }, setup({ sendLimits: { daily: 2, monthly: 3000 } }).s);
    expect(none).toEqual({ refused: expect.stringMatching(/^The send limit is reached, and Resend counts tests too: room again from .+\.$/) });
    const one = await sendCampaignTest(campaign(), { to: ["a@x.test", "b@x.test"], firstName: null }, setup({ sendLimits: { daily: 3, monthly: 3000 } }).s);
    expect(one).toEqual({ refused: "Only 1 more can be sent now, and Resend counts tests too: send the test to fewer addresses." });
  });
});

describe("readSendingStatus", () => {
  it("says what is set up and what is left, and never carries the key", async () => {
    const key = "re_live_0123456789abcdef";
    const status = await readSendingStatus(setup({ transport: new ResendTransport(key), reportsConfigured: true }).s);
    expect(status.checks.map((c) => [c.key, c.ok])).toEqual([
      ["transport", true],
      ["from", true],
      ["reply_to", true],
      ["site", true],
      ["reports", true],
    ]);
    expect(status.allowance).toMatchObject({ remaining: 100, used: { daily: 0, monthly: 0 } });
    expect(JSON.stringify(status)).not.toContain(key);
    expect(JSON.stringify(status)).not.toContain("re_live");
  });

  it("names what is missing, and calls no other site", async () => {
    const fetchImpl = vi.fn();
    const status = await readSendingStatus(
      setup({ transport: null, campaignFrom: undefined, reportsConfigured: false, fetchImpl: fetchImpl as unknown as typeof fetch }).s,
    );
    const failing = Object.fromEntries(status.checks.filter((c) => !c.ok).map((c) => [c.key, c.detail]));
    expect(failing).toEqual({
      transport: "CAMPAIGN_RESEND_API_KEY is not set (owner decision 4)",
      from: "CAMPAIGN_EMAIL_FROM is not set",
      reports: "CAMPAIGN_RESEND_WEBHOOK_SECRET is not set: bounces and spam reports are not recorded, and the pause rule cannot see them",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("the rest period", () => {
  const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

  it("plans around someone emailed in the last 7 days, and says when the first can get it", async () => {
    world.recentMarketing = { [BEA]: [ago(2)], [DAN]: [ago(9)] };
    const r = await planWave(campaign(), { size: 10 }, setup().s);
    expect(r.customerIds).not.toContain(BEA);
    expect(r.customerIds).toContain(DAN);
    expect(r.plan.excluded.resting).toBe(1);
    expect(Date.parse(r.plan.restingUntil!)).toBeGreaterThan(Date.now() + 4 * 86_400_000);
    expect(Date.parse(r.plan.restingUntil!)).toBeLessThan(Date.now() + 6 * 86_400_000);
  });

  it("skips, never fails, someone who started resting after the plan, writing no ledger row", async () => {
    const { s, sent } = setup();
    world.onClaim = (customerId) => {
      if (customerId === BEA) world.recentMarketing = { [BEA]: [ago(0.01)] };
    };
    const r = await sendCampaignBatch(campaign(), { wave: "w1", customerIds: [ANN, BEA] }, s);
    expect(r.skipped).toEqual({ resting: 1 });
    expect(r.failed).toBe(0);
    expect(sent.map((e) => e.to)).toEqual(["ann@x.test"]);
    expect(world.sends.filter((x) => x.customer_id === BEA)).toEqual([]);
  });

  it("never holds a test: it goes to Staff addresses through no claim", async () => {
    world.recentMarketing = { [BEA]: [ago(0.01)] };
    const { s } = setup();
    const admin = s.admin as unknown as ReturnType<typeof fakeCampaignsClient>;
    expect(await sendCampaignTest(campaign(), { to: ["bea@x.test"], firstName: "Bea" }, s)).toMatchObject({ sent: ["bea@x.test"] });
    expect(admin.rpcCalls.filter((c) => c.name === "claim_marketing_campaign_send")).toEqual([]);
  });
});

describe("each send's click token and unsubscribe link", () => {
  const tokensIn = (html: string) => [...new Set([...html.matchAll(/[?&](?:amp;)?mc=([A-Za-z0-9_-]{43})/g)].map((m) => m[1]))];

  it("puts one token per email on its site links, keeps only its hash, and leaves the unsubscribe link without it", async () => {
    const { s, sent } = setup();
    await sendCampaignBatch(campaign(), { wave: "w1", customerIds: [ANN, BEA] }, s);
    const [annTokens, beaTokens] = sent.map((e) => tokensIn(e.html));
    expect(annTokens).toHaveLength(1);
    expect(beaTokens).toHaveLength(1);
    expect(annTokens[0]).not.toBe(beaTokens[0]);
    const annSend = world.sends.find((x) => x.customer_id === ANN)!;
    expect(annSend.click_token_hash).toBe(await hashClickToken(annTokens[0]));
    expect(JSON.stringify(world.sends)).not.toContain(annTokens[0]);
    const unsub = sent[0].html.match(/href="([^"]*\/unsubscribe\?[^"]*)"/)![1].replace(/&amp;/g, "&");
    expect(unsub).not.toContain("mc=");
    const u = new URL(unsub);
    expect(verifyUnsubscribeLink(u.searchParams.get("u"), u.searchParams.get("t"), u.searchParams.get("s"), SECRET)).toEqual({
      customerId: ANN,
      sendId: annSend.id,
    });
  });

  it("keeps no token for a send that failed", async () => {
    const { s } = setup({ failFor: new Set(["bea@x.test"]) });
    await sendCampaignBatch(campaign(), { wave: "w1", customerIds: [BEA] }, s);
    expect(world.sends.find((x) => x.customer_id === BEA)).toMatchObject({ status: "failed" });
    expect(world.sends.find((x) => x.customer_id === BEA)?.click_token_hash ?? null).toBeNull();
  });

  it("never puts a click token on a test", async () => {
    const { s, sent } = setup();
    await sendCampaignTest(campaign(), { to: ["me@mpillow.com"], firstName: "Ivan" }, s);
    expect(sent[0].html).not.toMatch(/[?&](amp;)?mc=/);
  });
});
