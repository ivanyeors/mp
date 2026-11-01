// @vitest-environment jsdom
import { choose, click, settle, typeField, until } from "@/components/block-editor/__tests__/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CampaignContent } from "@/lib/email-campaigns/content";
import type { CampaignProductCard } from "@/lib/email-campaigns/products";
import type { Campaign, CampaignDraft, CampaignDraftInput } from "@/lib/email-campaigns/rules";

/**
 * The products block in the campaign editor (PRD-campaign-email-editor slice
 * 07), as the owner's demo goes: add *Products*, pick the FibreCool cover and
 * the Cervical Neck Support from the shop's Listed products, see each with
 * its photo, name and price as the shop shows them, lay them out one per
 * row, and Save it by id. A product since un-listed says so by name. A
 * button can go to one product's page.
 */

const COVER = "3b7e1f2a-9c4d-4a6b-8e1f-5d2c3b4a6e7f";
const NECK = "7c2a4e6b-1d3f-4b8a-9e2c-6f4d5a3b2c1e";
const SHOP: CampaignProductCard[] = [
  { id: COVER, title: "FibreCool Cover", photoUrl: "https://x.test/cover.webp", price: "from SGD 39.00", listed: true },
  { id: NECK, title: "Cervical Neck Support", photoUrl: null, price: "SGD 45.00 (was SGD 59.00)", listed: true },
];

type SaveResult = { ok: true; id: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };
const actions = vi.hoisted(() => ({
  archiveCampaignAction: vi.fn(),
  checkCampaignReadiness: vi.fn(() => new Promise(() => undefined)),
  describeCampaignProducts: vi.fn(),
  duplicateCampaign: vi.fn(),
  findCampaignProducts: vi.fn(),
  planCampaignWave: vi.fn(),
  placeCampaignImage: vi.fn(),
  previewCampaign: vi.fn<(input: CampaignDraftInput, opts?: { forceDark?: boolean }) => Promise<{ ok: true; subject: string; html: string; text: string; from: string }>>(
    async (input) => ({ ok: true, subject: input.subject, html: "<p>preview</p>", text: "", from: "Mpillow <hello@hello.mpillow.com>" }),
  ),
  saveCampaign: vi.fn<(id: string | null, input: CampaignDraftInput) => Promise<SaveResult>>(async (id) => ({ ok: true, id: id ?? "new" })),
  sendCampaignBatchAction: vi.fn(),
  sendCampaignTestAction: vi.fn(),
}));
vi.mock("../actions", () => actions);
vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/settings/campaigns/new",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";
const { CampaignEditor } = await import("../campaign-editor");

const CONTENT: CampaignContent = {
  v: 1,
  blocks: [{ id: "title", type: "heading", level: 1, text: "Sleep cooler" }],
  fallbacks: {},
};
const draftWith = (content: CampaignContent): CampaignDraft => ({
  name: "December cooling launch",
  subject: "Sleep cooler this December",
  preheader: "",
  body: "",
  content,
  greeting: false,
  button: null,
  audience: "subscribed",
  segmentId: null,
  excludeSegmentIds: [],
  includeUnengaged: false,
});
const saved = (draft: CampaignDraft): Campaign => ({
  ...draft,
  id: "5a1d3c2e-7b4f-4e6a-9c8d-0f1e2d3c4b5a",
  createdAt: "2026-10-21T00:00:00Z",
  updatedAt: "2026-10-21T00:00:00Z",
  lockedAt: null,
  archivedAt: null,
  createdBy: null,
});

let root: Root | null = null;
function mount(draft: CampaignDraft) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <>
        <CampaignEditor campaign={saved(draft)} draft={draft} stats={null} segments={[]} staffEmail="owner@mpillow.com" />
        <Toaster />
      </>,
    ),
  );
}

const button = (label: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === label || b.getAttribute("aria-label") === label) ?? null;
const card = (n: number) => document.querySelectorAll<HTMLElement>("li[data-block-id]")[n];
const savedContent = () => actions.saveCampaign.mock.calls.at(-1)![1].content!;
const save = async () => {
  await act(async () => button("Save changes")!.click());
  await settle();
};
const radio = (el: HTMLElement, group: string, label: string) =>
  [...el.querySelectorAll<HTMLElement>(`[role="radiogroup"][aria-label="${group}"] [role="radio"]`)].find((r) => r.textContent === label)!;
/** Opens the shop's picker from `label`, once it has loaded, and picks `title`. */
async function pick(label: string, title: string) {
  await click(await until(() => (button(label)?.disabled === false ? button(label) : null)));
  const dialog = await until(() => document.querySelector<HTMLElement>('[role="dialog"]'));
  const option = await until(() => [...dialog.querySelectorAll<HTMLButtonElement>("li button")].find((b) => b.textContent?.includes(title)));
  await click(option);
  await settle();
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  actions.findCampaignProducts.mockImplementation(async (search: string) => ({
    ok: true,
    products: SHOP.filter((p) => !search || p.title!.toLowerCase().includes(search.toLowerCase())),
  }));
  actions.describeCampaignProducts.mockImplementation(async (ids: string[]) => ({
    ok: true,
    products: ids.map((id) => SHOP.find((p) => p.id === id) ?? { id, title: null, photoUrl: null, price: null, listed: false }),
  }));
});
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await settle(50);
  document.body.innerHTML = "";
});

describe("a products block", () => {
  it("picks two of the shop's products, shows each as the shop prices it, lays them one per row, and saves their ids", async () => {
    mount(draftWith(CONTENT));
    await choose(button("Add block")!, "Products");
    const products = card(1);
    expect(products.textContent).toContain("Choose up to three products from the shop.");
    expect(products.querySelector<HTMLInputElement>('input[aria-label="Each product\'s button: label"]')!.value).toBe("Shop now");

    await pick("Add a product", "FibreCool Cover");
    expect(actions.findCampaignProducts).toHaveBeenCalledWith("");
    expect(products.textContent).toContain("FibreCool Cover");
    expect(products.textContent).toContain("from SGD 39.00");
    await pick("Add a product", "Cervical Neck Support");
    expect(products.textContent).toContain("SGD 45.00 (was SGD 59.00)");

    // The selected block's options: side by side, or one per row.
    expect(radio(products, "Layout", "Side by side").getAttribute("aria-checked")).toBe("true");
    await click(radio(products, "Layout", "One per row"));
    await save();
    expect(savedContent().blocks[1]).toEqual({ id: expect.any(String), type: "products", products: [COVER, NECK], layout: "rows", buttonLabel: "Shop now" });
  });

  it("stops at three", async () => {
    const third = "9e4b6d8a-2f1c-4e3a-8b7d-1c2e3f4a5b6e";
    mount(draftWith({ ...CONTENT, blocks: [...CONTENT.blocks, { id: "p", type: "products", products: [COVER, NECK, third], layout: "side_by_side", buttonLabel: "Shop now" }] }));
    await until(() => (card(1).textContent?.includes("Cervical Neck Support") ? true : null));
    expect(button("Add a product")).toBeNull();
    expect(button("Remove FibreCool Cover")).not.toBeNull();
  });

  it("offers a product only once, and searches the shop", async () => {
    mount(draftWith({ ...CONTENT, blocks: [...CONTENT.blocks, { id: "p", type: "products", products: [COVER], layout: "side_by_side", buttonLabel: "Shop now" }] }));
    const products = card(1);
    await until(() => (products.textContent?.includes("FibreCool Cover") ? true : null));
    await click(await until(() => (button("Add a product")?.disabled === false ? button("Add a product") : null)));
    const dialog = await until(() => document.querySelector<HTMLElement>('[role="dialog"]'));
    const cover = await until(() => [...dialog.querySelectorAll<HTMLButtonElement>("li button")].find((b) => b.textContent?.includes("FibreCool")));
    expect(cover.disabled).toBe(true);
    expect(cover.textContent).toContain("In this block already");

    typeField(dialog.querySelector<HTMLInputElement>('input[aria-label="Search the shop"]')!, "neck");
    await until(() => (actions.findCampaignProducts.mock.calls.some(([q]) => q === "neck") ? true : null));
    await until(() => (dialog.querySelectorAll("li").length === 1 ? true : null));
    expect(dialog.textContent).toContain("Cervical Neck Support");
  });

  it("says so, by name, when a product it shows is no longer in the shop", async () => {
    // A product this page has not read yet: each is read once while the page is open.
    const CASE = "9e4b6d8a-2f1c-4e3a-8b7d-1c2e3f4a5b6d";
    actions.describeCampaignProducts.mockResolvedValue({
      ok: true,
      products: [{ id: CASE, title: "Camel Bolster Case", photoUrl: null, price: null, listed: false }],
    });
    mount(draftWith({ ...CONTENT, blocks: [...CONTENT.blocks, { id: "p", type: "products", products: [CASE], layout: "side_by_side", buttonLabel: "Shop now" }] }));
    const products = card(1);
    await until(() => (products.textContent?.includes("Camel Bolster Case") ? true : null));
    expect(products.textContent).toContain("No longer in the shop: remove it or list it again.");
    await click(button("Remove Camel Bolster Case")!);
    expect(products.textContent).toContain("Choose up to three products from the shop.");
  });

  it("shows Save's errors on the block", async () => {
    actions.saveCampaign.mockResolvedValueOnce({ ok: false, error: "Check the highlighted fields.", fieldErrors: { "content.blocks.1.products": "Choose a product." } });
    mount(draftWith(CONTENT));
    await choose(button("Add block")!, "Products");
    await save();
    expect(card(1).textContent).toContain("Choose a product.");
  });
});

describe("a button that goes to a product", () => {
  it("shows its product as the shop has it, and changes it from the picker", async () => {
    mount(
      draftWith({
        ...CONTENT,
        blocks: [...CONTENT.blocks, { id: "b", type: "buttons", buttons: [{ label: "Shop the cover", target: "product", product: COVER, style: "primary" }] }],
      }),
    );
    const buttons = card(1);
    await until(() => (buttons.textContent?.includes("FibreCool Cover") ? true : null));
    expect(buttons.textContent).toContain("from SGD 39.00");
    await pick("Change the product", "Cervical Neck Support");
    expect(buttons.textContent).toContain("Cervical Neck Support");
    await save();
    expect(savedContent().blocks[1]).toEqual({
      id: "b",
      type: "buttons",
      buttons: [{ label: "Shop the cover", target: "product", product: NECK, style: "primary" }],
    });
  });
});
