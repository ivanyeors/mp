// @vitest-environment jsdom
import { click, settle, until } from "@/components/block-editor/__tests__/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CampaignDraftInput } from "@/lib/email-campaigns/rules";
import { EMPTY_CAMPAIGN_DRAFT } from "@/lib/email-campaigns/rules";
import { buildFunnel, type FunnelCampaignFact, type FunnelSegmentFact } from "@/lib/email-funnel/model";
import { planMove, slotBefore } from "@/lib/email-funnel/move";

/**
 * *Add an email here* (PRD-email-funnel slice 07): New campaign at
 * `?after=<P>:<did>&before=<C>` saves the email as a follow-up of P and, on
 * its first save, moves C to follow it, through the same plan and write as a
 * drag. A refused move still saves the email, and says C did not move.
 * `before` without a valid `after`, or naming a started campaign, is ignored.
 */

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const seg = (n: number, name: string, params: Record<string, string>): FunnelSegmentFact => ({ id: id(n), name, params, count: 1, needsReview: false });
const camp = (n: number, name: string, segment: number | null, started = false): FunnelCampaignFact => ({
  campaign: {
    id: id(n),
    name,
    subject: "",
    audience: segment === null ? "subscribed" : "segment",
    segmentId: segment === null ? null : id(segment),
    excludeSegmentIds: [],
    lockedAt: started ? "2026-11-01T00:00:00Z" : null,
    createdAt: `2026-10-1${n % 10}T00:00:00Z`,
  },
  stats: { handed: 0, firstSentAt: null, lastSentAt: null },
});

// Lead: P (started) → C (a draft, to those who clicked P).
const segments = [seg(1, "Lead", { stage: "lead" }), seg(2, "Lead · clicked “P”", { campaign: `${id(10)}:clicked` })];
const P_AND_C = { segments, campaigns: [camp(10, "P", 1, true), camp(11, "C", 2)] };

describe("slotBefore and the plan", () => {
  it("puts the saved email between P and C", () => {
    const slot = slotBefore(P_AND_C, { id: id(10), state: "clicked" }, id(11));
    expect(slot).toEqual({ before: { id: id(11), name: "C" }, after: { campaignId: id(10), did: "clicked" }, stage: "lead" });
    // Saved as P's follow-up (the same Segment as C's), then the move the editor asks for.
    const saved = { segments, campaigns: [...P_AND_C.campaigns, camp(12, "New", 2)] };
    const plan = planMove(saved, { campaignId: id(12), stage: slot!.stage, after: slot!.after, before: slot!.before.id });
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.changes.map((c) => [c.campaignId, c.campaign])).toEqual([[id(11), { id: id(12), did: "sent" }]]);
    // As the page then reads it: P → New → C.
    const after = buildFunnel({
      summary: null,
      subscribed: {},
      segments: [...segments, seg(3, plan.changes[0].segmentName, plan.changes[0].filters)],
      campaigns: [camp(10, "P", 1, true), camp(11, "C", 3), camp(12, "New", 2)],
      stageResults: [],
      automatic: {},
      switches: { draftReminders: true, reviewRequests: true, checkups: true, checkupMonths: 12 },
    });
    const flow = after.stages.find((s) => s.stage === "lead")!.flow;
    expect(flow.find((s) => s.key === `campaign:${id(12)}`)!.after).toEqual({ campaignId: id(10), did: "clicked" });
    expect(flow.find((s) => s.key === `campaign:${id(11)}`)!.after).toEqual({ campaignId: id(12), did: "sent" });
  });

  it("is ignored without a valid after, for a started C, and for a C that does not follow P", () => {
    expect(slotBefore(P_AND_C, null, id(11))).toBeNull();
    expect(slotBefore({ segments, campaigns: [camp(10, "P", 1, true), camp(11, "C", 2, true)] }, { id: id(10), state: "clicked" }, id(11))).toBeNull();
    expect(slotBefore(P_AND_C, { id: id(11), state: "sent" }, id(10))).toBeNull();
    expect(slotBefore(P_AND_C, { id: id(10), state: "clicked" }, undefined)).toBeNull();
  });
});

const actions = vi.hoisted(() => ({
  archiveCampaignAction: vi.fn(),
  checkCampaignReadiness: vi.fn(() => new Promise(() => undefined)),
  describeCampaignProducts: vi.fn(async () => ({ ok: true as const, products: [] })),
  duplicateCampaign: vi.fn(),
  findCampaignProducts: vi.fn(async () => ({ ok: true as const, products: [] })),
  findWantedSegmentAction: vi.fn(),
  listPastCampaignsAction: vi.fn(async () => ({ ok: true as const, campaigns: [] })),
  planCampaignWave: vi.fn(),
  placeCampaignImage: vi.fn(),
  previewCampaign: vi.fn(async (input: CampaignDraftInput) => ({ ok: true as const, subject: input.subject, html: "<p>preview</p>", text: "", from: null })),
  previewStarters: vi.fn(async () => ({ ok: true as const, previews: {} })),
  saveCampaign: vi.fn(async (cid: string | null) => ({ ok: true as const, id: cid ?? id(12) })),
  sendCampaignBatchAction: vi.fn(),
  sendCampaignTestAction: vi.fn(),
}));
vi.mock("../actions", () => actions);
const arrange = vi.hoisted(() => ({
  moveFunnelEmail: vi.fn<(input: unknown) => Promise<{ ok: true; moved: string[] } | { ok: false; error: string; moved: string[] }>>(),
  addPlaybookDraft: vi.fn(),
}));
vi.mock("../funnel/arrange-actions", () => arrange);
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/en-US/settings/campaigns/new", useRouter: () => router }));

const { CampaignEditor } = await import("../campaign-editor");

let root: Root | null = null;
function open() {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <>
        <CampaignEditor
          campaign={null}
          draft={{ ...EMPTY_CAMPAIGN_DRAFT, name: "New", audience: "segment", segmentId: id(2) }}
          stats={null}
          segments={segments.map(({ id: sid, name }) => ({ id: sid, name }))}
          staffEmail="owner@mpillow.com"
          slotBefore={{ before: { id: id(11), name: "C" }, after: { campaignId: id(10), did: "clicked" }, stage: "lead" }}
        />
        <Toaster />
      </>,
    ),
  );
}
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === label) ?? null;

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await settle(50);
  document.body.innerHTML = "";
});

describe("New campaign with ?before=", () => {
  it("on the first save, moves C to follow the saved email with the same input a drop would send", async () => {
    arrange.moveFunnelEmail.mockResolvedValue({ ok: true, moved: [id(11)] });
    open();
    await click((await until(() => button("Save draft")))!);
    await settle(20);
    expect(actions.saveCampaign).toHaveBeenCalledTimes(1);
    expect(arrange.moveFunnelEmail).toHaveBeenCalledWith({ campaignId: id(12), stage: "lead", after: { campaignId: id(10), did: "clicked" }, before: id(11) });
    expect(router.replace).toHaveBeenCalledWith(`/en-US/settings/campaigns/${id(12)}`);
    expect(document.body.textContent).toContain("“C” now follows this email.");
  });

  it("still saves when the move is refused, and says C did not move", async () => {
    arrange.moveFunnelEmail.mockResolvedValue({ ok: false, error: "“C” stays where it is. Started.", moved: [] });
    open();
    await click((await until(() => button("Save draft")))!);
    await settle(20);
    expect(actions.saveCampaign).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith(`/en-US/settings/campaigns/${id(12)}`);
    expect(document.body.textContent).toContain("Saved. “C” did not move after it: “C” stays where it is. Started.");
  });
});
