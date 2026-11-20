import { describe, expect, it } from "vitest";
import type { WantedSegment } from "@/lib/email-campaigns/wanted-segment";
import { keptDraft, keptOf, type EditorDraft } from "../kept-draft";

const DRAFT: EditorDraft = {
  name: "We miss you",
  subject: "It's been a while",
  preheader: "",
  body: "",
  button: { choice: "none", label: "", url: "" },
  content: null,
  greeting: true,
  audience: "segment",
  segmentId: "",
  excludeSegmentIds: [],
  includeUnengaged: false,
  wanted: { address: { stage: "at-risk" }, name: "At risk", filters: "stage=at-risk", who: "This stage" } as WantedSegment,
  audienceNote: "A campaign to Lost would reach nobody.",
};

describe("keptOf", () => {
  it("keeps neither the wanted Segment nor the address's note", () => {
    const kept = keptOf(DRAFT);
    const json = JSON.stringify(kept);
    expect(json).not.toContain("wanted");
    expect(json).not.toContain("audienceNote");
    expect(json).not.toContain("stage=at-risk");
    expect(json).not.toContain("would reach nobody");
    expect(kept.email).not.toHaveProperty("wanted");
    expect(kept.email).not.toHaveProperty("audienceNote");
    expect(keptDraft(JSON.parse(json))).toEqual(kept);
  });
});
