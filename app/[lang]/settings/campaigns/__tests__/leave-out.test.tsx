// @vitest-environment jsdom
import { settle, until } from "@/components/block-editor/__tests__/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Campaign, CampaignDraft, CampaignDraftInput } from "@/lib/email-campaigns/rules";

/**
 * *Leave out people in…* (PRD-campaign-audiences slice 06), in the editor as
 * Staff use it: the Segments a campaign leaves out show as chips, each taken
 * back with its ×, and what the editor previews and saves carries them. Once
 * a wave was planned they are fixed with the audience: no × and no picker.
 */

const actions = vi.hoisted(() => ({
  archiveCampaignAction: vi.fn(),
  checkCampaignReadiness: vi.fn(() => new Promise(() => undefined)),
  duplicateCampaign: vi.fn(),
  planCampaignWave: vi.fn(),
  previewCampaign: vi.fn(async (input: CampaignDraftInput) => ({ ok: true as const, subject: input.subject, html: "<p>preview</p>", text: "" })),
  saveCampaign: vi.fn(async (id: string | null) => ({ ok: true as const, id: id ?? "new" })),
  sendCampaignBatchAction: vi.fn(),
  sendCampaignTestAction: vi.fn(),
}));
vi.mock("../actions", () => actions);
vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/settings/campaigns/x",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { CampaignEditor } = await import("../campaign-editor");

const STAFF = { id: "5e000000-0000-4000-8000-0000000000a1", name: "Staff and test accounts" };
const RECENT = { id: "5e000000-0000-4000-8000-0000000000b2", name: "Bought in the last 14 days" };
const OWNERS = { id: "5e000000-0000-4000-8000-0000000000c3", name: "Pillow owners" };

const DRAFT: CampaignDraft = {
  name: "December",
  subject: "Sleep cooler",
  preheader: null,
  body: "Our covers are back.",
  content: null,
  greeting: true,
  button: null,
  audience: "segment",
  segmentId: OWNERS.id,
  excludeSegmentIds: [STAFF.id, RECENT.id],
};
const saved = (over: Partial<Campaign> = {}): Campaign => ({
  ...DRAFT,
  id: "5a1d3c2e-7b4f-4e6a-9c8d-0f1e2d3c4b5a",
  createdAt: "2026-10-21T00:00:00Z",
  updatedAt: "2026-10-21T00:00:00Z",
  lockedAt: null,
  archivedAt: null,
  createdBy: null,
  ...over,
});

let root: Root | null = null;
function mount(campaign: Campaign) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<CampaignEditor campaign={campaign} draft={campaign} stats={null} segments={[STAFF, RECENT, OWNERS]} staffEmail="owner@mpillow.com" />));
}

const chips = () => [...document.querySelectorAll("[aria-label='Segments left out'] li")].map((li) => li.textContent?.trim());
const removeButton = (name: string) => document.querySelector<HTMLButtonElement>(`button[aria-label='Stop leaving out ${name}']`);
const lastPreview = () => actions.previewCampaign.mock.calls.at(-1)?.[0];

beforeEach(() => vi.clearAllMocks());
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  await settle(20);
});

describe("Leave out people in…", () => {
  it("shows each Segment left out, in order, and previews with them", async () => {
    mount(saved());
    expect(chips()).toEqual([STAFF.name, RECENT.name]);
    const preview = await until(() => lastPreview());
    expect(preview).toMatchObject({ audience: "segment", segmentId: OWNERS.id, excludeSegmentIds: [STAFF.id, RECENT.id] });
  });

  it("takes one back with its ×", async () => {
    mount(saved());
    act(() => removeButton(STAFF.name)!.click());
    expect(chips()).toEqual([RECENT.name]);
    await until(() => (lastPreview()?.excludeSegmentIds?.length === 1 ? lastPreview() : null));
    expect(lastPreview()).toMatchObject({ excludeSegmentIds: [RECENT.id] });
  });

  it("is fixed once a wave was planned: no ×, no picker", () => {
    mount(saved({ lockedAt: "2026-10-22T00:00:00Z" }));
    expect(chips()).toEqual([STAFF.name, RECENT.name]);
    expect(removeButton(STAFF.name)).toBeNull();
    expect(document.getElementById("c-leave-out")).toBeNull();
  });
});
