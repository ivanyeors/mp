process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailTransport, OutgoingEmail } from "@/lib/email/types";
import { verifyUnsubscribeToken } from "@/lib/marketing-consent/unsubscribe";
import type { CampaignContent } from "../content";
import { KEEP_SENDING_OFF, type KeepSending, type LiveSegment } from "../keep-sending";
import { keptSendingLine, runKeptSending, type KeptSendingDeps } from "../keep-sending-run";
import { campaignLedgerKey, EMPTY_CAMPAIGN_DRAFT, type Campaign } from "../rules";
import { sendCampaignBatch, type CampaignSenderSetup } from "../sender";
import { readKeptSendingCampaigns } from "../store";
import { emptyWorld, fakeCampaignsClient, type FakeSend, type FakeWorld } from "./fake-db";

const ORIGIN = "https://custom.mpillow.com";
const SECRET = "campaign-test-secret";
const NOW = new Date("2026-10-31T02:00:00Z");
const TODAY = "daily-2026-10-31";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CAMPAIGN = "5a1d3c2e-7b4f-4e6a-9c8d-0f1e2d3c4b5a";
const OTHER = "5a1d3c2e-7b4f-4e6a-9c8d-0f1e2d3c4b5b";
const SEG = "11111111-0000-4000-8000-000000000001";

const CONTENT: CampaignContent = {
  v: 1,
  blocks: [
    { id: "h", type: "heading", level: 1, text: "A pair for your pillow" },
    { id: "t", type: "text", paragraphs: [{ kind: "p", runs: [{ text: "The Mbolster pairs well with it." }] }] },
  ],
  fallbacks: {},
};

const keep = (over: Partial<KeepSending> = {}): KeepSending => ({ ...KEEP_SENDING_OFF, on: true, dailyCap: 3, ...over });

const campaign = (over: Partial<Campaign> = {}): Campaign => ({
  ...EMPTY_CAMPAIGN_DRAFT,
  name: "Second purchase",
  subject: "A pair for your pillow",
  preheader: null,
  content: CONTENT,
  audience: "subscribed",
  id: CAMPAIGN,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  lockedAt: "2026-10-01T01:00:00Z",
  archivedAt: null,
  createdBy: null,
  keepSending: keep(),
  ...over,
});

let world: FakeWorld;
let sent: OutgoingEmail[];
let paused: { id: string; reason: string }[];
let audited: { id: string; after: Record<string, unknown> }[];
let lines: string[];

function setup(over: Partial<CampaignSenderSetup> = {}): CampaignSenderSetup {
  return {
    admin: fakeCampaignsClient(world) as unknown as SupabaseClient,
    transport: {
      name: "resend",
      async send(email) {
        sent.push(email);
        return { id: `re_${sent.length}` };
      },
    } satisfies EmailTransport,
    campaignFrom: "Mpillow <hello@hello.mpillow.com>",
    campaignDomain: "hello.mpillow.com",
    orderFrom: "orders@mpillow.com",
    replyTo: "Mpillow Support <support@mpillow.com>",
    origin: ORIGIN,
    unsubscribeSecret: SECRET,
    fetchImpl: vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname !== "/api/email/unsubscribe") return new Response("not found", { status: 404 });
      return verifyUnsubscribeToken(url.searchParams.get("u"), url.searchParams.get("t"), SECRET)
        ? Response.json({ ok: true })
        : Response.json({ ok: false, error: "invalid_link" }, { status: 400 });
    }) as unknown as typeof fetch,
    sleep: vi.fn(async () => undefined),
    now: () => NOW,
    ...over,
  };
}

function deps(campaigns: Campaign[], over: Partial<KeptSendingDeps> = {}, s: CampaignSenderSetup = setup()): KeptSendingDeps {
  return {
    setup: s,
    campaigns: async () => campaigns,
    liveSegments: async () => new Map(),
    audience: () => undefined,
    exclusions: async () => [],
    pause: async (cid, reason) => void paused.push({ id: cid, reason }),
    audit: async (cid, after) => void audited.push({ id: cid, after }),
    telegram: async (text) => void lines.push(text),
    ...over,
  };
}

function firstWave(campaignId: string, customerId: string, over: Partial<FakeSend> = {}): FakeSend {
  return {
    id: `f-${campaignId.slice(-1)}-${customerId.slice(-2)}`,
    customer_id: customerId,
    template: campaignLedgerKey(campaignId),
    campaign_id: campaignId,
    wave: "w1",
    status: "sent",
    provider_message_id: "re_first",
    sent_at: "2026-10-01T02:00:00Z",
    attempts: 1,
    last_error: null,
    bounced_at: null,
    complained_at: null,
    ...over,
  };
}

beforeEach(() => {
  world = emptyWorld();
  sent = [];
  paused = [];
  audited = [];
  lines = [];
  for (let n = 1; n <= 7; n++) {
    world.customers.push({ id: id(n), email: `p${n}@x.test`, first_name: `P${n}`, marketing_email: "subscribed", created_at: `2026-0${Math.min(n, 9)}-01T00:00:00Z` });
  }
  world.campaigns.push({ id: CAMPAIGN, audience: "subscribed" }, { id: OTHER, audience: "subscribed" });
  world.sends.push(firstWave(CAMPAIGN, id(1)), firstWave(OTHER, id(1)));
});

const keptSends = (campaignId = CAMPAIGN) => world.sends.filter((s) => s.campaign_id === campaignId && s.wave === TODAY);

describe("one Wave a day (slice 10)", () => {
  it("sends at most the cap, to people who joined, as today's daily Wave, and records the run as the system", async () => {
    const run = await runKeptSending(deps([campaign()]));
    expect(run).toMatchObject({ ok: true, sent: 3, stoppedForDay: null });
    expect(run.campaigns).toEqual([
      expect.objectContaining({ campaignId: CAMPAIGN, wave: TODAY, sent: 3, failed: 0, eligible: 6, held: null, paused: false }),
    ]);
    expect(sent.map((e) => e.to)).toHaveLength(3);
    expect(sent.map((e) => e.to)).not.toContain("p1@x.test");
    expect(keptSends().map((s) => s.status)).toEqual(["sent", "sent", "sent"]);
    expect(sent[0].headers?.["List-Unsubscribe"]).toBeTruthy();
    expect(audited).toEqual([{ id: CAMPAIGN, after: expect.objectContaining({ wave: TODAY, sent: 3, cap: 3, eligible: 6, held: null, paused: false }) }]);
    expect(lines).toEqual(["Kept sending: 3 emails today from 1 campaign."]);
    expect(lines.join(" ")).not.toMatch(/@|Second purchase|P\d/);
  });

  it("a re-run the same day sends nothing past the cap; the next day sends the next", async () => {
    await runKeptSending(deps([campaign()]));
    const again = await runKeptSending(deps([campaign()]));
    expect(again.sent).toBe(0);
    expect(again.campaigns[0].held).toBe("today's 3 are claimed");
    expect(sent).toHaveLength(3);

    const tomorrow = await runKeptSending(deps([campaign()], {}, setup({ now: () => new Date("2026-11-01T02:00:00Z") })));
    expect(tomorrow.sent).toBe(3);
    expect(world.sends.filter((s) => s.wave === "daily-2026-11-01")).toHaveLength(3);
    expect(new Set(sent.map((e) => e.to)).size).toBe(6);
  });

  it("never sends into the reserve kept for tests and Staff Waves, and stops the day there", async () => {
    const s = setup({ sendLimits: { daily: 34, monthly: 3000 } });
    const run = await runKeptSending(deps([campaign({ keepSending: keep({ dailyCap: 20 }) }), campaign({ id: OTHER, keepSending: keep({ dailyCap: 20 }) })], {}, s));
    expect(run.sent).toBe(4);
    expect(run.campaigns[0]).toMatchObject({ sent: 4 });
    expect(run.stoppedForDay).toBe("Resend's room is down to the 30 kept for tests and your own waves");
    expect(run.campaigns[1]).toMatchObject({ campaignId: OTHER, sent: 0, held: run.stoppedForDay });
  });

  it("leaves out whom a Staff Wave would: unsubscribed, bounced, and resting", async () => {
    world.customers[1].marketing_email = "unsubscribed";
    world.sends.push(firstWave(OTHER, id(3), { status: "bounced", bounced_at: "2026-10-02T00:00:00Z" }));
    world.recentMarketing = { [id(4)]: ["2026-10-29T02:00:00Z"] };
    const run = await runKeptSending(deps([campaign({ keepSending: keep({ dailyCap: 20 }) })]));
    expect(run.campaigns[0]).toMatchObject({ eligible: 3, sent: 3 });
    expect(sent.map((e) => e.to).sort()).toEqual(["p5@x.test", "p6@x.test", "p7@x.test"]);
  });

  it("waits out the first wave's two days before sending more", async () => {
    world.sends = [firstWave(CAMPAIGN, id(1), { sent_at: "2026-10-30T02:00:00Z" })];
    const run = await runKeptSending(deps([campaign()]));
    expect(run.sent).toBe(0);
    expect(run.campaigns[0].held).toMatch(/^it waits until .* for the first wave's bounces and spam reports$/);
  });

  it("sends on the second day after a first wave that went out after 10:00, not the third", async () => {
    world.sends = [firstWave(CAMPAIGN, id(1), { sent_at: "2026-11-25T04:18:22Z" })];
    const at = (iso: string) => runKeptSending(deps([campaign()], {}, setup({ now: () => new Date(iso) })));
    const nextDay = await at("2026-11-26T02:00:00Z");
    expect(nextDay.sent).toBe(0);
    expect(nextDay.campaigns[0].held).toBe("it waits until 11/27/2026, 10:00:00 AM for the first wave's bounces and spam reports");
    const secondDay = await at("2026-11-27T02:00:00Z");
    expect(secondDay.campaigns[0].held).toBeNull();
    expect(secondDay.sent).toBe(3);
  });

  it("sends nothing for a campaign not kept sending, or paused", async () => {
    const run = await runKeptSending(
      deps([campaign({ keepSending: KEEP_SENDING_OFF }), campaign({ id: OTHER, keepSending: keep({ pausedAt: "2026-10-30T00:00:00Z" }) })]),
    );
    expect(run.sent).toBe(0);
    expect(sent).toEqual([]);
    expect(audited).toEqual([]);
  });
});

describe("the holdout (slice 11)", () => {
  const holding = () => campaign({ keepSending: keep({ dailyCap: 20, holdoutAt: "2026-10-30T02:00:00Z" }) });

  it("holds the bucket out: recorded, never sent, and not counted against the cap or Resend's room", async () => {
    world.campaigns[0].holdout = true;
    const run = await runKeptSending(deps([holding()]));
    expect(run.campaigns[0]).toMatchObject({ sent: 5, skipped: { held_out: 1 } });
    expect(sent.map((e) => e.to)).not.toContain("p3@x.test");
    expect(keptSends().find((s) => s.customer_id === id(3))).toMatchObject({ status: "held_out", provider_message_id: null });

    const again = await runKeptSending(deps([holding()]));
    expect(again.campaigns[0]).toMatchObject({ sent: 0, eligible: 0 });
  });

  it("never sends them that campaign by a later Wave, even with the holdout off", async () => {
    world.campaigns[0].holdout = true;
    await runKeptSending(deps([holding()]));
    world.campaigns[0].holdout = false;
    const s = setup();
    const batch = await sendCampaignBatch(campaign({ keepSending: keep() }), { wave: "w2", customerIds: [id(3)] }, s);
    expect(batch).toMatchObject({ sent: 0, skipped: { held_out: 1 } });
    const retry = await sendCampaignBatch(campaign({ keepSending: keep() }), { wave: "w3", customerIds: [id(3)], retryFailed: true }, s);
    expect(retry).toMatchObject({ sent: 0, skipped: { held_out: 1 } });
    expect(sent.map((e) => e.to)).not.toContain("p3@x.test");
  });
});

describe("what stops it (slice 10)", () => {
  it("the pause rule stops the day, and pauses nothing", async () => {
    world.sends.push(firstWave(OTHER, id(2), { wave: "w2", status: "bounced", bounced_at: "2026-10-30T00:00:00Z", sent_at: "2026-10-29T00:00:00Z" }));
    const run = await runKeptSending(deps([campaign(), campaign({ id: OTHER })]));
    expect(run.sent).toBe(0);
    expect(run.stoppedForDay).toMatch(/^the pause rule: the last wave \(w2\)/);
    expect(run.campaigns.map((c) => c.held)).toEqual([run.stoppedForDay, run.stoppedForDay]);
    expect(paused).toEqual([]);
  });

  it("a 429 from Resend stops the day", async () => {
    const s = setup({
      transport: {
        name: "resend",
        async send() {
          throw new Error("Resend (429): You have reached your daily email sending quota.");
        },
      },
    });
    const run = await runKeptSending(deps([campaign(), campaign({ id: OTHER })], {}, s));
    expect(run.sent).toBe(0);
    expect(run.stoppedForDay).toMatch(/^Resend stopped sending: Resend's sending quota is used up/);
    expect(run.campaigns[1].held).toBe(run.stoppedForDay);
    expect(keptSends(OTHER)).toEqual([]);
  });

  it("pauses a campaign whose Segment changed since a person approved it, saying why", async () => {
    const approved = { [SEG]: { filters: { delivered: "over:60" }, filtersVersion: 3 } };
    const segment = (filters: unknown): LiveSegment => ({ name: "Delivered over 60 days", filters, filtersVersion: 3, archivedAt: null });
    const c = campaign({ audience: "segment", segmentId: SEG, keepSending: keep({ segments: approved }) });
    world.campaigns[0].audience = "segment";

    const changed = await runKeptSending(deps([c], { liveSegments: async () => new Map([[SEG, segment({ delivered: "over:30" })]]) }));
    expect(changed.sent).toBe(0);
    expect(paused).toEqual([{ id: CAMPAIGN, reason: "its Segment “Delivered over 60 days” changed since keep sending was turned on" }]);
    expect(changed.campaigns[0]).toMatchObject({ paused: true, held: paused[0].reason });
    expect(audited[0].after).toMatchObject({ paused: true });

    const same = await runKeptSending(
      deps([c], {
        liveSegments: async () => new Map([[SEG, segment({ delivered: "over:60" })]]),
        audience: () => async function* () {
          yield [id(1), id(5), id(6)];
        },
      }),
    );
    expect(same.campaigns[0]).toMatchObject({ eligible: 2, sent: 2, paused: false });
    expect(sent.map((e) => e.to).sort()).toEqual(["p5@x.test", "p6@x.test"]);
  });

  it("pauses a campaign whose email no longer passes its checks", async () => {
    const c = campaign({
      content: { ...CONTENT, blocks: [...CONTENT.blocks, { id: "p", type: "text", paragraphs: [{ kind: "p", runs: [{ text: "Spend your points on it." }] }] }] },
    });
    const run = await runKeptSending(deps([c, campaign({ id: OTHER })]));
    expect(paused).toEqual([{ id: CAMPAIGN, reason: expect.stringMatching(/^the email failed a check: .*points/i) }]);
    expect(run.campaigns[0]).toMatchObject({ sent: 0, paused: true });
    expect(run.stoppedForDay).toBeNull();
    expect(run.campaigns[1]).toMatchObject({ campaignId: OTHER, sent: 3 });
  });

  it("says the day's counts in one line", () => {
    expect(
      keptSendingLine({
        sent: 1,
        stoppedForDay: "the pause rule: x",
        campaigns: [
          { campaignId: "a", wave: TODAY, sent: 1, failed: 2, skipped: {}, eligible: 3, held: null, paused: false },
          { campaignId: "b", wave: TODAY, sent: 0, failed: 0, skipped: {}, eligible: null, held: "y", paused: true },
        ],
      }),
    ).toBe("Kept sending: 1 email today from 2 campaigns; 2 failed; 1 paused, to look at in Email campaigns; stopped early: the pause rule: x.");
  });
});

describe("the daily job's list (slice 10)", () => {
  it("is the live campaigns kept sending and not paused, oldest started first", async () => {
    const row = (n: number, over: Record<string, unknown>) => ({
      id: id(100 + n),
      name: `C${n}`,
      subject: "s",
      body: "b",
      audience: "subscribed",
      exclude_segment_ids: [],
      locked_at: `2026-10-0${n}T00:00:00Z`,
      archived_at: null,
      keep_sending: true,
      keep_sending_daily_cap: 20,
      keep_sending_paused_at: null,
      ...over,
    });
    world.campaignRows = [
      row(3, {}),
      row(1, {}),
      row(2, { keep_sending: false }),
      row(4, { keep_sending_paused_at: "2026-10-30T00:00:00Z" }),
      row(5, { archived_at: "2026-10-30T00:00:00Z" }),
    ];
    const list = await readKeptSendingCampaigns(fakeCampaignsClient(world) as unknown as SupabaseClient);
    expect(list.map((c) => c.name)).toEqual(["C1", "C3"]);
    expect(list[0].keepSending).toMatchObject({ on: true, dailyCap: 20, pausedAt: null });
  });
});
