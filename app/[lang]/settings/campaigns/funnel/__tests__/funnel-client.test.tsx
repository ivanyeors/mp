// @vitest-environment jsdom
// jsdom gaps dnd-kit reads (ResizeObserver).
import "@/components/block-editor/__tests__/dom";
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
const arrange = vi.hoisted(() => ({
  moveFunnelEmail: vi.fn<(input: unknown) => Promise<{ ok: true; moved: string[] } | { ok: false; error: string; moved: string[] }>>(async () => ({ ok: true, moved: [] })),
  addPlaybookDraft: vi.fn(async () => ({ ok: true as const, id: "x" })),
}));
vi.mock("../arrange-actions", () => arrange);
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/en-US/settings/campaigns/funnel" }));
vi.mock("../../thumbnail-frame", () => ({
  // The frame as the page draws it, without a browser's layout: its HTML on an attribute.
  ThumbnailFrame: ({ html }: { html?: string | null }) => <div data-frame={html ?? "none"} />,
}));

const { FunnelClient } = await import("../funnel-client");

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const camp = (n: number, name: string, segment: number, lockedAt: string | null = "2026-11-01T02:00:00Z"): FunnelCampaignFact => ({
  campaign: { id: id(n), name, subject: "", audience: "segment", segmentId: id(segment), excludeSegmentIds: [], lockedAt, createdAt: "2026-10-30T02:00:00Z" },
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

/** An Owner's reach on these pages; a test narrows it to a role. */
const OWNER = ["campaigns", "customers", "email-templates", "api-configs"];

async function show(view: FunnelView, stage: LifecycleStage, permissions: string[] = OWNER) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<FunnelClient view={view} initialStage={stage} locale="en-US" permissions={permissions} />);
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

  it("offers a follow-up after each campaign at exactly /settings/campaigns/new?after=<id>:sent", async () => {
    await show(buildFunnel(facts), "at_risk");
    const links = [...host.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    // Between We miss you and its started follow-up, and at the end of the sequence.
    expect(links).toContain(`/en-US/settings/campaigns/new?after=${id(11)}:sent`);
    expect(links).toContain(`/en-US/settings/campaigns/new?after=${id(12)}:sent`);
    // A started follow-up cannot be slotted in front of: no ?before= on this page.
    expect(links.some((h) => h?.includes("before="))).toBe(false);
  });

  it("starts a Suggested Playbook from itself, and gives one whose words wait no start at all", async () => {
    const view = buildFunnel(facts);
    await show(view, "at_risk");
    // *Welcome back* is approved and not started here.
    const suggested = card("starter:playbook_welcome_back");
    expect(suggested?.textContent).toContain("Suggested");
    expect(hrefs(suggested)).toEqual(["/en-US/settings/campaigns/new?starter=playbook_welcome_back"]);
    expect(suggested?.textContent).toContain("Add as a draft");
    act(() => root?.unmount());
    root = null;
    host.remove();

    await show(view, "lead");
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

describe("the review of slice 03", () => {
  const unmount = () => {
    act(() => root?.unmount());
    root = null;
    host.remove();
  };
  const withAutomatic: FunnelFacts = {
    ...facts,
    automatic: {
      "lead.draft_reminders": {
        sent: 100,
        outcome: 30,
        also: [
          { label: "Drafts reminded", count: 60 },
          { label: "After 1 day", count: 60 },
          { label: "After 1 week", count: 35 },
          { label: "After 1 month", count: 5 },
        ],
      },
      "new.review_request": { sent: 20, sentLabel: "Customers asked, by email or WhatsApp", outcome: 8 },
      "aftercare.checkup_reminder": { sent: 11, sentLabel: "Check-ups sent, by email or WhatsApp", outcome: 4 },
    },
  };

  it("gates every link through the role's pages: campaigns only links to no Customers, settings or templates page", async () => {
    for (const stage of ["lead", "new", "loyal", "at_risk", "lost"] as const) {
      await show(buildFunnel(withAutomatic), stage, ["campaigns"]);
      const links = [...host.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? "");
      expect(links.filter((h) => /\/settings\/(customers|general|email-templates)/.test(h)), stage).toEqual([]);
      unmount();
    }
    // The rows still name their emails, as words.
    await show(buildFunnel(withAutomatic), "new", ["campaigns"]);
    expect(host.textContent).toContain("Review request");
    unmount();
    // An Owner gets the same rows as links.
    await show(buildFunnel(withAutomatic), "new");
    expect([...host.querySelectorAll("a")].some((a) => a.getAttribute("href") === "/en-US/settings/customers?view=settings")).toBe(true);
  });

  it("asks for a long stage's renders in chunks of the action's limit, so all 45 cards get theirs", async () => {
    const { MAX_RENDER_KEYS } = await import("../funnel-format");
    actions.renderFunnelEmails.mockClear();
    const many = Array.from({ length: 45 }, (_, k) => camp(100 + k, `Note ${k}`, 1));
    await show(buildFunnel({ ...facts, campaigns: many }), "at_risk");
    await act(async () => {
      await Promise.resolve();
    });
    const calls = actions.renderFunnelEmails.mock.calls.map((c) => c[0] as string[]);
    expect(calls.every((keys) => keys.length <= MAX_RENDER_KEYS)).toBe(true);
    for (let k = 0; k < 45; k++) {
      expect(card(`campaign:${id(100 + k)}`)?.querySelector("[data-frame]")?.getAttribute("data-frame"), String(k)).toContain(`campaign:${id(100 + k)}`);
    }
  });

  it("shows each draft reminder card its own sends, never the whole sequence's outcome", async () => {
    await show(buildFunnel(withAutomatic), "lead");
    const month = card("template:results.draft_reminder_1m");
    expect(month?.textContent).toContain("Sent 5");
    expect(month?.textContent).not.toContain("30");
    expect(card("template:results.draft_reminder_1d")?.textContent).toContain("Sent 60");
  });

  it("offers neither Email this Segment nor Open in Customers for a Segment that needs review, and says why", async () => {
    const flagged: FunnelFacts = {
      ...facts,
      segments: [...facts.segments, { id: id(3), name: "Old At risk", params: { stage: "at-risk" }, count: null, needsReview: true }],
    };
    await show(buildFunnel(flagged), "at_risk");
    const item = [...host.querySelectorAll("li")].find((li) => li.querySelector("p")?.textContent === "Old At risk")!;
    expect(item).toBeTruthy();
    expect(item.textContent).not.toContain("Email this Segment");
    expect(item.textContent).not.toContain("Open in Customers");
    expect(item.querySelector("[data-segment-review]")?.textContent).toContain("needs review");
    expect(hrefs(item)).toEqual(["/en-US/settings/customers"]);
    unmount();
    await show(buildFunnel(flagged), "at_risk", ["campaigns"]);
    const plain = [...host.querySelectorAll("li")].find((li) => li.querySelector("p")?.textContent === "Old At risk")!;
    expect(hrefs(plain)).toEqual([]);
  });
});

describe("the second review of slice 03", () => {
  const unmount = () => {
    act(() => root?.unmount());
    root = null;
    host.remove();
  };
  const withAutomatic: FunnelFacts = {
    ...facts,
    automatic: {
      "lead.draft_reminders": {
        sent: 100,
        outcome: 30,
        also: [
          { label: "Drafts reminded", count: 60 },
          { label: "After 1 day", count: 60 },
          { label: "After 1 week", count: 35 },
          { label: "After 1 month", count: 5 },
        ],
      },
      "new.review_request": { sent: 20, sentLabel: "Customers asked, by email or WhatsApp", outcome: 8 },
      "aftercare.checkup_reminder": { sent: 11, sentLabel: "Check-ups sent, by email or WhatsApp", outcome: 4 },
    },
  };
  const press = async (label: string) => {
    const button = [...host.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === label);
    expect(button, label).toBeTruthy();
    await act(async () => {
      button!.click();
    });
  };
  const dialog = () => document.body.querySelector('[role="dialog"]') as HTMLElement | null;

  it("opens one draft reminder with its own numbers, not the whole sequence's", async () => {
    await show(buildFunnel(withAutomatic), "lead");
    await press("Preview Finish your pillow · 1 month");
    const text = dialog()?.textContent ?? "";
    expect(text).toContain("Sent 5");
    for (const other of ["30", "35", "60", "Drafts finished", "Drafts reminded"]) expect(text, other).not.toContain(other);
    unmount();
  });

  it("gates the opened preview's actions: campaigns only links to no templates, Customers or settings page", async () => {
    for (const [stage, label] of [
      ["new", "Preview Review request"],
      ["lead", "Preview Finish your pillow · 1 day"],
      ["at_risk", "Preview Check-up reminder"],
    ] as const) {
      await show(buildFunnel(withAutomatic), stage, ["campaigns"]);
      await press(label);
      const links = [...(dialog()?.querySelectorAll("a") ?? [])].map((a) => a.getAttribute("href") ?? "");
      expect(links.filter((h) => /\/settings\/(customers|general|email-templates)/.test(h)), stage).toEqual([]);
      unmount();
    }
    // An Owner gets the settings link.
    await show(buildFunnel(withAutomatic), "new");
    await press("Preview Review request");
    const links = [...(dialog()?.querySelectorAll("a") ?? [])].map((a) => a.getAttribute("href") ?? "");
    expect(links).toContain("/en-US/settings/customers?view=settings");
    unmount();
  });

  it("does not open a Segment with a search in Customers, which would list more than the Segment", async () => {
    const searched: FunnelFacts = {
      ...facts,
      segments: [...facts.segments, { id: id(4), name: "At risk named Tan", params: { stage: "at-risk", search: "tan" }, count: 2, needsReview: false }],
    };
    await show(buildFunnel(searched), "at_risk");
    const item = [...host.querySelectorAll("li")].find((li) => li.querySelector("p")?.textContent === "At risk named Tan")!;
    expect(item).toBeTruthy();
    expect(item.textContent).not.toContain("Open in Customers");
    expect(hrefs(item).some((h) => h?.startsWith("/en-US/settings/customers?"))).toBe(false);
    expect(hrefs(item)).toContain("/en-US/settings/customers");
    expect(item.querySelector("[data-segment-search]")).not.toBeNull();
    // Its words never reach the page.
    expect(host.innerHTML).not.toMatch(/\btan\b/);
    expect(hrefs(item)).toContain(`/en-US/settings/campaigns/new?segment=${id(4)}`);
    unmount();
  });

  it("keeps the first chunk's renders when the second fails", async () => {
    const { MAX_RENDER_KEYS } = await import("../funnel-format");
    actions.renderFunnelEmails.mockClear();
    const ok = actions.renderFunnelEmails.getMockImplementation()!;
    actions.renderFunnelEmails.mockImplementationOnce(ok).mockImplementationOnce(async () => {
      throw new Error("down");
    });
    const many = Array.from({ length: 45 }, (_, k) => camp(200 + k, `Note ${k}`, 1));
    await show(buildFunnel({ ...facts, campaigns: many }), "at_risk");
    await act(async () => {
      await Promise.resolve();
    });
    const [first, second] = actions.renderFunnelEmails.mock.calls.map((c) => c[0] as string[]);
    expect(first).toHaveLength(MAX_RENDER_KEYS);
    for (const key of first) {
      expect(card(key)?.querySelector("[data-frame]")?.getAttribute("data-frame"), key).toContain(key);
      expect(card(key)?.textContent, key).not.toContain("Preview not available");
    }
    for (const key of second) expect(card(key)?.textContent, key).toContain("Preview not available");
    unmount();
  });

  it("says in the Results row what an Automatic email's Sent counts", async () => {
    await show(buildFunnel(withAutomatic), "at_risk");
    expect(host.textContent).toContain("Check-ups sent, by email or WhatsApp");
    unmount();
    await show(buildFunnel(withAutomatic), "new");
    expect(host.textContent).toContain("Customers asked, by email or WhatsApp");
    unmount();
  });
});
