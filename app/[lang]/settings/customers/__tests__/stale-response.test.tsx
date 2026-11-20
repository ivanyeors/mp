// @vitest-environment jsdom
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FollowUpListData, FollowUpScope } from "@/lib/crm/followup-rules";

/**
 * The Customers list and the Follow-ups tab fetch when a filter, page or
 * scope changes. Two quick changes start two requests; whichever answers
 * last must not be the older one. Each test holds the responses and answers
 * them in the wrong order on purpose.
 */

// matchMedia and the act flag, which jsdom leaves out.
import "@/components/block-editor/__tests__/dom";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/settings/customers",
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));

const { FollowUpsTab } = await import("../followups-tab");
const { CustomersClient } = await import("../customers-client");

/** Every fetch waits until the test answers it. */
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
const mount = async (node: React.ReactNode) => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
};
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  vi.unstubAllGlobals();
});

const button = (label: string) =>
  [...host.querySelectorAll("button, a")].find((b) => b.textContent?.trim() === label)!;
/** The search box's debounce settles 350ms after mount (and resets the page): let it pass. */
const pastDebounce = () => act(() => new Promise<void>((r) => setTimeout(r, 400)));
const click = (el: Element) => act(async () => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const lastFor = (part: string) => [...held].reverse().find((h) => h.url.includes(part))!;

const followUps = (scope: FollowUpScope, title: string): FollowUpListData & { ok: true } => ({
  ok: true,
  scope,
  rows: [
    {
      id: `f-${scope}`,
      customerId: "c1",
      customerName: "Mei Tan",
      title,
      dueOn: "2026-10-10",
      assignee: { id: "p-jess", name: "Jess", archived: false },
      createdBy: { id: "p-jess", name: "Jess" },
      createdAt: "2026-10-01T02:00:00Z",
      doneAt: null,
      doneBy: null,
    },
  ],
  truncated: false,
  today: "2026-10-21",
  me: { id: "p-jess", name: "Jess" },
  assignees: [],
});

describe("Follow-ups tab: All then Overdue, answered out of order", () => {
  it("shows Overdue's rows when All's slower response lands last", async () => {
    await mount(<FollowUpsTab canEdit={false} />);
    await lastFor("scope=mine").answer(followUps("mine", "Mine row"));

    await click(button("All"));
    await click(button("Overdue"));
    const all = lastFor("scope=all");
    const overdue = lastFor("scope=overdue");

    await overdue.answer(followUps("overdue", "Overdue row"));
    await all.answer(followUps("all", "All row"));

    expect(host.textContent).toContain("Overdue row");
    expect(host.textContent).not.toContain("Nothing overdue.");
  });

  it("makes no request on mount when the caller passed the list, even in Strict Mode", async () => {
    await mount(
      <StrictMode>
        <FollowUpsTab canEdit={false} initialData={followUps("all", "Server row")} />
      </StrictMode>,
    );
    expect(held.map((h) => h.url)).toEqual([]);
    expect(host.textContent).toContain("Server row");
  });
});

const customerRow = (name: string) => ({
  id: name,
  first_name: name,
  last_name: null,
  email: `${name.toLowerCase()}@example.test`,
});
const customersPage = (page: number, name: string) => ({
  ok: true,
  rows: [customerRow(name)],
  total: 100,
  page,
  limit: 20,
});

describe("Customers list: page 2 then page 3, answered out of order", () => {
  it("shows page 3's rows when page 2's slower response lands last", async () => {
    await mount(
      <CustomersClient
        initialData={{ customers: customersPage(1, "Pageone") as never }}
      />,
    );
    expect(held.filter((h) => h.url.includes("/api/shop/customers"))).toEqual([]);
    await pastDebounce();

    await click(button("2"));
    await click(button("3"));
    const two = lastFor("page=2");
    const three = lastFor("page=3");

    await three.answer(customersPage(3, "Pagethree"));
    await two.answer(customersPage(2, "Pagetwo"));

    expect(host.textContent).toContain("Pagethree");
    expect(host.textContent).not.toContain("Pagetwo");
  });

  it("does not refetch page 1 on mount in Strict Mode when the server sent it", async () => {
    await mount(
      <StrictMode>
        <CustomersClient initialData={{ customers: customersPage(1, "Pageone") as never }} />
      </StrictMode>,
    );
    expect(held.filter((h) => h.url.includes("/api/shop/customers")).map((h) => h.url)).toEqual([]);
  });

  it("refetches when a filter goes back to the server's, after another answered", async () => {
    await mount(<CustomersClient initialData={{ customers: customersPage(1, "Pageone") as never }} />);
    await pastDebounce();
    await click(button("2"));
    await lastFor("page=2").answer(customersPage(2, "Pagetwo"));
    expect(host.textContent).toContain("Pagetwo");
    await click(button("1"));
    const one = lastFor("page=1");
    expect(one).toBeDefined();
    await one.answer(customersPage(1, "Pageone"));
    expect(host.textContent).toContain("Pageone");
  });
});
