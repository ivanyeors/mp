import { describe, expect, it } from "vitest";
import { buildFunnel, type FunnelCampaignFact, type FunnelFacts, type FunnelSegmentFact } from "../model";
import { planArrangement, planMove, type FunnelMove } from "../move";

/**
 * Arranging the Email flow (PRD-email-funnel slice 07): a move changes only
 * the *Campaign* filter of the drafts it touches, as a list whose gaps close,
 * in an order that never makes a cycle; it refuses in words what cannot move.
 */

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const seg = (n: number, name: string, params: Record<string, string>, needsReview = false): FunnelSegmentFact => ({
  id: id(n),
  name,
  params,
  count: 1,
  needsReview,
});
const camp = (n: number, name: string, segment: number | null, started = false): FunnelCampaignFact => ({
  campaign: {
    id: id(n),
    name,
    subject: "",
    audience: segment === null ? "subscribed" : "segment",
    segmentId: segment === null ? null : id(segment),
    excludeSegmentIds: [],
    lockedAt: started ? "2026-11-01T02:00:00Z" : null,
    createdAt: `2026-10-${String(10 + (n % 20)).padStart(2, "0")}T02:00:00Z`,
  },
  stats: { handed: 0, firstSentAt: null, lastSentAt: null },
});
const facts = (segments: FunnelSegmentFact[], campaigns: FunnelCampaignFact[]) => ({ segments, campaigns });
const move = (campaignId: number, after: [number, "sent" | "clicked" | "not-clicked"] | null, before: number | null = null, stage: FunnelMove["stage"] = "lead"): FunnelMove => ({
  campaignId: id(campaignId),
  stage,
  after: after ? { campaignId: id(after[0]), did: after[1] } : null,
  before: before === null ? null : id(before),
});
const ok = (p: ReturnType<typeof planMove>) => {
  if (!p.ok) throw new Error(p.error);
  return p.changes;
};
const byCampaign = (changes: ReturnType<typeof ok>) => Object.fromEntries(changes.map((c) => [c.campaignId, c]));

// A chain of three drafts on Lead: A (the stage's Segment) → B (got A) → C (clicked B).
const chain = () =>
  facts(
    [seg(1, "Lead", { stage: "lead" }), seg(2, "Lead · got “A”", { campaign: `${id(10)}:sent` }), seg(3, "Lead · clicked “B”", { campaign: `${id(11)}:clicked` })],
    [camp(10, "A", 1), camp(11, "B", 2), camp(12, "C", 3)],
  );

describe("planMove", () => {
  it("swaps two drafts of a chain: the third dropped between the first and the second takes its place", () => {
    const changes = ok(planMove(chain(), move(12, [10, "sent"], 11)));
    expect(changes.map((c) => [c.campaignId, c.campaign])).toEqual([
      [id(12), { id: id(10), did: "sent" }],
      [id(11), { id: id(12), did: "sent" }],
    ]);
    expect(byCampaign(changes)[id(12)].filters).toEqual({ campaign: `${id(10)}:sent` });
    expect(byCampaign(changes)[id(11)].filters).toEqual({ campaign: `${id(12)}:sent` });
    // The page reads the result as A → C → B.
    const after = buildAfter(chain(), changes);
    const flow = after.stages.find((s) => s.stage === "lead")!.flow;
    expect(flow.find((f) => f.key === `campaign:${id(12)}`)!.after).toEqual({ campaignId: id(10), did: "sent" });
    expect(flow.find((f) => f.key === `campaign:${id(11)}`)!.after).toEqual({ campaignId: id(12), did: "sent" });
  });

  it("moves the first of a chain to its end: the second starts the sequence, with the stage when it had only a campaign filter", () => {
    const changes = ok(planMove(chain(), move(10, [12, "sent"])));
    expect(changes.map((c) => [c.campaignId, c.campaign])).toEqual([
      [id(11), null],
      [id(10), { id: id(12), did: "sent" }],
    ]);
    const b = byCampaign(changes);
    expect(b[id(11)].filters).toEqual({ stage: "lead" });
    expect(b[id(11)].segmentName).toBe("Lead");
    expect(b[id(10)].filters).toEqual({ stage: "lead", campaign: `${id(12)}:sent` });
  });

  it("slots a draft between P and its draft follow-up C, keeping C's condition and the draft's other filters", () => {
    const f = facts(
      [seg(1, "Lead", { stage: "lead" }), seg(2, "Lead · clicked “P”", { campaign: `${id(10)}:clicked` }), seg(3, "Lead premium", { stage: "lead", bought: "premium" })],
      [camp(10, "P", 1, true), camp(11, "C", 2), camp(12, "D", 3)],
    );
    const changes = ok(planMove(f, move(12, [10, "sent"], 11)));
    expect(changes.map((c) => [c.campaignId, c.campaign])).toEqual([
      [id(12), { id: id(10), did: "clicked" }],
      [id(11), { id: id(12), did: "sent" }],
    ]);
    // The stage filter and any other filter survive.
    expect(byCampaign(changes)[id(12)].filters).toEqual({ stage: "lead", bought: "premium", campaign: `${id(10)}:clicked` });
    // C's Segment has that name and other filters: the new one is made unique.
    expect(byCampaign(changes)[id(12)].segmentName).toBe("Lead · clicked “P” (2)");
  });

  it("drops after P whose follow-up has started: the draft becomes another follow-up of P; slotting in front of the started one is refused", () => {
    const f = facts(
      [seg(1, "Lead", { stage: "lead" }), seg(2, "Lead · got “P”", { stage: "lead", campaign: `${id(10)}:sent` }), seg(3, "Lead · tips", { stage: "lead", tags: "tips" })],
      [camp(10, "P", 1, true), camp(11, "S", 2, true), camp(12, "D", 3)],
    );
    const changes = ok(planMove(f, move(12, [10, "sent"])));
    expect(changes.map((c) => [c.campaignId, c.campaign])).toEqual([[id(12), { id: id(10), did: "sent" }]]);
    expect(changes[0].filters).toEqual({ stage: "lead", tags: "tips", campaign: `${id(10)}:sent` });
    const refused = planMove(f, move(12, [10, "sent"], 11));
    expect(refused).toMatchObject({ ok: false });
    expect(!refused.ok && refused.error).toContain("“S” stays where it is");
  });

  it("refuses a started campaign, in words", () => {
    const f = facts([seg(1, "Lead", { stage: "lead" })], [camp(10, "Started one", 1, true), camp(11, "D", 1)]);
    const p = planMove(f, move(10, [11, "sent"]));
    expect(p.ok).toBe(false);
    expect(!p.ok && p.error).toMatch(/^“Started one” stays where it is\. Started/);
  });

  it("refuses a Playbook's draft: its Segment is what makes it the Playbook", () => {
    const f = facts(
      [seg(1, "At risk · 12 to 24 months", { stage: "at-risk", last_order: "within:24" }), seg(2, "At risk", { stage: "at-risk" })],
      [camp(10, "We miss you", 1), camp(11, "Other", 2)],
    );
    const p = planMove(f, move(10, [11, "sent"], null, "at_risk"));
    expect(p.ok).toBe(false);
    expect(!p.ok && p.error).toContain("Playbook");
    // Another draft may follow it.
    expect(ok(planMove(f, move(11, [10, "sent"], null, "at_risk")))[0].campaign).toEqual({ id: id(10), did: "sent" });
  });

  it("refuses D onto its own started follow-up, and lets D follow its own draft follow-up", () => {
    const f = facts(
      [seg(1, "Lead", { stage: "lead" }), seg(2, "got D", { campaign: `${id(10)}:sent` }), seg(3, "clicked S", { campaign: `${id(11)}:clicked` })],
      [camp(10, "D", 1), camp(11, "S", 2, true), camp(12, "T", 3)],
    );
    const p = planMove(f, move(10, [11, "sent"]));
    expect(p.ok).toBe(false);
    expect(!p.ok && p.error).toContain("stays under “D”");
    // T (a draft under the started S) is still under D: refused too.
    expect(planMove(f, move(10, [12, "sent"])).ok).toBe(false);

    const g = facts(
      [seg(1, "Lead", { stage: "lead" }), seg(2, "got D", { campaign: `${id(10)}:clicked` })],
      [camp(10, "D", 1), camp(11, "E", 2)],
    );
    const changes = ok(planMove(g, move(10, [11, "sent"])));
    // E is re-pointed first (it starts the stage), then D follows it: no step is a cycle.
    expect(changes.map((c) => [c.campaignId, c.campaign])).toEqual([
      [id(11), null],
      [id(10), { id: id(11), did: "sent" }],
    ]);
  });

  it("keeps each re-pointed follow-up's own condition, and leaves a started follow-up under the moved draft", () => {
    const f = facts(
      [
        seg(1, "Lead", { stage: "lead" }),
        seg(2, "clicked X", { campaign: `${id(10)}:clicked` }),
        seg(3, "didn't click D", { campaign: `${id(11)}:not-clicked` }),
        seg(4, "got D", { campaign: `${id(11)}:sent` }),
      ],
      [camp(10, "X", 1), camp(11, "D", 2), camp(12, "E", 3), camp(13, "S", 4, true)],
    );
    const changes = ok(planMove(f, move(11, null)));
    expect(changes.map((c) => [c.campaignId, c.campaign])).toEqual([
      [id(12), { id: id(10), did: "not-clicked" }],
      [id(11), null],
    ]);
    expect(byCampaign(changes)[id(11)].filters).toEqual({ stage: "lead" });
  });

  it("changes only the condition when a draft stays after the same email, its follow-ups staying under it", () => {
    const changes = ok(planMove(chain(), move(11, [10, "clicked"])));
    expect(changes.map((c) => [c.campaignId, c.campaign])).toEqual([[id(11), { id: id(10), did: "clicked" }]]);
    expect(ok(planMove(chain(), move(11, [10, "sent"])))).toEqual([]);
  });

  it("refuses a Segment that needs review, a target not in this stage, and following itself", () => {
    const f = facts(
      [seg(1, "Lead", { stage: "lead" }), seg(2, "Old", { stage: "lead" }, true), seg(3, "At risk", { stage: "at-risk" })],
      [camp(10, "A", 1), camp(11, "Flagged", 2), camp(12, "Elsewhere", 3)],
    );
    const flagged = planMove(f, move(11, [10, "sent"]));
    expect(!flagged.ok && flagged.error).toContain("needs review");
    const elsewhere = planMove(f, move(10, [12, "sent"]));
    expect(!elsewhere.ok && elsewhere.error).toContain("not in this stage's flow");
    const self = planMove(f, move(10, [10, "sent"]));
    expect(!self.ok && self.error).toContain("cannot follow itself");
    expect(planMove(f, move(10, null, null, "lost")).ok).toBe(false);
  });

  it("places a draft from outside the funnel: at the start it gets the stage, after an email it keeps its own filter", () => {
    const f = facts(
      [seg(1, "Lead", { stage: "lead" }), seg(2, "Premium buyers", { bought: "premium" })],
      [camp(10, "A", 1), camp(11, "Outside", 2), camp(12, "To everyone", null)],
    );
    expect(ok(planMove(f, move(11, null)))[0].filters).toEqual({ bought: "premium", stage: "lead" });
    expect(ok(planMove(f, move(11, null)))[0].segmentName).toBe("Lead · “Outside”");
    expect(ok(planMove(f, move(11, [10, "clicked"])))[0].filters).toEqual({ bought: "premium", campaign: `${id(10)}:clicked` });
    // Another Audience: the stage's own Segment, or a follow-up's.
    expect(ok(planMove(f, move(12, null)))[0].filters).toEqual({ stage: "lead" });
    expect(ok(planMove(f, move(12, [10, "sent"])))[0].filters).toEqual({ campaign: `${id(10)}:sent` });
  });

  it("names a Segment it would create uniquely among Segments with other filters", () => {
    const f = facts(
      [seg(1, "Lead", { stage: "lead" }), seg(2, "Lead · got “A”", { stage: "lead", tags: "vip" }), seg(3, "D's", { stage: "lead", tags: "d" })],
      [camp(10, "A", 1), camp(11, "D", 3)],
    );
    expect(ok(planMove(f, move(11, [10, "sent"])))[0].segmentName).toBe("Lead · got “A” (2)");
    const long = facts([seg(1, "Lead", { stage: "lead" })], [camp(10, "A".repeat(120), 1), camp(11, "D", 1)]);
    expect(ok(planMove(long, move(11, [10, "sent"])))[0].segmentName.length).toBeLessThanOrEqual(80);
  });
});

describe("what the page is told about moving", () => {
  it("names why each campaign stays, and lists the drafts in no stage without their filters", () => {
    const f = facts(
      [
        seg(1, "Lead", { stage: "lead" }),
        seg(2, "Premium buyers", { bought: "premium", search: "tan" }),
        seg(3, "Old", { stage: "lead" }, true),
        seg(4, "At risk · 12 to 24 months", { stage: "at-risk", last_order: "within:24" }),
      ],
      [camp(10, "Draft", 1), camp(11, "Started", 1, true), camp(12, "Outside", 2), camp(13, "Flagged", 3), camp(14, "To everyone", null), camp(15, "We miss you", 4), camp(16, "Started to all", null, true)],
    );
    const view = buildAfter({ ...f }, []);
    const lead = view.stages.find((s) => s.stage === "lead")!.flow.flatMap((s) => s.campaigns);
    const lock = (n: number) => [...lead, ...view.stages.find((s) => s.stage === "at_risk")!.flow.flatMap((s) => s.campaigns)].find((c) => c.id === id(n))?.lock;
    expect(lock(10)).toBeNull();
    expect(lock(11)).toMatch(/^Started/);
    expect(lock(15)).toMatch(/Playbook/);
    // A draft to a Segment that needs review stays in its stage, locked, and is not offered to place.
    expect(lock(13)).toContain("needs review");
    expect(view.unplaced.map((c) => c.name)).toEqual(["Outside", "To everyone"]);
    expect(view.unplaced.every((c) => c.lock === null)).toBe(true);
    // No Segment's filters, nor a search's words, ride along.
    expect(JSON.stringify(view.unplaced)).not.toMatch(/premium|tan\b/);
  });
});

describe("planArrangement", () => {
  it("refuses an email no longer live, and one the page's lock names", () => {
    expect(planArrangement([], { campaignId: "x", after: null, before: null })).toEqual({ ok: false, error: "That email is no longer live." });
    const p = planArrangement([{ id: "a", name: "A", parent: null, lock: "Started.", inStage: true, unplaced: false }], { campaignId: "a", after: null, before: null });
    expect(p).toEqual({ ok: false, error: "“A” stays where it is. Started." });
  });
});

/** The page after the changes, as if the write had pointed each campaign at a Segment with those filters. */
function buildAfter(f: ReturnType<typeof chain>, changes: ReturnType<typeof ok>) {
  const segments = [...f.segments];
  const campaigns = f.campaigns.map((c) => {
    const ch = changes.find((x) => x.campaignId === c.campaign.id);
    if (!ch) return c;
    const s = seg(900 + segments.length, ch.segmentName, ch.filters);
    segments.push(s);
    return { ...c, campaign: { ...c.campaign, audience: "segment" as const, segmentId: s.id } };
  });
  const full: FunnelFacts = {
    summary: null,
    subscribed: {},
    segments,
    campaigns,
    stageResults: [],
    automatic: {},
    switches: { draftReminders: true, reviewRequests: true, checkups: true, checkupMonths: 12 },
  };
  return buildFunnel(full);
}
