// Deterministic origin before anything imports the email shell.
process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailTransport, OutgoingEmail } from "@/lib/email/types";
import { CAMPAIGN_BLOCKER_TEXT, EMPTY_CAMPAIGN_DRAFT, type Campaign } from "../rules";
import { planWave, sendCampaignBatch, type CampaignSenderSetup } from "../sender";
import { emptyWorld, fakeCampaignsClient, type FakeWorld } from "./fake-db";

/**
 * The sunset rule in the sender (PRD-campaign-audiences slice 12): a wave's
 * plan leaves the Unengaged out and says how many, the claim refuses them at
 * the moment of sending, and a win-back that includes them reaches them. Who
 * is Unengaged is the overview's `unengaged`, read once per plan; a plan that
 * cannot read it refuses the wave rather than send to them.
 */

const CAMPAIGN = "5a1d3c2e-7b4f-4e6a-9c8d-0f1e2d3c4b5b";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ANN = id(1);
const DEV = id(2);

const campaign = (over: Partial<Campaign> = {}): Campaign => ({
  ...EMPTY_CAMPAIGN_DRAFT,
  name: "We miss you",
  subject: "What's new since your last visit",
  content: { v: 1, blocks: [{ id: "h", type: "heading", level: 1, text: "We miss you" }], fallbacks: {} },
  audience: "subscribed",
  id: CAMPAIGN,
  createdAt: "2026-10-21T00:00:00Z",
  updatedAt: "2026-10-21T00:00:00Z",
  lockedAt: "2026-10-21T01:00:00Z",
  archivedAt: null,
  createdBy: null,
  ...over,
});

let world: FakeWorld;
let sent: OutgoingEmail[];

function setup(): CampaignSenderSetup {
  sent = [];
  const transport: EmailTransport = {
    name: "resend",
    async send(email) {
      sent.push(email);
      return { id: `re_${sent.length}` };
    },
  };
  return {
    admin: fakeCampaignsClient(world) as unknown as SupabaseClient,
    transport,
    campaignFrom: "Mpillow <hello@hello.mpillow.com>",
    campaignDomain: "hello.mpillow.com",
    orderFrom: "orders@mpillow.com",
    replyTo: "Mpillow Support <support@mpillow.com>",
    origin: "https://custom.mpillow.com",
    unsubscribeSecret: "campaign-test-secret",
    fetchImpl: vi.fn(async () => Response.json({ ok: true })) as unknown as typeof fetch,
    sleep: vi.fn(async () => undefined),
    now: () => new Date("2026-10-31T04:00:00Z"),
  };
}

beforeEach(() => {
  world = emptyWorld();
  world.customers.push(
    { id: ANN, email: "ann@x.test", first_name: "Ann", marketing_email: "subscribed" },
    { id: DEV, email: "dev@x.test", first_name: "Dev", marketing_email: "subscribed", unengaged: true },
  );
});

describe("the Unengaged in a wave (slice 12)", () => {
  it("leaves them out of the plan and says how many, and the claim refuses them too", async () => {
    world.campaigns.push({ id: CAMPAIGN, audience: "subscribed" });
    const r = await planWave(campaign(), { size: 10 }, setup());
    expect(r.customerIds).toEqual([ANN]);
    expect(r.plan.excluded).toEqual({ unengaged: 1 });
    expect(CAMPAIGN_BLOCKER_TEXT.unengaged).toMatch(/^unengaged \(clicked none of their last 6 campaigns/);

    // Asked to send to them anyway, the claim refuses: skipped, never failed.
    const batch = await sendCampaignBatch(campaign(), { wave: "w1", customerIds: [ANN, DEV] }, setup());
    expect(batch).toMatchObject({ sent: 1, failed: 0, skipped: { unengaged: 1 } });
    expect(sent.map((e) => e.to)).toEqual(["ann@x.test"]);
    expect(world.sends.map((s) => s.customer_id)).toEqual([ANN]);
  });

  it("reaches them in a win-back that includes them", async () => {
    world.campaigns.push({ id: CAMPAIGN, audience: "subscribed", includeUnengaged: true });
    const winBack = campaign({ includeUnengaged: true });
    const r = await planWave(winBack, { size: 10 }, setup());
    expect([...r.customerIds].sort()).toEqual([ANN, DEV]);
    expect(r.plan.excluded).toEqual({});
    const batch = await sendCampaignBatch(winBack, { wave: "w1", customerIds: [ANN, DEV] }, setup());
    expect(batch).toMatchObject({ sent: 2, failed: 0 });
  });

  it("refuses the wave when who is Unengaged cannot be read", async () => {
    world.campaigns.push({ id: CAMPAIGN, audience: "subscribed" });
    const s = setup();
    const admin = s.admin as unknown as { from: (t: string) => unknown };
    const from = admin.from.bind(admin);
    admin.from = (t: string) => {
      if (t === "admin_customer_overview") throw new Error("timeout");
      return from(t);
    };
    await expect(planWave(campaign(), { size: 10 }, s)).rejects.toThrow(/timeout/);
  });
});
