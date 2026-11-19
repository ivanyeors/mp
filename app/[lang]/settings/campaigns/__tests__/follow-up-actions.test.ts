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
  /** The caller's permissions: an Owner unless a test says otherwise. */
  holds: ["campaigns", "customers", "customers-edit"] as string[],
  reads: 0,
}));
vi.mock("@/lib/auth/admin", () => ({
  // As the real one: refuses (throws) without the permission.
  assertAdmin: vi.fn(async (permission: string) => {
    h.permission.push(permission);
    if (!h.holds.includes(permission)) throw new Error("Forbidden");
    return { permissions: new Set(h.holds), email: "owner@mpillow.com", memberId: "m1", userId: "u1" };
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
  listSegments: vi.fn(async () => {
    h.reads++;
    return h.segments;
  }),
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
  h.holds = ["campaigns", "customers", "customers-edit"];
  h.reads = 0;
  h.segments = [
    segment(FOLLOW_UP, "We miss you · didn't click", { campaign: `${A}:not-clicked` }),
    segment("seg-tan", "Mrs Tan", { search: "tan@example.com" }),
    segment("seg-risk", "Lapsing customers", { stage: "at-risk" }),
    segment("seg-near", "At risk · 12 to 24 months", { stage: "at-risk", last_order: "within:24" }),
  ];
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
  type Input = Parameters<typeof findWantedSegmentAction>[0];
  const ask = (input: unknown) => findWantedSegmentAction(input as Input);

  it("finds the Segment for each address New campaign takes, by id and name only, behind campaigns", async () => {
    expect(await ask({ after: `${A}:not-clicked` })).toEqual({ ok: true, segment: { id: FOLLOW_UP, name: "We miss you · didn't click" } });
    expect(await ask({ stage: "at-risk" })).toEqual({ ok: true, segment: { id: "seg-risk", name: "Lapsing customers" } });
    expect(await ask({ starter: "playbook_we_miss_you" })).toEqual({ ok: true, segment: { id: "seg-near", name: "At risk · 12 to 24 months" } });
    expect(await ask({ after: `${A}:clicked` })).toEqual({ ok: true, segment: null });
    expect(new Set(h.permission)).toEqual(new Set(["campaigns"]));
  });

  // A caller's filters never reach the comparison: Staff with campaigns but not customers cannot ask whether a Segment searches for someone.
  it.each([[["campaigns"]], [["campaigns", "customers"]], [["campaigns", "customers", "customers-edit"]]])("is no oracle for a Segment's filters (%j)", async (holds) => {
    h.holds = holds;
    for (const probe of [
      { name: "", filters: "search=tan@example.com" },
      { filters: "search=tan@example.com" },
      { stage: "at-risk", filters: "search=tan@example.com" },
      { after: `${A}:sent`, filters: "search=tan@example.com" },
      { stage: "search=tan@example.com" },
      { after: "search=tan@example.com" },
      { starter: "search=tan@example.com" },
    ]) {
      const answer = await ask(probe);
      expect(answer, JSON.stringify(probe)).toMatchObject({ ok: false });
      expect(JSON.stringify(answer)).not.toMatch(/seg-tan|Mrs Tan/);
    }
  });

  it("refuses what the page refuses: an unapproved Playbook, a Starter without a Segment, Lost, a sub-status, not-sent, an unknown or archived campaign", async () => {
    h.campaigns.set(B, { ...parent, id: B, archivedAt: "2026-11-02T00:00:00Z" });
    for (const input of [
      { starter: "playbook_how_its_made" },
      { starter: "short_note" },
      { stage: "lost" },
      { stage: "at-risk:lapsed" },
      { after: `${A}:not-sent` },
      { after: "8d1b2f3c-4e5a-4b6c-9d7e-0f1a2b3c4d5e:sent" },
      { after: `${B}:sent` },
      null,
      "stage=at-risk",
    ]) {
      expect(await ask(input), JSON.stringify(input)).toMatchObject({ ok: false });
    }
  });

  it("refuses without campaigns before reading anything", async () => {
    h.holds = ["customers"];
    await expect(ask({ stage: "at-risk" })).rejects.toThrow("Forbidden");
    expect(h.reads).toBe(0);
  });
});
