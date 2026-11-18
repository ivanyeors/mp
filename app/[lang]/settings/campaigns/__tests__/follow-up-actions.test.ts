import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerSegment } from "@/lib/crm/segment-rules";
import type { Campaign, CampaignDraft } from "@/lib/email-campaigns/rules";

/**
 * A follow-up through the page's actions (PRD-email-funnel slice 06): a
 * campaign started from `?after=<A>:<did>` is saved with the follow-up
 * Segment as its Audience, and is not refused as "a Segment chosen by what
 * the same campaign did" (PRD-campaign-audiences slice 05): the Segment reads
 * campaign A, and this is another campaign. `findWantedSegmentAction` (asked
 * after a taken name) answers the live Segment with exactly the wanted
 * filters, by id and name, and nothing of any Segment's filters.
 */

const A = "7c0a1e2b-3d4f-4a5b-8c6d-9e0f1a2b3c4d";
const B = "6b2e4d3f-8c5a-4f7b-8d9e-1a2b3c4d5e6f";
const FOLLOW_UP = "5e000000-0000-4000-8000-0000000000f1";

const h = vi.hoisted(() => ({
  campaigns: new Map<string, Campaign>(),
  created: [] as CampaignDraft[],
  updated: [] as [string, CampaignDraft][],
  segments: [] as CustomerSegment[],
  permission: [] as string[],
}));
vi.mock("@/lib/auth/admin", () => ({
  assertAdmin: vi.fn(async (permission: string) => {
    h.permission.push(permission);
    return { permissions: new Set(["campaigns"]), email: "owner@mpillow.com", memberId: "m1", userId: "u1" };
  }),
}));
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction: vi.fn() }));
vi.mock("@/lib/staff/working-as", () => ({ getWorkingAs: vi.fn(async () => ({ id: "s1", name: "Ivan Yeo" })) }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));
vi.mock("@/lib/email-campaigns/setup", () => ({ campaignSenderSetup: () => ({ origin: "https://custom.mpillow.com", admin: {} }) }));
vi.mock("@/lib/email-campaigns/images", () => ({
  readCampaignImages: vi.fn(async () => new Map()),
  campaignImageFieldErrors: vi.fn(() => ({})),
}));
vi.mock("@/lib/email-campaigns/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email-campaigns/store")>()),
  getCampaign: vi.fn(async (_admin: unknown, id: string) => h.campaigns.get(id) ?? null),
  createCampaign: vi.fn(async (_admin: unknown, draft: CampaignDraft) => {
    h.created.push(draft);
    return B;
  }),
  updateCampaign: vi.fn(async (_admin: unknown, id: string, draft: CampaignDraft) => {
    h.updated.push([id, draft]);
  }),
}));
vi.mock("@/lib/crm/segments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/crm/segments")>()),
  listSegments: vi.fn(async () => h.segments),
  getSegment: vi.fn(async (id: string) => {
    const s = h.segments.find((x) => x.id === id);
    return s ? { id: s.id, name: s.name, filters: s.params, filtersVersion: 2, archivedAt: null } : null;
  }),
}));

const { findWantedSegmentAction, saveCampaign } = await import("../actions");
const { newCampaignFromAddress } = await import("@/lib/email-campaigns/starters");
const { matchable } = await import("@/lib/email-campaigns/wanted-segment");

const segment = (id: string, name: string, params: Record<string, string>): CustomerSegment => ({
  id,
  name,
  params,
  ignored: [],
  needsReview: false,
  count: 2,
  createdBy: null,
  createdAt: "2026-11-18T00:00:00Z",
  updatedAt: "2026-11-18T00:00:00Z",
});
const parent: Campaign = {
  id: A,
  name: "We miss you",
  subject: "It's been a while",
  preheader: null,
  body: "",
  content: { v: 1, blocks: [{ id: "t", type: "heading", level: 1, text: "It's been a while" }], fallbacks: {} },
  greeting: true,
  button: null,
  audience: "segment",
  segmentId: null,
  excludeSegmentIds: [],
  includeUnengaged: false,
  createdAt: "2026-11-01T00:00:00Z",
  updatedAt: "2026-11-01T00:00:00Z",
  lockedAt: null,
  archivedAt: null,
  createdBy: null,
};

beforeEach(() => {
  h.campaigns = new Map([[A, parent]]);
  h.created = [];
  h.updated = [];
  h.permission = [];
  h.segments = [segment(FOLLOW_UP, "We miss you · didn't click", { campaign: `${A}:not-clicked` }), segment("seg-tan", "Mrs Tan", { search: "tan@example.com" })];
});

describe("a campaign started from ?after=<A>:not-clicked", () => {
  it("is saved with the follow-up Segment, and saved again without being refused as its own history", async () => {
    const { draft } = newCampaignFromAddress({ after: `${A}:not-clicked` }, matchable(h.segments), parent);
    expect(draft).toMatchObject({ audience: "segment", segmentId: FOLLOW_UP });
    const written = { ...draft, name: "We miss you, again", subject: "Still thinking of you", content: parent.content };

    expect(await saveCampaign(null, written)).toEqual({ ok: true, id: B });
    expect(h.created[0]).toMatchObject({ audience: "segment", segmentId: FOLLOW_UP });

    // Saved again as campaign B: the Segment reads A, so B can send to it.
    h.campaigns.set(B, { ...parent, ...h.created[0], id: B });
    expect(await saveCampaign(B, written)).toEqual({ ok: true, id: B });
    expect(h.updated).toHaveLength(1);
    expect(h.updated[0][1]).toMatchObject({ audience: "segment", segmentId: FOLLOW_UP });
  });

  it("is refused for A itself: the rule still holds for the campaign the Segment reads", async () => {
    const own = { ...parent, segmentId: FOLLOW_UP };
    expect(await saveCampaign(A, own)).toMatchObject({ ok: false, fieldErrors: { segmentId: expect.stringContaining("already been sent") } });
    expect(h.updated).toHaveLength(0);
  });
});

describe("findWantedSegmentAction", () => {
  it("answers the live Segment with exactly the wanted filters, by id and name only, behind campaigns", async () => {
    expect(await findWantedSegmentAction({ name: "We miss you · didn't click", filters: `campaign=${A}:not-clicked` })).toEqual({
      ok: true,
      segment: { id: FOLLOW_UP, name: "We miss you · didn't click" },
    });
    expect(h.permission).toEqual(["campaigns"]);
    expect(await findWantedSegmentAction({ name: "x", filters: `campaign=${A}:clicked` })).toEqual({ ok: true, segment: null });
  });

  it("refuses filters the Customers list does not know", async () => {
    expect(await findWantedSegmentAction({ name: "x", filters: "nope=1" })).toMatchObject({ ok: false });
    expect(await findWantedSegmentAction({ name: "x", filters: 42 as unknown as string })).toMatchObject({ ok: false });
  });
});
