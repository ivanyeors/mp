import { describe, expect, it } from "vitest";
import { parseCustomerFilters } from "@/lib/crm/customer-filters";
import { MPILLOW_FACTS } from "@/lib/ai/mpillow-facts";
import { contentWords } from "../content";
import { CampaignDraftSchema, mentionsPoints, variablesInEmail } from "../rules";
import { APPROVED_PLAYBOOKS, PLAYBOOK_DRAFTS, PLAYBOOK_STARTERS, STARTERS, starterDraft } from "../starters";

/**
 * The CRM's Playbooks (PRD-crm-retention-loop slice 07): a ready-written
 * campaign per stage. Each saves as written once its Segment is chosen, sends
 * to a Segment the Customers list can save, never offers a discount, asks for
 * a review or rating, or carries an aftercare message, and is offered only
 * once the owner has approved its words.
 */

const SEGMENT = "00000000-0000-4000-8000-0000000000aa";
const wordsOf = (id: string) => {
  const p = PLAYBOOK_DRAFTS.find((x) => x.id === id)!;
  const d = starterDraft(p);
  return [d.name, d.subject, d.preheader ?? "", ...(d.content ? contentWords(d.content) : [])].join("\n");
};

describe("the Playbooks", () => {
  it("are the four the PRD names, one per stage, and the Email funnel's Lead Playbook", () => {
    expect(PLAYBOOK_DRAFTS.map((p) => p.label)).toEqual([
      "Second purchase",
      "Thank you",
      "We miss you",
      "Welcome back",
      "How your pillow is made",
    ]);
    expect(PLAYBOOK_DRAFTS.map((p) => (p.audience?.audience === "segment" ? p.audience.filters : null))).toEqual([
      "stage=new&delivered=over:60",
      "stage=loyal",
      "stage=at-risk&last_order=within:24",
      "stage=at-risk:lapsed",
      "stage=lead",
    ]);
  });

  it("each send to a Segment the Customers list can save, every filter read", () => {
    for (const p of PLAYBOOK_DRAFTS) {
      if (p.audience?.audience !== "segment") throw new Error(`${p.id} has no Segment`);
      const { ignored } = parseCustomerFilters(new URLSearchParams(p.audience.filters));
      expect(ignored, p.id).toEqual([]);
      expect(p.audience.segment.length, p.id).toBeGreaterThan(0);
    }
  });

  it("each save as written, once its Segment is chosen", () => {
    for (const p of PLAYBOOK_DRAFTS) {
      const parsed = CampaignDraftSchema.safeParse({ ...starterDraft(p), segmentId: SEGMENT });
      expect(parsed.success, `${p.id}: ${parsed.success ? "" : JSON.stringify(parsed.error.issues)}`).toBe(true);
    }
  });

  it("only the win-back reaches the Unengaged", () => {
    expect(PLAYBOOK_DRAFTS.filter((p) => starterDraft(p).includeUnengaged).map((p) => p.id)).toEqual(["playbook_welcome_back"]);
  });

  it("never offer a discount, ask for a review or rating, or carry an aftercare message", () => {
    for (const p of PLAYBOOK_DRAFTS) {
      const words = wordsOf(p.id);
      expect(words, p.id).not.toMatch(/discount|% off|\bS?\$\d|coupon|promo code|voucher|free gift/i);
      expect(words, p.id).not.toMatch(/review|rating|rate us|stars?\b|feedback|check-up|how did we do/i);
    }
  });

  it("wait for points to be live when they speak of points", () => {
    expect(PLAYBOOK_DRAFTS.filter((p) => mentionsPoints(starterDraft(p))).map((p) => p.id)).toEqual([
      "playbook_thank_you",
      "playbook_we_miss_you",
    ]);
  });

  it("use only Variables with words for a customer who has none", () => {
    for (const p of PLAYBOOK_DRAFTS) {
      const used = variablesInEmail(starterDraft(p));
      expect(used.every((v) => v === "first_name" || v === "your_pillow"), `${p.id}: ${used.join(", ")}`).toBe(true);
    }
  });

  it("claim only what the facts list says: the warranty, washable covers, replaceable layers", () => {
    const facts = MPILLOW_FACTS.join(" ");
    expect(facts).toContain("10-year warranty");
    expect(facts).toContain("washable");
    expect(facts).toContain("replaced without replacing the whole pillow");
    expect(facts).toContain("height is adjustable");
  });

  it("are offered only once the owner approves their words", () => {
    expect(PLAYBOOK_STARTERS.map((p) => p.id)).toEqual(PLAYBOOK_DRAFTS.filter((p) => APPROVED_PLAYBOOKS.has(p.id)).map((p) => p.id));
    for (const p of PLAYBOOK_DRAFTS) expect(STARTERS.includes(p)).toBe(APPROVED_PLAYBOOKS.has(p.id));
    expect([...APPROVED_PLAYBOOKS].every((id) => PLAYBOOK_DRAFTS.some((p) => p.id === id))).toBe(true);
  });

  it("are the first four approved by the owner (2026-11-01); How your pillow is made waits for them", () => {
    expect([...APPROVED_PLAYBOOKS].sort()).toEqual([
      "playbook_second_purchase",
      "playbook_thank_you",
      "playbook_we_miss_you",
      "playbook_welcome_back",
    ]);
  });

  it("How your pillow is made is a draft, never offered (PRD-email-funnel, decision 7)", () => {
    expect(PLAYBOOK_DRAFTS.some((p) => p.id === "playbook_how_its_made")).toBe(true);
    expect(PLAYBOOK_STARTERS.some((p) => p.id === "playbook_how_its_made")).toBe(false);
    expect(STARTERS.some((p) => p.id === "playbook_how_its_made")).toBe(false);
    expect(APPROVED_PLAYBOOKS.has("playbook_how_its_made")).toBe(false);
  });

  it("How your pillow is made says a fitting is for Singapore, and names the brand right", () => {
    const words = wordsOf("playbook_how_its_made");
    expect(words).toMatch(/in Singapore, you can book an appointment for a fitting/);
    expect(words).not.toMatch(/money pillow/i);
    // Each claim is a fact: the measuring, the height, both sleep positions, washable and replaceable layers.
    const facts = MPILLOW_FACTS.join(" ");
    for (const claim of ["shoulder width", "height and width", "back and side sleeping", "washable", "replaced without replacing the whole pillow", "customise", "book an appointment for a fitting"]) {
      expect(words.toLowerCase(), claim).toContain(claim);
      expect(facts, claim).toContain(claim);
    }
  });
});
