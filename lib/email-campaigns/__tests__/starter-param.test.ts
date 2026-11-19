import { describe, expect, it } from "vitest";
import { filtersKey } from "@/lib/crm/filters-key";
import { parseSegmentFilters } from "@/lib/crm/segment-rules";
import { campaignWordsOf } from "../clear-all";
import { EMPTY_CAMPAIGN_DRAFT, newCampaignDraft, type CampaignDraft } from "../rules";
import {
  APPROVED_PLAYBOOKS,
  PLAYBOOK_DRAFTS,
  PLAYBOOK_STARTERS,
  playbookSegment,
  playbookSegmentToCreate,
  startedFrom,
  startedFromParam,
  starterById,
  STARTERS,
  playbooksFound,
  type Starter,
} from "../starters";
import type { MatchableSegment } from "../wanted-segment";

/**
 * *Set up a step* (PRD-email-funnel slice 04): New campaign at
 * `?starter=<id>` starts the email as the Start panel does, only from a
 * Starter that is offered, and finds a Playbook's Segment by its filters,
 * never by its name alone. What *Create the Segment* sends is the Playbook's
 * name and exact filters, which the Segments' create accepts as they are.
 */

/** Block ids 1, 2, 3…, so two starts can be compared. */
const counter = () => {
  let n = 0;
  return () => `b${++n}`;
};
/** A draft as the editor holds it (its history's first step). */
const asEditor = (d: CampaignDraft) => ({
  ...campaignWordsOf(d),
  greeting: d.greeting,
  audience: d.audience,
  segmentId: d.segmentId ?? "",
  excludeSegmentIds: d.excludeSegmentIds ?? [],
  includeUnengaged: d.includeUnengaged ?? false,
});
/** What the server tells the editor, from these Segments (`playbooksFound`). */
const found = (segments: readonly MatchableSegment[]) => playbooksFound(segments);
const segment = (id: string, name: string, filters: string): MatchableSegment => ({ id, name, filtersKey: filtersKey(filters) });
const playbook = (id: string): Starter => {
  const s = starterById(id);
  if (!s) throw new Error(`${id} is not offered`);
  return s;
};

const SEGMENTS = [
  segment("seg-new", "New · delivered over 60 days ago", "stage=new&delivered=over:60"),
  segment("seg-loyal", "Loyal", "stage=loyal"),
  segment("seg-risk", "At risk · 12 to 24 months", "stage=at-risk&last_order=within:24"),
  segment("seg-lapsed", "At risk · Lapsed", "stage=at-risk:lapsed"),
];

describe("?starter=<id>", () => {
  it("gives playbook_second_purchase the same draft as choosing it in the Start panel", () => {
    const s = playbook("playbook_second_purchase");
    const fromParam = startedFromParam(EMPTY_CAMPAIGN_DRAFT, "playbook_second_purchase", found(SEGMENTS), counter());
    const fromPanel = startedFrom(asEditor(EMPTY_CAMPAIGN_DRAFT), s, s.blocks(counter()), found(SEGMENTS));
    expect(asEditor(fromParam)).toEqual(fromPanel);
    expect(fromParam).toMatchObject({ name: "Second purchase: caring for your pillow", audience: "segment", segmentId: "seg-new", includeUnengaged: false });
  });

  it("gives every offered Starter the Start panel's draft, with its Segment or without, and from ?segment= too", () => {
    const bases = [EMPTY_CAMPAIGN_DRAFT, newCampaignDraft("seg-loyal", [{ id: "seg-loyal", name: "Loyal", needsReview: false }])];
    for (const s of STARTERS) {
      for (const segments of [SEGMENTS, []]) {
        for (const base of bases) {
          const fromParam = startedFromParam(base, s.id, found(segments), counter());
          expect(asEditor(fromParam), s.id).toEqual(startedFrom(asEditor(base), s, s.blocks(counter()), found(segments)));
        }
      }
    }
  });

  it("leaves the empty draft for an unknown id and for a Playbook the owner has not approved", () => {
    expect(startedFromParam(EMPTY_CAMPAIGN_DRAFT, "no_such_starter", found(SEGMENTS))).toBe(EMPTY_CAMPAIGN_DRAFT);
    expect(startedFromParam(EMPTY_CAMPAIGN_DRAFT, undefined, found(SEGMENTS))).toBe(EMPTY_CAMPAIGN_DRAFT);
    expect(startedFromParam(EMPTY_CAMPAIGN_DRAFT, "", found(SEGMENTS))).toBe(EMPTY_CAMPAIGN_DRAFT);
    // A real draft, written and waiting for the owner: not offered, so not started.
    expect(PLAYBOOK_DRAFTS.some((p) => p.id === "playbook_how_its_made")).toBe(true);
    expect(APPROVED_PLAYBOOKS.has("playbook_how_its_made")).toBe(false);
    expect(startedFromParam(EMPTY_CAMPAIGN_DRAFT, "playbook_how_its_made", found([segment("seg-lead", "Lead", "stage=lead")]))).toBe(EMPTY_CAMPAIGN_DRAFT);
  });

  it("reads the first of a repeated parameter", () => {
    expect(startedFromParam(EMPTY_CAMPAIGN_DRAFT, ["playbook_thank_you", "playbook_we_miss_you"], found(SEGMENTS), counter()).name).toBe("Thank you: what's new, and your points");
  });

  it("with ?segment=, keeps that Segment for a Starter with no audience, and sends a Playbook to its own", () => {
    const base = newCampaignDraft("seg-loyal", [{ id: "seg-loyal", name: "Loyal", needsReview: false }]);
    expect(startedFromParam(base, "short_note", found(SEGMENTS), counter())).toMatchObject({ name: "Loyal", audience: "segment", segmentId: "seg-loyal" });
    expect(startedFromParam(base, "playbook_we_miss_you", found(SEGMENTS), counter())).toMatchObject({ audience: "segment", segmentId: "seg-risk" });
    // Its own Segment missing: the Playbook's audience still wins, its Segment left to choose (the editor offers to create it).
    expect(startedFromParam(base, "playbook_we_miss_you", found([]), counter())).toMatchObject({ audience: "segment", segmentId: null });
  });
});

describe("a Playbook's Segment", () => {
  const weMissYou = () => playbook("playbook_we_miss_you");

  it("is the Segment with its filters under another name", () => {
    const renamed = segment("seg-x", "Lapsing regulars", "last_order=within:24&stage=at-risk");
    expect(playbookSegment(weMissYou(), [segment("seg-loyal", "Loyal", "stage=loyal"), renamed])).toBe(renamed);
    expect(startedFromParam(EMPTY_CAMPAIGN_DRAFT, "playbook_we_miss_you", found([renamed]), counter()).segmentId).toBe("seg-x");
  });

  it("is not a Segment with its name and other filters", () => {
    const sameName = segment("seg-y", "At risk · 12 to 24 months", "stage=at-risk");
    expect(playbookSegment(weMissYou(), [sameName])).toBeNull();
    expect(startedFromParam(EMPTY_CAMPAIGN_DRAFT, "playbook_we_miss_you", found([sameName]), counter())).toMatchObject({ audience: "segment", segmentId: null });
  });

  it("among Segments with its filters, is the one with its name", () => {
    const other = segment("seg-a", "A copy", "stage=at-risk&last_order=within:24");
    const named = segment("seg-b", "At risk · 12 to 24 months", "stage=at-risk&last_order=within:24");
    expect(playbookSegment(weMissYou(), [other, named])).toBe(named);
  });

  it("is never a Segment that needs review", () => {
    expect(playbookSegment(weMissYou(), [{ id: "seg-z", name: "At risk · 12 to 24 months", filtersKey: null }])).toBeNull();
  });
});

describe("Create the Segment", () => {
  it("sends each Playbook's name and exact filters, which the Segments' create saves as they are", () => {
    for (const p of PLAYBOOK_STARTERS) {
      if (p.audience?.audience !== "segment") throw new Error(`${p.id} has no Segment`);
      const body = playbookSegmentToCreate(p)!;
      expect(body.name, p.id).toBe(p.audience.segment);
      expect(new URLSearchParams(body.filters).toString(), p.id).toBe(new URLSearchParams(p.audience.filters).toString());
      const saved = parseSegmentFilters(body.filters);
      if (!saved.ok) throw new Error(`${p.id}: ${saved.error}`);
      // Once saved, the Playbook finds it, so a second visit offers no second create.
      expect(playbookSegment(p, [{ id: "made", name: body.name, filtersKey: filtersKey(saved.params) }])?.id, p.id).toBe("made");
    }
  });

  it("leaves Include unengaged on the campaign, out of the Segment's filters", () => {
    expect(playbookSegmentToCreate(playbook("playbook_welcome_back"))).toEqual({ name: "At risk · Lapsed", filters: { stage: "at-risk:lapsed" } });
  });

  it("has nothing to create for a Starter not written for a Segment", () => {
    expect(playbookSegmentToCreate(playbook("short_note"))).toBeNull();
    expect(playbookSegmentToCreate(playbook("sign_in_invitation"))).toBeNull();
  });
});
