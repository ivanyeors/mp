// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lifecycleSummary } from "@/lib/crm/lifecycle-summary";
import type { LifecycleStage } from "@/lib/crm/lifecycle-stage";
import { buildFunnel, type FunnelCampaignFact, type FunnelFacts, type FunnelView } from "@/lib/email-funnel/model";

/**
 * The Email funnel as a marketer's workspace (PRD-email-funnel slice 03; owner
 * 2026-11-18): *Add an email* and *Add a follow-up* link to exactly the
 * addresses New campaign reads (slice 06), with the locale; a Suggested
 * Playbook starts from itself, one whose words wait has no start; each card
 * shows its own render; and a flow whose follow-ups loop still draws every
 * card once.
 */

const actions = vi.hoisted(() => ({
  renderFunnelEmails: vi.fn(async (keys: string[]) => ({
    ok: true as const,
    renders: Object.fromEntries(keys.map((k) => [k, { subject: `Subject of ${k}`, html: `<html><body>${k}</body></html>` }])),
  })),
}));
vi.mock("../actions", () => actions);
vi.mock("../../thumbnail-frame", () => ({
  // The frame as the page draws it, without a browser's layout: its HTML on an attribute.
  ThumbnailFrame: ({ html }: { html?: string | null }) => <div data-frame={html ?? "none"} />,
}));

const { FunnelClient } = await import("../funnel-client");

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const camp = (n: number, name: string, segment: number, lockedAt: string | null = "2026-11-01T02:00:00Z"): FunnelCampaignFact => ({
  campaign: { id: id(n), name, audience: "segment", segmentId: id(segment), excludeSegmentIds: [], lockedAt, createdAt: "2026-10-30T02:00:00Z" },
  stats: { handed: 0, firstSentAt: lockedAt, lastSentAt: null },
});

const facts: FunnelFacts = {
  summary: lifecycleSummary([
    { stage: "lead", detail: null, undated: false, customers: 400 },
    { stage: "at_risk", detail: null, undated: false, customers: 120 },
  ]),
  subscribed: { lead: 300, at_risk: 90 },
  segments: [
    { id: id(1), name: "At risk · 12 to 24 months", params: { stage: "at-risk", last_order: "within:24" }, count: 10, needsReview: false },
    { id: id(2), name: "Didn't click We miss you", params: { stage: "at-risk", campaign: `${id(11)}:not-clicked` }, count: 4, needsReview: false },
  ],
  campaigns: [camp(11, "We miss you", 1), camp(12, "Second note", 2)],
  stageResults: [],
  automatic: {},
  switches: { draftReminders: true, reviewRequests: true, checkups: true, checkupMonths: 12 },
};

let root: Root | null = null;
let host: HTMLDivElement;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
});

async function show(view: FunnelView, stage: LifecycleStage, openable: string[] = []) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<FunnelClient view={view} initialStage={stage} locale="en-US" canSeeCustomers canEditTemplates openable={openable} />);
  });
  // The renders arrive after the page shows.
  await act(async () => {
    await Promise.resolve();
  });
}

const card = (key: string) => host.querySelector(`[data-card="${key}"]`) as HTMLElement | null;
const hrefs = (el: Element | null) => [...(el?.querySelectorAll("a") ?? [])].map((a) => a.getAttribute("href"));

describe("creating from the funnel", () => {
  it("adds an email to the stage at exactly /settings/campaigns/new?stage=<param>, with the locale", async () => {
    await show(buildFunnel(facts), "at_risk");
    const add = [...host.querySelectorAll("a")].find((a) => a.textContent?.includes("Add an email"));
    expect(add?.getAttribute("href")).toBe("/en-US/settings/campaigns/new?stage=at-risk");
  });

  it("offers each campaign's three follow-ups at exactly /settings/campaigns/new?after=<id>:<did>", async () => {
    await show(buildFunnel(facts), "at_risk");
    for (const n of [11, 12]) {
      const group = card(`campaign:${id(n)}`)?.querySelector('[aria-label="Add a follow-up"]') ?? null;
      expect(hrefs(group)).toEqual([
        `/en-US/settings/campaigns/new?after=${id(n)}:sent`,
        `/en-US/settings/campaigns/new?after=${id(n)}:clicked`,
        `/en-US/settings/campaigns/new?after=${id(n)}:not-clicked`,
      ]);
    }
  });

  it("starts a Suggested Playbook from itself, and gives one whose words wait no start at all", async () => {
    const view = buildFunnel(facts);
    const setUp = view.stages.flatMap((s) => s.flow).flatMap((f) => (f.setUpHref ? [f.setUpHref] : []));
    await show(view, "at_risk", setUp);
    // *Welcome back* is approved and not started here.
    const suggested = card("starter:playbook_welcome_back");
    expect(suggested?.textContent).toContain("Suggested");
    expect(hrefs(suggested)).toEqual(["/en-US/settings/campaigns/new?starter=playbook_welcome_back"]);
    act(() => root?.unmount());
    root = null;
    host.remove();

    await show(view, "lead", setUp);
    const waiting = card("starter:playbook_how_its_made");
    expect(waiting).not.toBeNull();
    expect(waiting?.textContent).toContain("Words waiting for the owner");
    expect(hrefs(waiting)).toEqual([]);
    expect(waiting?.textContent).not.toContain("Start from this");
  });

  it("does not offer Add an email on Lost, where nobody can be sent one", async () => {
    await show(buildFunnel(facts), "lost");
    expect([...host.querySelectorAll("a")].some((a) => a.getAttribute("href")?.includes("/campaigns/new?stage="))).toBe(false);
  });
});

describe("the email cards", () => {
  it("each show their own render, asked for once for the chosen stage only", async () => {
    await show(buildFunnel(facts), "at_risk");
    for (const n of [11, 12]) {
      expect(card(`campaign:${id(n)}`)?.querySelector("[data-frame]")?.getAttribute("data-frame")).toContain(`campaign:${id(n)}`);
      expect(card(`campaign:${id(n)}`)?.textContent).toContain(`Subject of campaign:${id(n)}`);
    }
    expect(actions.renderFunnelEmails).toHaveBeenCalled();
    const asked = actions.renderFunnelEmails.mock.calls.at(-1)![0];
    expect(asked).toContain(`campaign:${id(11)}`);
    expect(asked.some((k: string) => k.includes("draft_reminder"))).toBe(false);
  });

  it("draw every card once when follow-ups loop, whatever the view says", async () => {
    const view = buildFunnel(facts);
    const risk = view.stages.find((s) => s.stage === "at_risk")!;
    // Force a loop the model never makes: the Playbook's campaign follows up its own follow-up.
    const playbook = risk.flow.find((f) => f.campaigns.some((c) => c.id === id(11)))!;
    playbook.after = { campaignId: id(12), did: "sent" };
    await show(view, "at_risk");
    expect(host.querySelectorAll(`[data-card="campaign:${id(11)}"]`)).toHaveLength(1);
    expect(host.querySelectorAll(`[data-card="campaign:${id(12)}"]`)).toHaveLength(1);
  });
});
