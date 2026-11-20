import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Campaign } from "@/lib/email-campaigns/rules";

const ID = "5a1d3c2e-7b4f-4e6a-9c8d-0f1e2d3c4b5a";
const STAFF = "5e000000-0000-4000-8000-0000000000a1";
const RECENT = "5e000000-0000-4000-8000-0000000000b2";
const GONE = "5e000000-0000-4000-8000-0000000000c3";

const h = vi.hoisted(() => ({
  campaign: null as unknown as Campaign,
  archived: new Set<string>(),
  seen: [] as { segmentId: string; name: string; ids: string[] }[],
}));

vi.mock("@/lib/auth/admin", () => ({
  assertAdmin: vi.fn(async () => ({ permissions: new Set(["campaigns"]), email: "owner@mpillow.com", memberId: "m1", userId: "u1" })),
}));
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));
vi.mock("@/lib/email-campaigns/setup", () => ({ campaignSenderSetup: () => ({ origin: "https://custom.mpillow.com", admin: {} }) }));
vi.mock("@/lib/email-campaigns/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email-campaigns/store")>()),
  getCampaign: vi.fn(async () => h.campaign),
  lockCampaign: vi.fn(),
}));
vi.mock("@/lib/crm/segments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/crm/segments")>();
  const NAMES: Record<string, string> = {
    "5e000000-0000-4000-8000-0000000000a1": "Staff and test accounts",
    "5e000000-0000-4000-8000-0000000000b2": "Bought in the last 14 days",
  };
  return {
    ...actual,
    getSegment: vi.fn(async (id: string) =>
      NAMES[id] ? { id, name: NAMES[id], filters: {}, filtersVersion: 2, archivedAt: h.archived.has(id) ? "2026-10-30T00:00:00Z" : null } : null,
    ),
    resolveSegment: vi.fn(async function* (id: string) {
      if (!NAMES[id]) throw new actual.SegmentUnavailableError("not_found");
      if (h.archived.has(id)) throw new actual.SegmentUnavailableError("archived");
      yield [`${id}-member`];
    }),
  };
});
vi.mock("@/lib/email-campaigns/sender", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email-campaigns/sender")>()),
  planWave: vi.fn(
    async (
      _campaign: unknown,
      _options: unknown,
      _setup: unknown,
      _segmentIds: unknown,
      exclusions: { segmentId: string; name: string; ids: () => AsyncIterable<string[]> }[] = [],
    ) => {
      for (const x of exclusions) {
        const ids: string[] = [];
        for await (const page of x.ids()) ids.push(...page);
        h.seen.push({ segmentId: x.segmentId, name: x.name, ids });
      }
      return {
        readiness: { checks: [], advice: [], ready: false, allowance: null, sender: { from: null, replyTo: null } },
        wave: "w1",
        plan: { considered: 0, eligible: 0, eligibleBuyers: 0, excluded: {}, alreadySent: 0, failed: 0, eligibleChinese: 0, selectedChinese: 0 },
        customerIds: [],
        requested: 1,
        limitedBy: null,
        waiting: 0,
        leftOutBySegment: [],
        fit: [],
      };
    },
  ),
}));

const { planCampaignWave } = await import("../actions");

const campaign = (excludeSegmentIds: string[]): Campaign => ({
  name: "December",
  subject: "Sleep cooler",
  preheader: null,
  body: "",
  content: { v: 1, blocks: [{ id: "title", type: "heading", level: 1, text: "Sleep cooler" }], fallbacks: {} },
  greeting: true,
  button: null,
  audience: "subscribed",
  segmentId: null,
  excludeSegmentIds,
  includeUnengaged: false,
  id: ID,
  createdAt: "2026-10-21T00:00:00Z",
  updatedAt: "2026-10-21T00:00:00Z",
  lockedAt: null,
  archivedAt: null,
  createdBy: null,
});

beforeEach(() => {
  h.archived.clear();
  h.seen.length = 0;
});

describe("planCampaignWave, leaving Segments out", () => {
  it("passes each left-out Segment by name, in the campaign's order, with its Customers", async () => {
    h.campaign = campaign([RECENT, STAFF]);
    expect(await planCampaignWave(ID, { size: 1 })).toMatchObject({ ok: true });
    expect(h.seen).toEqual([
      { segmentId: RECENT, name: "Bought in the last 14 days", ids: [`${RECENT}-member`] },
      { segmentId: STAFF, name: "Staff and test accounts", ids: [`${STAFF}-member`] },
    ]);
  });

  it("refuses the wave by name when a left-out Segment is archived", async () => {
    h.campaign = campaign([STAFF]);
    h.archived.add(STAFF);
    const answer = await planCampaignWave(ID, { size: 1 }, true);
    expect(answer).toEqual({
      ok: false,
      error: "It leaves out “Staff and test accounts”, which cannot be used: This Segment is archived. Take it out of Leave out, or fix the Segment.",
    });
  });

  it("refuses the wave when a left-out Segment is gone", async () => {
    h.campaign = campaign([GONE]);
    const answer = await planCampaignWave(ID, { size: 1 }, true);
    expect(answer).toMatchObject({ ok: false, error: expect.stringContaining("“a Segment that no longer exists”") });
  });

  it("leaves nobody out without exclusions", async () => {
    h.campaign = campaign([]);
    await planCampaignWave(ID, { size: 1 });
    expect(h.seen).toEqual([]);
  });
});
