import { describe, expect, it } from "vitest";
import { segmentCampaignHref, segmentHref } from "@/lib/crm/segment-rules";
import { CampaignDraftSchema, EMPTY_CAMPAIGN_DRAFT, newCampaignDraft } from "@/lib/email-campaigns/rules";

/**
 * PRD-crm-retention-loop slice 02: a Segment hands off to a new campaign, and
 * a campaign's Segment hands back to its Customers list.
 */

const LIVE = { id: "5e000000-0000-4000-8000-000000000001", name: "Premium, lapsed", needsReview: false };
const REVIEW = { id: "5e000000-0000-4000-8000-000000000002", name: "Old region", needsReview: true };

describe("segmentCampaignHref", () => {
  it("opens a new campaign sent to the Segment", () => {
    expect(segmentCampaignHref("/en-US/settings/campaigns/new", LIVE)).toBe(
      `/en-US/settings/campaigns/new?segment=${LIVE.id}`,
    );
  });

  it("offers nothing without campaigns, or for a Segment that needs review", () => {
    expect(segmentCampaignHref(undefined, LIVE)).toBeNull();
    expect(segmentCampaignHref("/en-US/settings/campaigns/new", REVIEW)).toBeNull();
  });
});

describe("segmentHref", () => {
  it("is the list with the Segment's filters, or the bare list without any", () => {
    expect(segmentHref("/en-US/settings/customers", { bought: "premium", last_order: "over:12" })).toBe(
      "/en-US/settings/customers?bought=premium&last_order=over%3A12",
    );
    expect(segmentHref("/en-US/settings/customers", {})).toBe("/en-US/settings/customers");
  });
});

describe("newCampaignDraft", () => {
  it("starts a blank draft sent to a live Segment, named after it", () => {
    const draft = newCampaignDraft(LIVE.id, [LIVE, REVIEW]);
    expect(draft).toEqual({
      name: "Premium, lapsed",
      subject: "",
      preheader: null,
      body: "",
      // Written in blocks, none yet (PRD-campaign-email-editor slice 03).
      content: { v: 1, blocks: [], fallbacks: {} },
      greeting: true,
      button: null,
      audience: "segment",
      segmentId: LIVE.id,
    });
    // Blank on purpose: it does not save until Staff write the email.
    expect(CampaignDraftSchema.safeParse(draft).success).toBe(false);
    const written = { ...draft, subject: "Hello", content: { ...draft.content!, blocks: [{ id: "h", type: "heading" as const, level: 1 as const, text: "Hi" }] } };
    expect(CampaignDraftSchema.safeParse(written).success).toBe(true);
  });

  it("starts the empty draft for anything else (PRD-campaign-email-editor slice 01)", () => {
    for (const param of [undefined, "", "not-a-uuid", "5e000000-0000-4000-8000-000000000099", REVIEW.id]) {
      expect(newCampaignDraft(param, [LIVE, REVIEW]), String(param)).toBe(EMPTY_CAMPAIGN_DRAFT);
    }
  });

  it("reads the first value of a repeated parameter", () => {
    expect(newCampaignDraft([LIVE.id, REVIEW.id], [LIVE, REVIEW]).segmentId).toBe(LIVE.id);
  });

  it("keeps a long Segment name inside the campaign name's limit", () => {
    const long = { ...LIVE, name: "x".repeat(200) };
    expect(newCampaignDraft(long.id, [long]).name).toHaveLength(80);
  });
});
