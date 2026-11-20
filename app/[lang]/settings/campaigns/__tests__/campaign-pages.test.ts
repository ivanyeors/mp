import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerSegment } from "@/lib/crm/segment-rules";
import type { Campaign } from "@/lib/email-campaigns/rules";

const PARENT = "7c0a1e2b-3d4f-4a5b-8c6d-9e0f1a2b3c4d";
const SAVED = "5a1d3c2e-7b4f-4e6a-9c8d-0f1e2d3c4b5a";
const h = vi.hoisted(() => ({
  permissions: [] as string[],
  segments: [] as CustomerSegment[] | Error,
  campaigns: new Map<string, Campaign>(),
}));
vi.mock("@/lib/auth/admin", () => ({
  requireAdminPage: vi.fn(async () => ({ email: "owner@mpillow.com", memberId: "m1", userId: "u1", permissions: new Set(h.permissions) })),
}));
vi.mock("@/lib/crm/segments", () => ({
  listSegments: vi.fn(async () => {
    if (h.segments instanceof Error) throw h.segments;
    return h.segments;
  }),
}));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));
vi.mock("@/lib/email-campaigns/store", () => ({
  getCampaign: vi.fn(async (_admin: unknown, id: string) => h.campaigns.get(id) ?? null),
  listCampaigns: vi.fn(async () => [...h.campaigns.values()].map((campaign) => ({ campaign, stats: { handed: 0, firstSentAt: null, lastSentAt: null } }))),
  getCampaignStats: vi.fn(async () => null),
  readWaveStats: vi.fn(async () => ({ own: [] })),
  readCampaignResults: vi.fn(async () => null),
}));
vi.mock("../points-live", () => ({ campaignPointsLive: vi.fn(async () => true) }));
vi.mock("../ai-writing", () => ({ campaignAiWriting: vi.fn(async () => ({ on: false })) }));
vi.mock("../campaign-editor", () => ({ CampaignEditor: () => null }));

const { default: NewCampaignPage } = await import("../new/page");
const { default: CampaignPage } = await import("../[id]/page");

const segment = (id: string, name: string, params: Record<string, string>): CustomerSegment => ({
  id,
  name,
  params,
  ignored: [],
  needsReview: false,
  count: 3,
  createdBy: null,
  createdAt: "2026-11-18T00:00:00Z",
  updatedAt: "2026-11-18T00:00:00Z",
});
const campaign = (id: string, name: string): Campaign => ({
  id,
  name,
  subject: "",
  preheader: null,
  body: "",
  content: { v: 1, blocks: [], fallbacks: {} },
  greeting: true,
  button: null,
  audience: "subscribed",
  segmentId: null,
  excludeSegmentIds: [],
  includeUnengaged: false,
  createdAt: "2026-11-01T00:00:00Z",
  updatedAt: "2026-11-01T00:00:00Z",
  lockedAt: null,
  archivedAt: null,
  createdBy: null,
});

type Props = Record<string, unknown> & { segments: unknown[]; found: Record<string, string>; canCreateSegments: boolean };
const newPage = async (query: Record<string, string>) =>
  ((await NewCampaignPage({ params: Promise.resolve({ lang: "en-US" }), searchParams: Promise.resolve(query) })) as { props: Props }).props;
const savedPage = async () => ((await CampaignPage({ params: Promise.resolve({ lang: "en-US", id: SAVED }), searchParams: Promise.resolve({}) })) as { props: Props }).props;

beforeEach(() => {
  h.permissions = ["campaigns", "customers", "customers-edit"];
  h.segments = [
    segment("seg-tan", "Mrs Tan", { search: "tan@example.com", tags: "vip" }),
    segment("seg-lapsed", "At risk · Lapsed", { stage: "at-risk:lapsed" }),
    segment("seg-risk", "At risk", { stage: "at-risk" }),
  ];
  h.campaigns = new Map([
    [PARENT, campaign(PARENT, "We miss you")],
    [SAVED, campaign(SAVED, "December")],
  ]);
});

describe("Create the Segment", () => {
  it("is offered on a saved, unsent campaign's page too, to Staff with customers-edit", async () => {
    expect((await savedPage()).canCreateSegments).toBe(true);
    expect((await newPage({})).canCreateSegments).toBe(true);
    h.permissions = ["campaigns"];
    expect((await savedPage()).canCreateSegments).toBe(false);
    expect((await newPage({})).canCreateSegments).toBe(false);
  });

  it("finds a Playbook dragged in on a saved campaign's page by the server's match", async () => {
    expect(Object.values((await savedPage()).found)).toContain("seg-lapsed");
  });
});

describe("a Segment's filters", () => {
  it.each([[["campaigns"]], [["campaigns", "customers"]], [["campaigns", "customers", "customers-edit"]]])("never reach the editor (%j)", async (permissions) => {
    h.permissions = permissions;
    for (const props of [await newPage({ stage: "at-risk", after: `${PARENT}:not-clicked`, starter: "playbook_we_miss_you" }), await savedPage()]) {
      const sent = JSON.stringify({ ...props, segments: props.segments.map((s) => ({ ...(s as object), customersHref: undefined })) });
      expect(sent).not.toContain("tan@example.com");
      expect(sent).not.toContain("tan%40example.com");
      expect(sent).not.toContain("vip");
      for (const s of props.segments) expect(Object.keys(s as object).sort()).toEqual(["customersHref", "id", "name"]);
    }
  });

  it("link to the Customers list only for a role with customers, as before", async () => {
    h.permissions = ["campaigns"];
    expect((await newPage({})).segments.map((s) => (s as { customersHref: unknown }).customersHref)).toEqual([null, null, null]);
  });
});

describe("New campaign at ?after= and ?stage=", () => {
  it("reads the follow-up's campaign and chooses its Segment, or offers to create it", async () => {
    const p = await newPage({ after: `${PARENT}:not-clicked` });
    expect(p.wanted).toMatchObject({ name: "We miss you · didn't click", filters: `campaign=${PARENT}:not-clicked` });
    expect(p.draft).toMatchObject({ audience: "segment", segmentId: null });
    expect((await newPage({ stage: "at-risk" })).draft).toMatchObject({ audience: "segment", segmentId: "seg-risk" });
  });

  it("opens the ordinary empty campaign for an unknown or archived campaign", async () => {
    h.campaigns.set(PARENT, { ...campaign(PARENT, "We miss you"), archivedAt: "2026-11-02T00:00:00Z" });
    expect((await newPage({ after: `${PARENT}:not-clicked` })).wanted).toBeNull();
    expect((await newPage({ after: "8d1b2f3c-4e5a-4b6c-9d7e-0f1a2b3c4d5e:sent" })).wanted).toBeNull();
  });
});

describe("a failed Segments read", () => {
  it("is said, on both pages, rather than taken for no Segments", async () => {
    h.segments = new Error("timeout");
    expect(await newPage({ stage: "at-risk" })).toMatchObject({ segmentsUnread: true, segments: [], wanted: { name: "At risk" } });
    expect(await savedPage()).toMatchObject({ segmentsUnread: true });
    h.segments = [];
    expect(await newPage({ stage: "at-risk" })).toMatchObject({ segmentsUnread: false });
  });
});


describe("New campaign at ?after=&before= (slice 07)", () => {
  const C = "9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b";
  beforeEach(() => {
    h.segments = [...(h.segments as CustomerSegment[]), segment("seg-lead", "Lead", { stage: "lead" }), segment("seg-c", "got P", { campaign: `${PARENT}:sent` })];
    h.campaigns.set(PARENT, { ...campaign(PARENT, "We miss you"), audience: "segment", segmentId: "seg-lead", lockedAt: "2026-11-01T00:00:00Z" });
    h.campaigns.set(C, { ...campaign(C, "C"), audience: "segment", segmentId: "seg-c" });
  });

  it("hands the editor the draft to slot in front of, with the stage, and nothing of any Segment's filters", async () => {
    const p = await newPage({ after: `${PARENT}:sent`, before: C });
    expect(p.slotBefore).toEqual({ before: { id: C, name: "C" }, after: { campaignId: PARENT, did: "sent" }, stage: "lead" });
  });

  it("ignores before without a valid after, or naming a started campaign", async () => {
    expect((await newPage({ before: C })).slotBefore).toBeNull();
    h.campaigns.set(C, { ...campaign(C, "C"), audience: "segment", segmentId: "seg-c", lockedAt: "2026-11-02T00:00:00Z" });
    expect((await newPage({ after: `${PARENT}:sent`, before: C })).slotBefore).toBeNull();
  });
});
