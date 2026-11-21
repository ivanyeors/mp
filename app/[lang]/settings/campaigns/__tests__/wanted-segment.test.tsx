// @vitest-environment jsdom
import { choose, click, press, settle, typeField, until } from "@/components/block-editor/__tests__/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerSegment, SegmentParams } from "@/lib/crm/segment-rules";
import type { CampaignDraftInput } from "@/lib/email-campaigns/rules";

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
const liveRow = (row: { id: string; name: string; params: Record<string, string> }): CustomerSegment => ({
  ...row,
  ignored: [],
  needsReview: false,
  count: 0,
  createdBy: null,
  createdAt: "2026-11-18T00:00:00Z",
  updatedAt: "2026-11-18T00:00:00Z",
});
vi.mock("@/lib/crm/segments", async (orig) => {
  const real = await orig<typeof import("@/lib/crm/segments")>();
  return {
    ...real,
    listSegments: vi.fn(async () => db.rows.map(liveRow)),
    createSegment: vi.fn(async (name: string, params: SegmentParams): Promise<CustomerSegment> => {
      if (db.rows.some((r) => r.name.toLowerCase() === name.toLowerCase())) throw new real.SegmentNameTakenError(name);
      const row = { id: `seg-${db.rows.length + 1}`, name, params: params as Record<string, string> };
      db.rows.push(row);
      return liveRow(row);
    }),
  };
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
  saveCampaign: vi.fn<(id: string | null, input: CampaignDraftInput) => Promise<{ ok: true; id: string }>>(async (id) => ({ ok: true, id: id ?? "c-new" })),
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
const { newCampaignFromAddress } = await import("@/lib/email-campaigns/starters");
const { findWanted, matchable } = await import("@/lib/email-campaigns/wanted-segment");
const { filtersKey } = await import("@/lib/crm/filters-key");

const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  if (url !== "/api/settings/customers/segments") throw new Error(`Unexpected fetch ${url}`);
  return POST(new Request(`https://admin.test${url}`, init));
});

const WE_MISS_YOU = { id: "7c0a1e2b-3d4f-4a5b-8c6d-9e0f1a2b3c4d", name: "We miss you", archivedAt: null };

type Row = { id: string; name: string; params: Record<string, string> };
let root: Root | null = null;
function open(
  query: Record<string, string>,
  segments: Row[] = db.rows,
  { canCreateSegments = true, parent = null as typeof WE_MISS_YOU | null, segmentsUnread = false } = {},
) {
  const { draft, wanted, note, found } = newCampaignFromAddress(query, matchable(segments.map(liveRow)), parent);
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <>
        <CampaignEditor
          campaign={null}
          draft={draft}
          stats={null}
          segments={segments.map(({ id, name }) => ({ id, name }))}
          staffEmail="owner@mpillow.com"
          pointsLive
          found={found}
          wanted={wanted}
          audienceNote={note}
          segmentsUnread={segmentsUnread}
          canCreateSegments={canCreateSegments}
        />
        <Toaster />
      </>,
    ),
  );
}

const notice = () => document.querySelector<HTMLElement>("[aria-labelledby='c-playbook-segment']");
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === label) ?? null;
const createButton = () => button("Create the Segment");
const chosenSegment = () => document.getElementById("c-segment")?.textContent;
const audience = () => document.getElementById("c-audience")?.textContent;
const sentBody = (n = 0) => JSON.parse(String(fetchMock.mock.calls[n][1]!.body)) as unknown;
const startPanel = () => document.querySelector("[aria-labelledby='c-start-title']");
const choice = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("[aria-labelledby='c-start-title'] button")].find((b) => b.firstElementChild?.textContent === label) ?? null;
const createTwice = async () => {
  const b = await until(createButton);
  await act(async () => {
    b.click();
    b.click();
  });
  await until(() => (notice() ? null : true));
};

beforeEach(() => {
  vi.clearAllMocks();
  db.rows = [];
  window.localStorage.clear();
  vi.stubGlobal("fetch", fetchMock);
  actions.findWantedSegmentAction.mockImplementation(async (address: Record<string, string>) => {
    const segments = matchable(db.rows.map(liveRow));
    const { wanted } = newCampaignFromAddress(address, segments, WE_MISS_YOU);
    const s = wanted ? findWanted(wanted, segments) : null;
    return { ok: true as const, segment: s ? { id: s.id, name: s.name } : null };
  });
});
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await settle(50);
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("a Playbook whose Segment is missing (slice 04)", () => {
  it("is named beside the Audience, and opening the page saves, sends and creates nothing", async () => {
    open({ starter: "playbook_we_miss_you" }, [{ id: "seg-loyal", name: "Loyal", params: { stage: "loyal" } }]);
    await settle(20);
    expect(document.querySelector<HTMLInputElement>("#c-name")!.value).toBe("We miss you");
    expect(notice()!.textContent).toContain("This Playbook sends to the Segment “At risk · 12 to 24 months”, which doesn't exist yet.");
    expect(createButton()).not.toBeNull();
    expect(actions.saveCampaign).not.toHaveBeenCalled();
    expect(actions.sendCampaignBatchAction).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Create the Segment saves it through the Segments' create with the Playbook's exact filters, chooses it, and a second click makes no second one", async () => {
    open({ starter: "playbook_we_miss_you" }, []);
    await createTwice();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentBody()).toEqual({ name: "At risk · 12 to 24 months", filters: { stage: "at-risk", last_order: "within:24" } });
    expect(auth.requireAdmin).toHaveBeenCalledWith("customers-edit");
    expect(auth.recordAdminAction).toHaveBeenCalledTimes(1);
    expect(auth.recordAdminAction.mock.calls[0][0]).toMatchObject({ action: "customer_segment.create" });
    expect(db.rows).toEqual([{ id: "seg-1", name: "At risk · 12 to 24 months", params: { stage: "at-risk", last_order: "within:24" } }]);
    expect(filtersKey(db.rows[0].params)).toBe(filtersKey("stage=at-risk&last_order=within:24"));
    expect(chosenSegment()).toBe("At risk · 12 to 24 months");
    expect(createButton()).toBeNull();
    expect(actions.saveCampaign).not.toHaveBeenCalled();
  });

  it("keeps Include unengaged on the campaign, never in the Segment's filters (Welcome back)", async () => {
    open({ starter: "playbook_welcome_back" }, []);
    expect(document.querySelector("[aria-describedby='c-include-unengaged-hint']")!.getAttribute("aria-checked")).toBe("true");
    await click(await until(createButton));
    await until(() => (notice() ? null : true));
    expect(sentBody()).toEqual({ name: "At risk · Lapsed", filters: { stage: "at-risk:lapsed" } });
    expect(db.rows[0].params).toEqual({ stage: "at-risk:lapsed" });
    expect(chosenSegment()).toBe("At risk · Lapsed");
  });

  it("reports a name taken by a Segment with other filters, and leaves that Segment as it is", async () => {
    db.rows = [{ id: "seg-old", name: "At risk · 12 to 24 months", params: { stage: "at-risk" } }];
    open({ starter: "playbook_we_miss_you" });
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
    open({ starter: "playbook_we_miss_you" }, [], { canCreateSegments: false });
    expect(notice()!.textContent).toContain("Ask an Owner, or someone whose role can make changes on Customers, to create it.");
    expect(createButton()).toBeNull();
  });

  it("chooses an existing one by its filters, under another name, and says nothing more", async () => {
    open({ starter: "playbook_we_miss_you" }, [{ id: "seg-renamed", name: "Lapsing regulars", params: { last_order: "within:24", stage: "at-risk" } }]);
    expect(chosenSegment()).toBe("Lapsing regulars");
    expect(notice()).toBeNull();
  });
});

describe("?stage=<stage> (slice 06)", () => {
  it("names the stage's missing Segment, offers the Start panel, and creates it as “At risk” with exactly stage=at-risk", async () => {
    open({ stage: "at-risk" }, [{ id: "seg-near", name: "At risk · 12 to 24 months", params: { stage: "at-risk", last_order: "within:24" } }]);
    expect(audience()).toBe("A saved Segment");
    expect(notice()!.textContent).toContain("This campaign sends to the Segment “At risk”, which doesn't exist yet.");
    await until(startPanel);
    expect(document.querySelector<HTMLInputElement>("#c-name")!.value).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
    await createTwice();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentBody()).toEqual({ name: "At risk", filters: { stage: "at-risk" } });
    expect(db.rows.at(-1)).toEqual({ id: "seg-1", name: "At risk", params: { stage: "at-risk" } });
    expect(chosenSegment()).toBe("At risk");
    expect(actions.saveCampaign).not.toHaveBeenCalled();
  });

  it("reports “At risk” taken by a Segment with other filters, and overwrites nothing", async () => {
    db.rows = [{ id: "seg-old", name: "at risk", params: { stage: "at-risk:lapsed" } }];
    open({ stage: "at-risk" });
    await click(await until(createButton));
    const alert = await until(() => notice()?.querySelector("[role='alert']"));
    expect(alert.textContent).toContain("A Segment named “At risk” already exists. It has other filters, so it was left as it is");
    expect(db.rows).toEqual([{ id: "seg-old", name: "at risk", params: { stage: "at-risk:lapsed" } }]);
    expect(auth.recordAdminAction).not.toHaveBeenCalled();
  });

  it("refuses Lost in words: no Segment, no create", async () => {
    open({ stage: "lost" }, [{ id: "seg-lost", name: "Lost", params: { stage: "lost" } }]);
    expect(document.body.textContent).toContain("A Lost customer has unsubscribed from marketing email, so a campaign to the Lost stage would send to nobody.");
    expect(audience()).not.toBe("A saved Segment");
    expect(notice()).toBeNull();
    expect(createButton()).toBeNull();
  });

  it("keeps the stage's Segment when a layout Starter with no Audience is chosen, and gives way to a Playbook's", async () => {
    open({ stage: "at-risk" }, []);
    await click(await until(() => choice("A Starter")));
    await click(choice("Product launch")!);
    expect(notice()!.textContent).toContain("This campaign sends to the Segment “At risk”");
    await click(button("Clear all")!);
    await click(await until(() => choice("A Starter")));
    await click(choice("We miss you")!);
    expect(notice()!.textContent).toContain("This Playbook sends to the Segment “At risk · 12 to 24 months”");
  });
});

describe("?after=<campaign id>:<did> (slice 06)", () => {
  const AFTER = { after: `${WE_MISS_YOU.id}:not-clicked` };

  it("names the follow-up's missing Segment and the Rest period, and creates “We miss you · didn't click” with exactly its campaign filter", async () => {
    open(AFTER, [], { parent: WE_MISS_YOU });
    expect(notice()!.textContent).toContain("This follow-up campaign sends to the Segment “We miss you · didn't click”, which doesn't exist yet.");
    expect(notice()!.textContent).toContain("It is for the people who got “We miss you” and didn't click. A follow-up reaches them after the Rest period");
    await createTwice();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentBody()).toEqual({ name: "We miss you · didn't click", filters: { campaign: `${WE_MISS_YOU.id}:not-clicked` } });
    expect(db.rows).toEqual([{ id: "seg-1", name: "We miss you · didn't click", params: { campaign: `${WE_MISS_YOU.id}:not-clicked` } }]);
    expect(chosenSegment()).toBe("We miss you · didn't click");
  });

  it("makes the name unique when a Segment with other filters has it, and leaves that Segment as it is", async () => {
    const old = { id: "seg-old", name: "We miss you · didn't click", params: { campaign: `${WE_MISS_YOU.id}:clicked` } };
    db.rows = [old];
    open(AFTER, db.rows, { parent: WE_MISS_YOU });
    expect(notice()!.textContent).toContain("“We miss you · didn't click (2)”");
    await createTwice();
    expect(sentBody()).toEqual({ name: "We miss you · didn't click (2)", filters: { campaign: `${WE_MISS_YOU.id}:not-clicked` } });
    expect(db.rows[0]).toEqual(old);
    expect(chosenSegment()).toBe("We miss you · didn't click (2)");
  });

  it("is saved with the follow-up Segment as its Audience", async () => {
    open(AFTER, [], { parent: WE_MISS_YOU });
    await createTwice();
    typeField(document.querySelector<HTMLInputElement>("#c-name")!, "We miss you, again");
    press("s", { ctrl: true }, document.body);
    await settle(20);
    expect(actions.saveCampaign).toHaveBeenCalledTimes(1);
    expect(actions.saveCampaign.mock.calls[0][0]).toBeNull();
    expect(actions.saveCampaign.mock.calls[0][1]).toMatchObject({ audience: "segment", segmentId: "seg-1" });
  });
});

describe("review findings on the shared mechanism", () => {
  it("chooses a Segment made with the wanted filters since the page loaded, instead of claiming other filters (409)", async () => {
    open({ stage: "at-risk" }, []);
    db.rows = [{ id: "seg-tab", name: "At risk", params: { stage: "at-risk" } }];
    await click(await until(createButton));
    await until(() => (notice() ? null : true));
    expect(actions.findWantedSegmentAction).toHaveBeenCalledWith({ stage: "at-risk" });
    expect(chosenSegment()).toBe("At risk");
    expect(document.body.textContent).not.toContain("It has other filters");
    expect(db.rows).toHaveLength(1);
  });

  it("says the Segments could not be read, and offers no create, when the page's read failed", async () => {
    open({ starter: "playbook_we_miss_you" }, [], { segmentsUnread: true });
    expect(notice()!.textContent).toContain("the Segments could not be read, so it isn't known whether it exists");
    expect(notice()!.textContent).not.toContain("doesn't exist yet");
    expect(createButton()).toBeNull();
  });

  it("forgets the Playbook's Segment after Clear all and A short note", async () => {
    open({ starter: "playbook_we_miss_you" }, []);
    expect(notice()).not.toBeNull();
    await click(button("Clear all")!);
    await click(await until(() => choice("A Starter")));
    await click(choice("A short note")!);
    expect(notice()).toBeNull();
    expect(createButton()).toBeNull();
  });

  it("forgets the Playbook's Segment when A short note is added from the palette: the email is no longer the Playbook", async () => {
    open({ starter: "playbook_we_miss_you" }, []);
    expect(notice()).not.toBeNull();
    const tab = [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) => t.textContent === "Starters")!;
    await act(async () => void tab.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 })));
    await click(await until(() => [...document.querySelectorAll<HTMLButtonElement>("ul[aria-label='Starters'] button")].find((b) => b.textContent?.startsWith("A short note"))));
    expect(notice()).toBeNull();
  });

  it("forgets the Playbook's Segment after Clear all alone", async () => {
    open({ starter: "playbook_we_miss_you" }, []);
    await click(button("Clear all")!);
    expect(notice()).toBeNull();
  });

  it("forgets the wanted Segment once Staff choose who to send to by hand", async () => {
    open({ stage: "at-risk" }, [{ id: "seg-loyal", name: "Loyal", params: { stage: "loyal" } }]);
    expect(notice()).not.toBeNull();
    await choose(document.getElementById("c-audience")!, "Everyone subscribed to marketing email");
    await choose(document.getElementById("c-audience")!, "A saved Segment");
    expect(notice()).toBeNull();
  });
});

describe("the wanted Segment moves with Undo and Redo (review, slice 06)", () => {
  const undo = () => press("z", { ctrl: true }, document.body);
  const redo = () => press("z", { ctrl: true, shift: true }, document.body);
  const says = () => notice()?.querySelector("#c-playbook-segment")?.textContent ?? null;
  const paletteAdd = async (label: string) => {
    const tab = [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) => t.textContent === "Starters")!;
    await act(async () => void tab.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 })));
    await click(await until(() => [...document.querySelectorAll<HTMLButtonElement>("ul[aria-label='Starters'] button")].find((b) => b.textContent?.startsWith(label))));
  };

  it("a Playbook added from the palette, undone, gives back the first Playbook's Segment, and Redo the second's", async () => {
    open({ starter: "playbook_we_miss_you" }, []);
    await paletteAdd("Welcome back");
    expect(says()).toContain("“At risk · Lapsed”");
    await act(async () => undo());
    expect(document.querySelector<HTMLInputElement>("#c-name")!.value).toBe("We miss you");
    expect(says()).toContain("“At risk · 12 to 24 months”");
    await act(async () => redo());
    expect(says()).toContain("“At risk · Lapsed”");
  });

  it("a Playbook started on ?stage=, undone, gives back the stage's Segment, and Redo the Playbook's", async () => {
    open({ stage: "at-risk" }, []);
    await click(await until(() => choice("A Starter")));
    await click(choice("We miss you")!);
    expect(says()).toContain("This Playbook sends to the Segment “At risk · 12 to 24 months”");
    await act(async () => undo());
    expect(says()).toContain("This campaign sends to the Segment “At risk”");
    await act(async () => redo());
    expect(says()).toContain("This Playbook sends to the Segment “At risk · 12 to 24 months”");
  });

  it("Clear all's toast Undo gives back the Playbook's Segment and Create, and Redo takes it away again", async () => {
    open({ starter: "playbook_we_miss_you" }, []);
    await click(button("Clear all")!);
    expect(notice()).toBeNull();
    const toastUndo = await until(() => [...document.querySelectorAll<HTMLButtonElement>("[data-sonner-toast] button")].find((b) => b.textContent === "Undo"));
    await click(toastUndo);
    expect(document.querySelector<HTMLInputElement>("#c-name")!.value).toBe("We miss you");
    expect(says()).toContain("“At risk · 12 to 24 months”");
    expect(createButton()).not.toBeNull();
    await act(async () => redo());
    expect(notice()).toBeNull();
  });

  it("a create's error is not shown under another wanted Segment's notice", async () => {
    db.rows = [{ id: "seg-old", name: "At risk", params: { stage: "at-risk:lapsed" } }];
    open({ stage: "at-risk" });
    await click(await until(createButton));
    await until(() => notice()?.querySelector("[role='alert']"));
    await click(await until(() => choice("A Starter")));
    await click(choice("We miss you")!);
    expect(says()).toContain("“At risk · 12 to 24 months”");
    expect(notice()!.querySelector("[role='alert']")).toBeNull();
    expect(notice()!.textContent).not.toContain("already exists");
  });
});

describe("which wanted Segment survives (the split, slice 06)", () => {
  it.each([
    [{ stage: "at-risk" }, "This campaign sends to the Segment “At risk”"],
    [{ after: `${WE_MISS_YOU.id}:not-clicked` }, "This follow-up campaign sends to the Segment “We miss you · didn't click”"],
  ])("the address's (%j) survives Clear all", async (query, words) => {
    open(query, [], { parent: WE_MISS_YOU });
    await click(await until(() => choice("A Starter")));
    await click(choice("Product launch")!);
    await click(button("Clear all")!);
    expect(notice()!.textContent).toContain(words);
  });

  it.each([[{ stage: "at-risk" }], [{ after: `${WE_MISS_YOU.id}:not-clicked` }]])("the address's (%j) goes with a Starter of another Audience (the sign-in invitation)", async (query) => {
    open(query, [], { parent: WE_MISS_YOU });
    expect(notice()).not.toBeNull();
    await click(await until(() => choice("A Starter")));
    await click(choice("New website: sign in for points")!);
    expect(audience()).toBe("Imported from Shopify, not signed in yet");
    expect(notice()).toBeNull();
    await act(async () => press("z", { ctrl: true }, document.body));
    expect(notice()).not.toBeNull();
  });
});
