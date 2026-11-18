import { describe, expect, it } from "vitest";
import { filtersKey } from "@/lib/crm/filters-key";
import { parseSegmentFilters, SEGMENT_NAME_MAX } from "@/lib/crm/segment-rules";
import { EMPTY_CAMPAIGN_DRAFT } from "../rules";
import { newCampaignFromAddress } from "../starters";
import { afterParam, followUpWanted, LOST_STAGE_NOTE, stageWanted, wantedToCreate, type MatchableSegment } from "../wanted-segment";

/**
 * Create from the funnel (PRD-email-funnel slice 06): New campaign at
 * `?stage=<stage>` and `?after=<campaign id>:<did>` wants a Segment, found by
 * exactly its filters on the server (a Segment that needs review never), or
 * offered to be created; with `?starter=` and `?segment=`, one Audience wins.
 */

const A = "7c0a1e2b-3d4f-4a5b-8c6d-9e0f1a2b3c4d";
type Parent = { id: string; name: string; archivedAt: string | null };
const PARENT: Parent = { id: A, name: "We miss you", archivedAt: null };
const seg = (id: string, name: string, filters: string, needsReview = false): MatchableSegment & { needsReview: boolean } => ({
  id,
  name,
  needsReview,
  filtersKey: needsReview ? null : filtersKey(filters),
});
const counter = () => {
  let n = 0;
  return () => `b${++n}`;
};
const open = (query: Record<string, string>, segments: ReturnType<typeof seg>[], parent: Parent | null = null) =>
  newCampaignFromAddress(query, segments, parent, counter());

const SEGMENTS = [
  seg("seg-risk-near", "At risk · 12 to 24 months", "stage=at-risk&last_order=within:24"),
  seg("seg-lapsed", "At risk · Lapsed", "stage=at-risk:lapsed"),
  seg("seg-risk", "Lapsing customers", "stage=at-risk"),
  seg("seg-loyal", "Loyal", "stage=loyal"),
  seg("seg-sent", "We miss you · got it", `campaign=${A}:sent`),
  seg("seg-nc", "Didn't click the win-back", `campaign=${A}:not-clicked`),
];

describe("?stage=<stage>", () => {
  it("chooses the Segment with exactly stage=at-risk, not one narrower or on a sub-status", () => {
    const { draft, wanted } = open({ stage: "at-risk" }, SEGMENTS);
    expect(draft).toMatchObject({ audience: "segment", segmentId: "seg-risk", name: "" });
    expect(wanted).toMatchObject({ name: "At risk", filters: "stage=at-risk" });
    // Only those two: the stage's Segment is missing.
    const without = SEGMENTS.filter((s) => s.id !== "seg-risk");
    expect(open({ stage: "at-risk" }, without).draft).toMatchObject({ audience: "segment", segmentId: null });
  });

  it("never chooses a Segment that needs review", () => {
    expect(open({ stage: "loyal" }, [seg("seg-review", "Loyal", "stage=loyal", true)]).draft.segmentId).toBeNull();
  });

  it("names a missing Segment after the stage, with exactly the stage filter, which the Segments' create accepts", () => {
    for (const [param, name] of [["lead", "Lead"], ["new", "New"], ["loyal", "Loyal"], ["at-risk", "At risk"]] as const) {
      const r = stageWanted(param);
      if (!r || !("wanted" in r)) throw new Error(param);
      expect(wantedToCreate(r.wanted)).toEqual({ name, filters: { stage: param } });
      expect(parseSegmentFilters(wantedToCreate(r.wanted).filters)).toEqual({ ok: true, params: { stage: param } });
    }
  });

  it("refuses Lost in words: no Segment, the empty campaign", () => {
    const r = open({ stage: "lost" }, [...SEGMENTS, seg("seg-lost", "Lost", "stage=lost")]);
    expect(r.wanted).toBeNull();
    expect(r.note).toBe(LOST_STAGE_NOTE);
    expect(r.draft).toBe(EMPTY_CAMPAIGN_DRAFT);
  });

  it("ignores a sub-status, an unknown value and a Customers-list spelling of two stages", () => {
    for (const stage of ["at-risk:lapsed", "nope", "at_risk", "at-risk,loyal", ""]) {
      const r = open({ stage }, SEGMENTS);
      expect(r, stage).toMatchObject({ wanted: null, note: null });
      expect(r.draft, stage).toBe(EMPTY_CAMPAIGN_DRAFT);
    }
  });
});

describe("?after=<campaign id>:<did>", () => {
  it("chooses the Segment with exactly campaign=<id>:not-clicked", () => {
    const { draft, wanted } = open({ after: `${A}:not-clicked` }, SEGMENTS, PARENT);
    expect(draft).toMatchObject({ audience: "segment", segmentId: "seg-nc" });
    expect(wanted).toMatchObject({ name: "We miss you · didn't click", filters: `campaign=${A}:not-clicked`, who: "This follow-up campaign" });
    expect(open({ after: `${A.toUpperCase()}:sent` }, SEGMENTS, PARENT).draft.segmentId).toBe("seg-sent");
  });

  it("names a missing one from the campaign and what they did, its filter accepted by the Segments' create for a campaign not yet started", () => {
    for (const [state, name] of [["sent", "We miss you · got it"], ["clicked", "We miss you · clicked it"], ["not-clicked", "We miss you · didn't click"]] as const) {
      const r = open({ after: `${A}:${state}` }, [], PARENT);
      expect(r.draft.segmentId, state).toBeNull();
      expect(r.wanted!.note, state).toContain("after the Rest period");
      expect(wantedToCreate(r.wanted!)).toEqual({ name, filters: { campaign: `${A}:${state}` } });
      // The server checks the filter's form, not whether the campaign has started.
      expect(parseSegmentFilters(wantedToCreate(r.wanted!).filters)).toEqual({ ok: true, params: { campaign: `${A}:${state}` } });
    }
  });

  it("ignores not-sent, a malformed value, an unknown campaign and an archived one", () => {
    for (const [after, parent] of [
      [`${A}:not-sent`, PARENT],
      [`${A}:opened`, PARENT],
      ["not-a-uuid:sent", PARENT],
      [`${A}:sent`, null],
      [`${A}:sent`, { ...PARENT, archivedAt: "2026-11-01T00:00:00Z" }],
      [`${A}:sent`, { ...PARENT, id: "8d1b2f3c-4e5a-4b6c-9d7e-0f1a2b3c4d5e" }],
    ] as const) {
      const r = open({ after }, SEGMENTS, parent);
      expect(r, after).toMatchObject({ wanted: null, note: null });
      expect(r.draft, after).toBe(EMPTY_CAMPAIGN_DRAFT);
    }
    expect(afterParam(`${A}:not-sent`)).toBeNull();
  });

  it("cuts the name to the Segment name limit, keeping what they did", () => {
    const long = { ...PARENT, name: "x".repeat(120) };
    const w = followUpWanted(afterParam(`${A}:not-clicked`), long, [])!;
    expect(w.name).toHaveLength(SEGMENT_NAME_MAX);
    expect(w.name.endsWith(" · didn't click")).toBe(true);
  });

  it("makes the name unique against Segments with other filters, in any case, and not against one with its own", () => {
    const taken = [seg("s1", "we miss you · DIDN'T CLICK", "stage=loyal"), seg("s2", "We miss you · didn't click (2)", "stage=new")];
    expect(followUpWanted(afterParam(`${A}:not-clicked`), PARENT, taken)!.name).toBe("We miss you · didn't click (3)");
    const long = followUpWanted(afterParam(`${A}:not-clicked`), { ...PARENT, name: "y".repeat(90) }, [seg("s3", `${"y".repeat(65)} · didn't click`, "stage=new")])!;
    expect(long.name).toBe(`${"y".repeat(61)} · didn't click (2)`);
    expect(long.name.length).toBeLessThanOrEqual(SEGMENT_NAME_MAX);
    // Its own filters under its name: found, not renamed.
    expect(followUpWanted(afterParam(`${A}:not-clicked`), PARENT, [seg("s4", "We miss you · didn't click", `campaign=${A}:not-clicked`)])!.name).toBe(
      "We miss you · didn't click",
    );
  });
});

describe("which Audience wins", () => {
  // A Starter with its own Audience; then ?after=; then ?stage=; then ?segment=.
  const SEGMENT = { segment: "seg-loyal" };
  it("a Starter with its own Audience beats ?after=, ?stage= and ?segment=", () => {
    const r = open({ starter: "playbook_welcome_back", after: `${A}:not-clicked`, stage: "loyal", ...SEGMENT }, SEGMENTS, PARENT);
    expect(r.draft).toMatchObject({ name: "Welcome back", audience: "segment", segmentId: "seg-lapsed", includeUnengaged: true });
    expect(r.wanted).toMatchObject({ name: "At risk · Lapsed", playbook: true });
    const invitation = open({ starter: "sign_in_invitation", stage: "loyal" }, SEGMENTS);
    expect(invitation.draft).toMatchObject({ audience: "imported_not_signed_in" });
    expect(invitation.wanted).toBeNull();
  });

  it("?after= beats ?stage= (Lost's note included) and ?segment=", () => {
    const r = open({ after: `${A}:not-clicked`, stage: "lost", ...SEGMENT }, SEGMENTS, PARENT);
    expect(r).toMatchObject({ note: null, wanted: { filters: `campaign=${A}:not-clicked` } });
    expect(r.draft).toMatchObject({ audience: "segment", segmentId: "seg-nc", name: "" });
  });

  it("?stage= beats ?segment=", () => {
    expect(open({ stage: "at-risk", ...SEGMENT }, SEGMENTS).draft).toMatchObject({ audience: "segment", segmentId: "seg-risk", name: "" });
  });

  it("?segment= stands alone, and a Starter with no Audience keeps whichever won", () => {
    expect(open(SEGMENT, SEGMENTS).draft).toMatchObject({ audience: "segment", segmentId: "seg-loyal", name: "Loyal" });
    const r = open({ starter: "short_note", stage: "at-risk", ...SEGMENT }, SEGMENTS);
    expect(r.draft).toMatchObject({ audience: "segment", segmentId: "seg-risk" });
    expect(r.draft.content?.blocks.map((b) => b.type)).toEqual(["heading", "text", "buttons"]);
    expect(r.wanted).toMatchObject({ name: "At risk" });
  });

  it("finds every offered Playbook's Segment for the editor, by key, never sending a Segment's filters", () => {
    const { found } = open({ stage: "at-risk" }, SEGMENTS);
    expect(found).toEqual({
      [filtersKey("stage=at-risk&last_order=within:24")!]: "seg-risk-near",
      [filtersKey("stage=at-risk:lapsed")!]: "seg-lapsed",
      [filtersKey("stage=loyal")!]: "seg-loyal",
      [filtersKey("stage=at-risk")!]: "seg-risk",
    });
  });
});
