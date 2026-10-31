import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Campaign } from "@/lib/email-campaigns/rules";

/**
 * A Segment chosen by this campaign's own history (PRD-campaign-audiences
 * slice 05): *got it*, *clicked it* or *got it, didn't click* holds only
 * people the campaign has already been sent, and nobody gets a campaign
 * twice, so as its Audience it would never send. Save refuses it on the
 * *Send to* field, and every wave plan refuses it too, since the Segment can
 * change after the campaign is saved. *Didn't get it* is who it has left.
 */

const ID = "5a1d3c2e-7b4f-4e6a-9c8d-0f1e2d3c4b5a";
const OTHER = "6b2e4d3f-8c5a-4f7b-8d9e-1a2b3c4d5e6f";
const SEGMENT = "5e000000-0000-4000-8000-0000000000d4";

const h = vi.hoisted(() => ({
  campaign: null as unknown as Campaign,
  segmentFilters: {} as Record<string, string>,
  planned: 0,
  updated: 0,
}));

vi.mock("@/lib/auth/admin", () => ({
  assertAdmin: vi.fn(async () => ({ permissions: new Set(["campaigns"]), email: "owner@mpillow.com", memberId: "m1", userId: "u1" })),
}));
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));
vi.mock("@/lib/email-campaigns/setup", () => ({ campaignSenderSetup: () => ({ origin: "https://custom.mpillow.com", admin: {} }) }));
vi.mock("@/lib/email-campaigns/images", () => ({
  readCampaignImages: vi.fn(async () => new Map()),
  campaignImageFieldErrors: vi.fn(() => ({})),
}));
vi.mock("@/lib/email-campaigns/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email-campaigns/store")>()),
  getCampaign: vi.fn(async () => h.campaign),
  updateCampaign: vi.fn(async () => {
    h.updated++;
  }),
  lockCampaign: vi.fn(),
}));
vi.mock("@/lib/crm/segments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/crm/segments")>();
  return {
    ...actual,
    getSegment: vi.fn(async (id: string) =>
      id === SEGMENT
        ? { id, name: "Got the launch, didn't click", filters: h.segmentFilters, filtersVersion: 2, archivedAt: null }
        : null,
    ),
    resolveSegment: vi.fn(async function* () {
      yield ["c1"];
    }),
  };
});
vi.mock("@/lib/email-campaigns/sender", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email-campaigns/sender")>()),
  planWave: vi.fn(async () => {
    h.planned++;
    return {
      readiness: { checks: [], advice: [], ready: false, allowance: null, sender: { from: null, replyTo: null } },
      wave: "w1",
      plan: { considered: 0, eligible: 0, eligibleBuyers: 0, excluded: {}, alreadySent: 0, failed: 0, eligibleChinese: 0, selectedChinese: 0 },
      customerIds: [],
      requested: 1,
      limitedBy: null,
      waiting: 0,
      leftOutBySegment: [],
    };
  }),
}));

const { planCampaignWave, saveCampaign } = await import("../actions");

const campaign = (over: Partial<Campaign> = {}): Campaign => ({
  name: "The launch",
  subject: "Sleep cooler",
  preheader: null,
  body: "",
  content: { v: 1, blocks: [{ id: "title", type: "heading", level: 1, text: "Sleep cooler" }], fallbacks: {} },
  greeting: true,
  button: null,
  audience: "segment",
  segmentId: SEGMENT,
  excludeSegmentIds: [],
  id: ID,
  createdAt: "2026-10-21T00:00:00Z",
  updatedAt: "2026-10-21T00:00:00Z",
  lockedAt: null,
  archivedAt: null,
  createdBy: null,
  ...over,
});

const NEVER_SENDS =
  "“Got the launch, didn't click” chooses people this campaign has already been sent, and nobody gets a campaign twice, " +
  "so it would never send. Send it to another Segment, or use “Got the launch, didn't click” for a follow-up campaign.";

beforeEach(() => {
  h.campaign = campaign();
  h.planned = 0;
  h.updated = 0;
});

describe("a Segment on this campaign's own history, as its Audience", () => {
  it.each(["sent", "clicked", "not-clicked"])("refuses %s on Save, under Send to", async (state) => {
    h.segmentFilters = { stage: "at-risk", campaign: `${ID}:${state}` };
    expect(await saveCampaign(ID, campaign())).toEqual({
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: { segmentId: NEVER_SENDS },
    });
    expect(h.updated).toBe(0);
  });

  it("refuses every wave plan, because the Segment can change after the campaign is saved", async () => {
    h.segmentFilters = { campaign: `${ID.toUpperCase()}:not-clicked` };
    expect(await planCampaignWave(ID, { size: 10 })).toEqual({ ok: false, error: NEVER_SENDS });
    expect(await planCampaignWave(ID, { size: 10 }, true)).toEqual({ ok: false, error: NEVER_SENDS });
    expect(h.planned).toBe(0);
  });

  it("lets *didn't get it* through: that is who it has left to reach", async () => {
    h.segmentFilters = { campaign: `${ID}:not-sent` };
    expect(await saveCampaign(ID, campaign())).toEqual({ ok: true, id: ID });
    expect(await planCampaignWave(ID, { size: 10 })).toMatchObject({ ok: true });
    expect(h.planned).toBe(1);
  });

  it("lets a follow-up campaign use it: the Segment is about another campaign", async () => {
    h.campaign = campaign({ id: OTHER, name: "The follow-up" });
    h.segmentFilters = { campaign: `${ID}:not-clicked` };
    expect(await saveCampaign(OTHER, campaign({ id: OTHER, name: "The follow-up" }))).toEqual({ ok: true, id: OTHER });
    expect(await planCampaignWave(OTHER, { size: 10 })).toMatchObject({ ok: true });
  });

  it("does not ask of a campaign sent to everyone subscribed", async () => {
    h.campaign = campaign({ audience: "subscribed", segmentId: null });
    h.segmentFilters = { campaign: `${ID}:sent` };
    expect(await planCampaignWave(ID, { size: 10 })).toMatchObject({ ok: true });
  });
});
