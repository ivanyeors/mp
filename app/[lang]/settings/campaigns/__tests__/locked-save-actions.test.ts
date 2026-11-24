import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Campaign, CampaignDraftInput } from "@/lib/email-campaigns/rules";

const ID = "5a1d3c2e-7b4f-4e6a-9c8d-0f1e2d3c4b5a";
const SHOWN = "69990d5e-7442-476c-8cde-ff6bebd77c26";
const ADDED = "6ed1e9c4-c85a-4e8a-9b85-ebd9cea90c7f";

const h = vi.hoisted(() => ({ campaign: null as unknown as Campaign, updated: [] as { name: string; locked: boolean }[] }));

vi.mock("@/lib/auth/admin", () => ({
  assertAdmin: vi.fn(async () => ({ permissions: new Set(["campaigns"]), email: "owner@mpillow.com", memberId: "m1", userId: "u1" })),
}));
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));
vi.mock("@/lib/email-campaigns/images", () => ({ readCampaignImages: vi.fn(async () => ({ images: {}, failed: [] })), campaignImageFieldErrors: vi.fn(() => ({})) }));
vi.mock("@/lib/email-campaigns/audience-refusal", () => ({ audienceRefusal: vi.fn(async () => null) }));
vi.mock("@/lib/media-assets", () => ({ touchLastUsed: vi.fn(async () => undefined) }));
vi.mock("@/lib/email-campaigns/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email-campaigns/store")>()),
  getCampaign: vi.fn(async () => h.campaign),
  updateCampaign: vi.fn(async (_admin: unknown, _id: string, draft: { name: string }, locked: boolean) => void h.updated.push({ name: draft.name, locked })),
}));

const { saveCampaign } = await import("../actions");
const { campaignFromRow } = await import("@/lib/email-campaigns/rules");

const row = (lockedAt: string | null) => ({
  id: ID,
  name: "We've Moved!",
  subject: "We've moved",
  preheader: null,
  body: null,
  content: {
    v: 1,
    blocks: [
      { id: "title", text: "A New Home for Better Sleep!", type: "heading", level: 2 },
      { id: "words", type: "text", paragraphs: [{ kind: "p", runs: [{ text: "Find us at our new studio." }] }] },
      { id: "book", type: "buttons", buttons: [{ url: "https://www.mpillow.com/en-US/appointments", label: "Book My Appointment Now", style: "primary", target: "url" }] },
      { id: "door", type: "image", image: { alt: "", asset: SHOWN, decorative: true }, width: "full" },
    ],
    fallbacks: {},
  },
  greeting: true,
  button_label: null,
  button_target: null,
  button_url: null,
  audience: "subscribed",
  segment_id: null,
  exclude_segment_ids: [],
  include_unengaged: false,
  created_at: "2026-11-23T08:21:50Z",
  updated_at: "2026-11-23T14:04:48Z",
  locked_at: lockedAt,
  archived_at: null,
});

const asEditorSends = (c: Campaign): CampaignDraftInput => JSON.parse(JSON.stringify({
  name: c.name,
  subject: c.subject,
  preheader: c.preheader,
  body: "",
  content: c.content,
  greeting: c.greeting,
  audience: c.audience,
  segmentId: c.segmentId,
  excludeSegmentIds: c.excludeSegmentIds,
  includeUnengaged: c.includeUnengaged,
  button: null,
}));

const withAnotherImage = (input: CampaignDraftInput): CampaignDraftInput => ({
  ...input,
  content: { ...input.content!, blocks: [...input.content!.blocks, { id: "more", type: "image", image: { asset: ADDED, alt: "Our new studio" }, width: "full" }] },
});

beforeEach(() => {
  h.updated = [];
});

describe("saving a campaign that has started sending", () => {
  it("refuses a changed email by saying so, instead of saving the name and answering Saved", async () => {
    h.campaign = campaignFromRow(row("2026-11-24T03:00:00Z"))!;
    const res = await saveCampaign(ID, withAnotherImage(asEditorSends(h.campaign)));
    expect(res).toEqual({ ok: false, error: expect.stringMatching(/^This campaign has started sending, .*not saved\. Duplicate it/) });
    expect(h.updated).toEqual([]);
  });

  it("still saves a new name when nothing else changed, whatever order the stored email's keys come back in", async () => {
    h.campaign = campaignFromRow(row("2026-11-24T03:00:00Z"))!;
    const res = await saveCampaign(ID, { ...asEditorSends(h.campaign), name: "We've Moved! (sent)" });
    expect(res).toEqual({ ok: true, id: ID });
    expect(h.updated).toEqual([{ name: "We've Moved! (sent)", locked: true }]);
  });

  it("saves the added image of a draft as before", async () => {
    h.campaign = campaignFromRow(row(null))!;
    const res = await saveCampaign(ID, withAnotherImage(asEditorSends(h.campaign)));
    expect(res).toEqual({ ok: true, id: ID });
    expect(h.updated).toEqual([{ name: "We've Moved!", locked: false }]);
  });
});
