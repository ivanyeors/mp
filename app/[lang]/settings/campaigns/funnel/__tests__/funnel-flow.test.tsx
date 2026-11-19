// @vitest-environment jsdom
import { choose, click, settle } from "@/components/block-editor/__tests__/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LifecycleStage } from "@/lib/crm/lifecycle-stage";
import { buildFunnel, type FunnelCampaignFact, type FunnelFacts, type FunnelView } from "@/lib/email-funnel/model";

/**
 * The Email flow arranged (PRD-email-funnel slice 07): a started card has a
 * lock and no grip; the menu's moves send what the matching drop zone sends;
 * a move is drawn at once and rolled back with the refusal's words; nobody
 * without `customers-edit` gets a grip. And the previews (owner, 2026-11-19):
 * each card's chevron shows and hides its own, *Hide previews* hides them all,
 * remembered, and only shown cards' renders are asked for.
 */

const actions = vi.hoisted(() => ({
  renderFunnelEmails: vi.fn(async (keys: string[]) => ({
    ok: true as const,
    renders: Object.fromEntries(keys.map((k) => [k, { subject: `Subject of ${k}`, html: `<html><body>${k}</body></html>` }])),
  })),
}));
vi.mock("../actions", () => actions);
type Answer = { ok: true; moved: string[] } | { ok: false; error: string; moved: string[] };
const arrange = vi.hoisted(() => ({
  moveFunnelEmail: vi.fn<(input: unknown) => Promise<Answer>>(),
  addPlaybookDraft: vi.fn(),
}));
vi.mock("../arrange-actions", () => arrange);
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/en-US/settings/campaigns/funnel" }));
vi.mock("../../thumbnail-frame", () => ({ ThumbnailFrame: ({ html }: { html?: string | null }) => <div data-frame={html ?? "none"} /> }));

const { FunnelClient, PREVIEWS_KEY } = await import("../funnel-client");
const { flowLayout, nodesOf, zoneMove } = await import("../funnel-format");

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const camp = (n: number, name: string, segment: number, started = false): FunnelCampaignFact => ({
  campaign: {
    id: id(n),
    name,
    subject: `${name} subject`,
    audience: "segment",
    segmentId: id(segment),
    excludeSegmentIds: [],
    lockedAt: started ? "2026-11-01T02:00:00Z" : null,
    createdAt: `2026-10-1${n % 10}T02:00:00Z`,
  },
  stats: { handed: 0, firstSentAt: null, lastSentAt: null },
});

// Lead: Started one (started) → A → B → C, all drafts after it.
const facts: FunnelFacts = {
  summary: null,
  subscribed: {},
  segments: [
    { id: id(1), name: "Lead", params: { stage: "lead" }, count: 10, needsReview: false },
    { id: id(2), name: "got S", params: { campaign: `${id(10)}:sent` }, count: 1, needsReview: false },
    { id: id(3), name: "got A", params: { campaign: `${id(11)}:sent` }, count: 1, needsReview: false },
    { id: id(4), name: "clicked B", params: { campaign: `${id(12)}:clicked` }, count: 1, needsReview: false },
  ],
  campaigns: [camp(10, "Started one", 1, true), camp(11, "A", 2), camp(12, "B", 3), camp(13, "C", 4)],
  stageResults: [],
  automatic: {},
  switches: { draftReminders: true, reviewRequests: true, checkups: true, checkupMonths: 12 },
};

const OWNER = ["campaigns", "customers", "customers-edit", "email-templates", "api-configs"];
let root: Root | null = null;
let host: HTMLDivElement;
async function show(view: FunnelView, stage: LifecycleStage = "lead", permissions: string[] = OWNER) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <>
        <FunnelClient view={view} initialStage={stage} locale="en-US" permissions={permissions} />
        <Toaster />
      </>,
    );
  });
  await settle();
}
const card = (n: number) => host.querySelector(`[data-card="campaign:${id(n)}"]`) as HTMLElement;
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.getAttribute("aria-label") === label || b.textContent?.trim() === label) ?? null;
const order = () => [...host.querySelectorAll("[data-card^='campaign:']")].map((el) => el.getAttribute("data-card")!.slice("campaign:".length));

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  arrange.moveFunnelEmail.mockResolvedValue({ ok: true, moved: [] });
});
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await settle(20);
  document.body.innerHTML = "";
});

describe("arranging the flow", () => {
  it("gives a started card a lock and no grip, and a draft a grip", async () => {
    await show(buildFunnel(facts));
    expect(card(10).querySelector('[aria-label^="Drag"]')).toBeNull();
    expect(card(10).querySelector('[aria-label^="Stays in place: Started"]')).not.toBeNull();
    expect(card(13).querySelector('[aria-label="Drag “C” to move it"]')).not.toBeNull();
    // Numbered in the order people get them.
    expect([10, 11, 12, 13].map((k) => card(k).querySelector('[aria-label^="Step"]')?.textContent)).toEqual(["1", "2", "3", "4"]);
  });

  it("menu Move earlier sends the action the same input as the drop zone in front of the email before it", async () => {
    const view = buildFunnel(facts);
    await show(view);
    await choose(button("Actions for “C”")!, "Move earlier");
    const lead = view.stages.find((s) => s.stage === "lead")!;
    const sequence = flowLayout(lead, view.unplaced).items.find((i) => i.kind === "sequence");
    if (sequence?.kind !== "sequence") throw new Error("no sequence");
    const [, a, b] = nodesOf(sequence.root);
    expect(arrange.moveFunnelEmail).toHaveBeenCalledWith({ ...zoneMove(id(13), a, b), stage: "lead" });
    expect(arrange.moveFunnelEmail).toHaveBeenCalledWith({ campaignId: id(13), stage: "lead", after: { campaignId: id(11), did: "sent" }, before: id(12) });
    expect(router.refresh).toHaveBeenCalled();
  });

  it("draws a move at once, and rolls it back with the refusal's words", async () => {
    let answer!: (a: Answer) => void;
    arrange.moveFunnelEmail.mockImplementation(() => new Promise<Answer>((r) => (answer = r)));
    await show(buildFunnel(facts));
    expect(order()).toEqual([id(10), id(11), id(12), id(13)]);
    await choose(button("Actions for “C”")!, "Move earlier");
    expect(order()).toEqual([id(10), id(11), id(13), id(12)]);
    await act(async () => answer({ ok: false, error: "“C” could not move: refused in these words.", moved: [] }));
    await settle(20);
    expect(order()).toEqual([id(10), id(11), id(12), id(13)]);
    expect(document.body.textContent).toContain("“C” could not move: refused in these words.");
  });

  it("gives nobody without customers-edit a grip or a move", async () => {
    await show(buildFunnel(facts), "lead", ["campaigns"]);
    expect(host.querySelector('[aria-label^="Drag"]')).toBeNull();
    await choose(button("Actions for “C”")!, "Preview");
    expect([...document.querySelectorAll('[role="menuitem"]')].some((m) => m.textContent === "Move earlier")).toBe(false);
  });
});

describe("Add as a draft", () => {
  it("stays disabled after it saved until the page's next read arrives, so a second click makes no second draft", async () => {
    arrange.addPlaybookDraft.mockResolvedValue({ ok: true, id: id(99) });
    await show(buildFunnel(facts), "at_risk");
    const addButton = () => [...host.querySelector('[data-card="starter:playbook_welcome_back"]')!.querySelectorAll("button")].find((b) => /Add as a draft|Adding/.test(b.textContent ?? ""))!;
    expect(addButton()).toBeTruthy();
    await click(addButton());
    await settle(20);
    expect(arrange.addPlaybookDraft).toHaveBeenCalledTimes(1);
    expect(router.refresh).toHaveBeenCalled();
    expect(addButton().disabled).toBe(true);
    await click(addButton());
    expect(arrange.addPlaybookDraft).toHaveBeenCalledTimes(1);
    // The page read again: the row is whatever the new view says (here still a suggestion), and usable.
    await act(async () => {
      root!.render(
        <>
          <FunnelClient view={buildFunnel(facts)} initialStage="at_risk" locale="en-US" permissions={OWNER} />
          <Toaster />
        </>,
      );
    });
    expect(addButton().disabled).toBe(false);
  });

  it("is usable again when the action refuses", async () => {
    arrange.addPlaybookDraft.mockResolvedValue({ ok: false, error: "Already this Playbook." });
    await show(buildFunnel(facts), "at_risk");
    const addButton = () => [...host.querySelector('[data-card="starter:playbook_welcome_back"]')!.querySelectorAll("button")].find((b) => /Add as a draft|Adding/.test(b.textContent ?? ""))!;
    await click(addButton());
    await settle(20);
    expect(addButton().disabled).toBe(false);
    expect(document.body.textContent).toContain("Already this Playbook.");
  });
});

describe("previews", () => {
  it("each chevron hides and shows its own preview and flips aria-expanded; Hide previews hides them all, remembered", async () => {
    await show(buildFunnel(facts));
    const chevron = () => card(12).querySelector<HTMLButtonElement>("[aria-expanded]")!;
    const region = () => document.getElementById(chevron().getAttribute("aria-controls")!)!;
    expect(chevron().getAttribute("aria-expanded")).toBe("true");
    expect(region().hidden).toBe(false);
    expect(region().querySelector("[data-frame]")).not.toBeNull();
    await click(chevron());
    expect(chevron().getAttribute("aria-expanded")).toBe("false");
    expect(region().hidden).toBe(true);
    expect(card(11).querySelector("[aria-expanded]")!.getAttribute("aria-expanded")).toBe("true");
    await click(chevron());
    expect(region().hidden).toBe(false);

    await click(button("Hide previews")!);
    expect([...host.querySelectorAll("[data-card] [aria-expanded]")].every((b) => b.getAttribute("aria-expanded") === "false")).toBe(true);
    expect(host.querySelector("[data-frame]")).toBeNull();
    expect(window.localStorage.getItem(PREVIEWS_KEY)).toBe("hidden");
    expect(button("Show previews")).not.toBeNull();
  });

  it("asks only for the renders of shown cards, and a card opened later asks for its own", async () => {
    window.localStorage.setItem(PREVIEWS_KEY, "hidden");
    await show(buildFunnel(facts));
    expect(actions.renderFunnelEmails).not.toHaveBeenCalled();
    await click(card(12).querySelector<HTMLButtonElement>("[aria-expanded]")!);
    await settle();
    expect(actions.renderFunnelEmails.mock.calls.map((c) => c[0])).toEqual([[`campaign:${id(12)}`]]);
    expect(card(12).querySelector("[data-frame]")?.getAttribute("data-frame")).toContain(`campaign:${id(12)}`);
  });
});
