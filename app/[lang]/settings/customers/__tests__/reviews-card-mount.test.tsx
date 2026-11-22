// @vitest-environment jsdom
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerReviewsData } from "@/lib/crm/reviews";

import "@/components/block-editor/__tests__/dom";

const { CustomerReviewsCard } = await import("../[id]/customer-reviews-card");

type Held = { url: string; answer: (body: unknown) => Promise<void> };
let held: Held[] = [];
beforeEach(() => {
  held = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (url: string) =>
        new Promise((resolve) => {
          held.push({
            url: String(url),
            answer: (body) =>
              act(async () => {
                resolve({ ok: true, status: 200, json: async () => body });
              }),
          });
        }),
    ),
  );
});

let root: Root | null = null;
let host: HTMLElement;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  vi.unstubAllGlobals();
});

const DATA: CustomerReviewsData = {
  ok: true,
  google: [],
  shop: [
    { id: "s1", rating: 4, product: "Premium Mpillow", status: "pending", createdAt: "2026-10-28T02:00:00.000Z" },
    { id: "s2", rating: 5, product: "Mbolster", status: "approved", createdAt: "2026-10-29T02:00:00.000Z" },
  ],
  request: null,
  possible: [],
};

const mount = async (initialData: CustomerReviewsData | null, onCount: (n: number) => void) => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <StrictMode>
        <CustomerReviewsCard customerId="c1" canEdit={false} initialData={initialData} onCount={onCount} />
      </StrictMode>,
    ),
  );
};

const button = (label: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === label)!;

describe("the customer's Reviews card", () => {
  it("shows the reviews the server read, asking for nothing, in Strict Mode", async () => {
    const onCount = vi.fn();
    await mount(DATA, onCount);
    expect(held.map((h) => h.url)).toEqual([]);
    expect(host.textContent).toContain("Premium Mpillow");
    expect(onCount).not.toHaveBeenCalled();
  });

  it("offers Try again when the server could not read them, then shows them and their count", async () => {
    const onCount = vi.fn();
    await mount(null, onCount);
    expect(held.map((h) => h.url)).toEqual([]);
    expect(host.textContent).toContain("Could not load reviews.");

    await act(async () => button("Try again").dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(held.map((h) => h.url)).toEqual(["/api/shop/customers/c1/reviews"]);
    await held[0]!.answer(DATA);

    expect(host.textContent).toContain("Premium Mpillow");
    expect(onCount).toHaveBeenLastCalledWith(2);
  });
});
