// @vitest-environment jsdom
import { click, settle, until } from "@/components/block-editor/__tests__/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerSegment, SegmentParams } from "@/lib/crm/segment-rules";
import type { CampaignDraftInput } from "@/lib/email-campaigns/rules";

/**
 * *Set up a step* (PRD-email-funnel slice 04): New campaign at
 * `?starter=playbook_we_miss_you`, where the Playbook's Segment is missing,
 * names it beside the Audience and offers *Create the Segment*. The click goes
 * through the Segments' own create, the real route
 * (`POST /api/settings/customers/segments`: its permission, validation, unique
 * name and audit row), here with the database replaced by a list. The Segment
 * is saved with the Playbook's exact filters and chosen; a second click
 * creates nothing more; a name taken by a Segment with other filters is
 * reported and left as it is. Opening the page saves and sends nothing.
 */

const db = vi.hoisted(() => ({ rows: [] as { id: string; name: string; params: Record<string, string> }[] }));
const auth = vi.hoisted(() => ({
  requireAdmin: vi.fn<(permission: string) => Promise<null>>(async () => null),
  recordAdminAction: vi.fn<(input: unknown) => Promise<void>>(async () => undefined),
}));
vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: auth.requireAdmin,
  getAdminContext: vi.fn(async () => ({ memberId: "m1", email: "owner@mpillow.com" })),
}));
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction: auth.recordAdminAction }));
vi.mock("@/lib/staff/working-as", () => ({ actingProfile: vi.fn(async () => ({ id: "p1" })) }));
vi.mock("@/lib/crm/segments", async (orig) => {
  const real = await orig<typeof import("@/lib/crm/segments")>();
  return {
    ...real,
    listSegments: vi.fn(async () => []),
    // The live-name rule, as the table's unique index keeps it.
    createSegment: vi.fn(async (name: string, params: SegmentParams): Promise<CustomerSegment> => {
      if (db.rows.some((r) => r.name === name)) throw new real.SegmentNameTakenError(name);
      const row = { id: `seg-${db.rows.length + 1}`, name, params: params as Record<string, string> };
      db.rows.push(row);
      return { ...row, ignored: [], needsReview: false, count: 0, createdBy: null, createdAt: "2026-11-18T00:00:00Z", updatedAt: "2026-11-18T00:00:00Z" };
    }),
  };
});

const actions = vi.hoisted(() => ({
  archiveCampaignAction: vi.fn(),
  checkCampaignReadiness: vi.fn(() => new Promise(() => undefined)),
  describeCampaignProducts: vi.fn(async () => ({ ok: true as const, products: [] })),
  duplicateCampaign: vi.fn(),
  findCampaignProducts: vi.fn(async () => ({ ok: true as const, products: [] })),
  listPastCampaignsAction: vi.fn(async () => ({ ok: true as const, campaigns: [] })),
  planCampaignWave: vi.fn(),
  placeCampaignImage: vi.fn(),
  previewCampaign: vi.fn(async (input: CampaignDraftInput) => ({ ok: true as const, subject: input.subject, html: "<p>preview</p>", text: "", from: null })),
  previewStarters: vi.fn(async () => ({ ok: true as const, previews: {} })),
  saveCampaign: vi.fn(),
  sendCampaignBatchAction: vi.fn(),
  sendCampaignTestAction: vi.fn(),
}));
vi.mock("../actions", () => actions);
vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/settings/campaigns/new",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { CampaignEditor } = await import("../campaign-editor");
const { POST } = await import("@/app/api/settings/customers/segments/route");
const { EMPTY_CAMPAIGN_DRAFT } = await import("@/lib/email-campaigns/rules");
const { startedFromParam } = await import("@/lib/email-campaigns/starters");
const { filtersKey } = await import("@/lib/crm/filters-key");

/** The browser's fetch, answered by the real create route. */
const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  if (url !== "/api/settings/customers/segments") throw new Error(`Unexpected fetch ${url}`);
  return POST(new Request(`https://admin.test${url}`, init));
});

type Option = { id: string; name: string; filtersKey?: string | null };
let root: Root | null = null;
function open(starter: string, segments: Option[], canCreateSegments = true) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <>
        <CampaignEditor
          campaign={null}
          draft={startedFromParam(EMPTY_CAMPAIGN_DRAFT, starter, segments)}
          stats={null}
          segments={segments}
          staffEmail="owner@mpillow.com"
          pointsLive
          starterId={starter}
          canCreateSegments={canCreateSegments}
        />
        <Toaster />
      </>,
    ),
  );
}

const notice = () => document.querySelector<HTMLElement>("[aria-labelledby='c-playbook-segment']");
const createButton = () => [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Create the Segment") ?? null;
const chosenSegment = () => document.getElementById("c-segment")?.textContent;

beforeEach(() => {
  vi.clearAllMocks();
  db.rows = [];
  window.localStorage.clear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await settle(50);
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("a Playbook whose Segment is missing", () => {
  it("is named beside the Audience, and opening the page saves, sends and creates nothing", async () => {
    open("playbook_we_miss_you", [{ id: "seg-loyal", name: "Loyal", filtersKey: filtersKey("stage=loyal") }]);
    await settle(20);
    expect(document.querySelector<HTMLInputElement>("#c-name")!.value).toBe("We miss you");
    expect(notice()!.textContent).toContain("This Playbook sends to the Segment “At risk · 12 to 24 months”, which doesn't exist yet.");
    expect(createButton()).not.toBeNull();
    expect(actions.saveCampaign).not.toHaveBeenCalled();
    expect(actions.sendCampaignBatchAction).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Create the Segment saves it through the Segments' create with the Playbook's exact filters, chooses it, and a second click makes no second one", async () => {
    open("playbook_we_miss_you", []);
    const button = await until(createButton);
    // Two clicks before the first answer.
    await act(async () => {
      button.click();
      button.click();
    });
    await until(() => (notice() ? null : true));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]!.body))).toEqual({
      name: "At risk · 12 to 24 months",
      filters: { stage: "at-risk", last_order: "within:24" },
    });
    // The route's own permission check and audit row.
    expect(auth.requireAdmin).toHaveBeenCalledWith("customers-edit");
    expect(auth.recordAdminAction).toHaveBeenCalledTimes(1);
    expect(auth.recordAdminAction.mock.calls[0][0]).toMatchObject({ action: "customer_segment.create" });
    expect(db.rows).toEqual([{ id: "seg-1", name: "At risk · 12 to 24 months", params: { stage: "at-risk", last_order: "within:24" } }]);
    // Saved with the Playbook's filters, as the Playbook compares them.
    expect(filtersKey(db.rows[0].params)).toBe(filtersKey("stage=at-risk&last_order=within:24"));
    expect(chosenSegment()).toBe("At risk · 12 to 24 months");
    expect(createButton()).toBeNull();
    // Nothing saved: still a draft until Save.
    expect(actions.saveCampaign).not.toHaveBeenCalled();
  });

  it("keeps Include unengaged on the campaign, never in the Segment's filters (Welcome back)", async () => {
    open("playbook_welcome_back", []);
    expect(document.querySelector("[aria-describedby='c-include-unengaged-hint']")!.getAttribute("aria-checked")).toBe("true");
    await click(await until(createButton));
    await until(() => (notice() ? null : true));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]!.body))).toEqual({ name: "At risk · Lapsed", filters: { stage: "at-risk:lapsed" } });
    expect(db.rows[0].params).toEqual({ stage: "at-risk:lapsed" });
    expect(chosenSegment()).toBe("At risk · Lapsed");
  });

  it("reports a name taken by a Segment with other filters, and leaves that Segment as it is", async () => {
    db.rows = [{ id: "seg-old", name: "At risk · 12 to 24 months", params: { stage: "at-risk" } }];
    open("playbook_we_miss_you", [{ id: "seg-old", name: "At risk · 12 to 24 months", filtersKey: filtersKey("stage=at-risk") }]);
    // Its name is the Playbook's, its filters are not: not chosen.
    expect(chosenSegment()).not.toBe("At risk · 12 to 24 months");
    await click(await until(createButton));
    const alert = await until(() => notice()?.querySelector("[role='alert']"));
    expect(alert.textContent).toContain("A Segment named “At risk · 12 to 24 months” already exists.");
    expect(alert.textContent).toContain("It has other filters, so it was left as it is");
    expect(db.rows).toEqual([{ id: "seg-old", name: "At risk · 12 to 24 months", params: { stage: "at-risk" } }]);
    expect(auth.recordAdminAction).not.toHaveBeenCalled();
    expect(chosenSegment()).not.toBe("At risk · 12 to 24 months");
  });

  it("tells Staff who may not create Segments whom to ask, with no button", async () => {
    open("playbook_we_miss_you", [], false);
    expect(notice()!.textContent).toContain("Ask an Owner, or someone whose role can make changes on Customers, to create it.");
    expect(createButton()).toBeNull();
  });
});

describe("a Playbook whose Segment exists", () => {
  it("chooses it by its filters, under another name, and says nothing more", async () => {
    open("playbook_we_miss_you", [{ id: "seg-renamed", name: "Lapsing regulars", filtersKey: filtersKey("last_order=within:24&stage=at-risk") }]);
    expect(chosenSegment()).toBe("Lapsing regulars");
    expect(notice()).toBeNull();
  });
});
