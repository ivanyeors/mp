// @vitest-environment jsdom
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Customer, CustomerAddress } from "@/lib/types/ecommerce";

import "@/components/block-editor/__tests__/dom";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "c1" }),
  usePathname: () => "/en-US/settings/customers/c1",
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));

const { CustomerDetailClient } = await import("../[id]/customer-detail-client");

let requests: string[] = [];
beforeEach(() => {
  requests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      requests.push(String(url));
      return new Promise(() => {});
    }),
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

const customer = {
  id: "c1",
  email: "ana@x.test",
  first_name: "Ana",
  last_name: "Tan",
  phone: "+6591234567",
  locale: "en-US",
  tags: [],
  total_orders: 2,
  total_spent: 480,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
} as unknown as Customer;

const address = (id: string, label: string, isDefault: boolean, createdAt: string): CustomerAddress => ({
  id,
  customer_id: "c1",
  label,
  recipient: "Ana Tan",
  line1: "1 Orchard Road",
  line2: null,
  city: "Singapore",
  state: null,
  postal_code: "238824",
  country: "SG",
  phone: null,
  is_default: isDefault,
  created_at: createdAt,
  updated_at: createdAt,
});

const addresses = [
  address("a-old", "Old flat", false, "2026-01-01T00:00:00Z"),
  address("a-home", "Home", true, "2026-02-01T00:00:00Z"),
  address("a-office", "Office", false, "2026-03-01T00:00:00Z"),
];

const mount = async () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <StrictMode>
        <CustomerDetailClient
          initialData={{ customer: { ok: true, row: customer }, notes: [], addresses }}
          canEdit={false}
          viewer={{ userId: "u1", grantsAll: false }}
        />
      </StrictMode>,
    ),
  );
};

const customerReads = () => requests.filter((u) => u === "/api/shop/customers/c1" || u.startsWith("/api/shop/customers/c1/addresses"));

describe("Customer detail: what the server sent", () => {
  it("reads neither the customer nor their addresses again on mount, in Strict Mode", async () => {
    await mount();
    expect(customerReads()).toEqual([]);
    expect(host.textContent).toContain("Ana Tan");
  });

  it("shows the server's addresses at once, the default first and then the newest", async () => {
    await mount();
    const row = [...host.querySelectorAll("button")].find((b) => b.textContent?.includes("Addresses"))!;
    expect(row.textContent).toContain("3 saved");
    await act(async () => row.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const labels = [...host.querySelectorAll("span.font-medium")].map((s) => s.textContent).filter((t) => ["Home", "Office", "Old flat"].includes(t ?? ""));
    expect(labels).toEqual(["Home", "Office", "Old flat"]);
  });
});
