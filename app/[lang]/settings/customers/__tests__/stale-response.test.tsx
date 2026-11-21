// @vitest-environment jsdom
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FollowUpListData, FollowUpScope } from "@/lib/crm/followup-rules";

import "@/components/block-editor/__tests__/dom";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/settings/customers",
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));

const { FollowUpsTab } = await import("../followups-tab");
const { CustomersPageTabs } = await import("../customers-page-tabs");
const { WORKING_AS_CHANGED_EVENT } = await import("@/components/settings/working-as-picker");
const { CustomersClient } = await import("../customers-client");
const { FindCustomerLink } = await import("../review-match-parts");
const { CustomerJourney } = await import("../[id]/customer-journey");

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
const pastDebounce = () => act(() => new Promise<void>((r) => setTimeout(r, 400)));
const click = (el: Element) => act(async () => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const lastFor = (part: string) => [...held].reverse().find((h) => h.url.includes(part))!;
const typeInto = (input: HTMLInputElement, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

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
    await mount(<FollowUpsTab canEdit={false} initialData={followUps("mine", "Mine row")} />);

    await click(button("All"));
    await click(button("Overdue"));
    const all = lastFor("scope=all");
    const overdue = lastFor("scope=overdue");

    await overdue.answer(followUps("overdue", "Overdue row"));
    await all.answer(followUps("all", "All row"));

    expect(host.textContent).toContain("Overdue row");
    expect(host.textContent).not.toContain("Nothing overdue.");
  });

  it("makes no request on mount when the caller passed the list", async () => {
    await mount(<FollowUpsTab canEdit={false} initialData={followUps("all", "Server row")} />);
    expect(held.map((h) => h.url)).toEqual([]);
    expect(host.textContent).toContain("Server row");
  });

  it("keeps the chosen list when the page re-renders with another scope in the URL", async () => {
    const tab = (scope: FollowUpScope) => (
      <FollowUpsTab canEdit={false} initialScope={scope} initialData={followUps("overdue", "Overdue row")} />
    );
    await mount(tab("overdue"));

    await act(async () => root!.render(tab("mine")));

    expect(held.map((h) => h.url)).toEqual([]);
    expect(host.textContent).toContain("Overdue row");
  });
});

describe("Follow-ups tab: its first list", () => {
  const page = (props: { initialView: "list" | "followups"; followUps?: FollowUpListData | { error: string } }) => (
    <CustomersPageTabs canEdit={false} canEditOnlineResult={false} {...props}>
      <p>Customer list</p>
    </CustomersPageTabs>
  );
  const openTab = (label: string) =>
    act(async () => {
      [...host.querySelectorAll('[role="tab"]')]
        .find((t) => t.textContent?.trim() === label)!
        .dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    });
  const followUpReads = () => held.filter((h) => h.url.startsWith("/api/settings/customers/followups"));

  it("loads the list once, when the tab is first opened", async () => {
    await mount(page({ initialView: "list" }));
    expect(followUpReads()).toEqual([]);

    await openTab("Follow-ups");
    expect(followUpReads().map((h) => h.url)).toEqual(["/api/settings/customers/followups?scope=mine"]);
    await followUpReads()[0]!.answer(followUps("mine", "Mine row"));
    expect(host.textContent).toContain("Mine row");

    await openTab("Customers");
    await openTab("Follow-ups");
    expect(followUpReads()).toHaveLength(1);
  });

  it("shows the list the server read when the page opens on Follow-ups, asking for nothing", async () => {
    await mount(page({ initialView: "followups", followUps: followUps("overdue", "Server row") }));
    expect(followUpReads()).toEqual([]);
    expect(host.textContent).toContain("Server row");
  });

  it("offers Try again when the server could not read it", async () => {
    await mount(page({ initialView: "followups", followUps: { error: "Could not load follow-ups." } }));
    expect(followUpReads()).toEqual([]);
    expect(host.textContent).toContain("Could not load follow-ups.");

    await click(button("Try again"));
    await lastFor("scope=mine").answer(followUps("mine", "Mine row"));
    expect(host.textContent).toContain("Mine row");
  });

  const kai = (scope: FollowUpScope, title: string) => ({ ...followUps(scope, title), me: { id: "p-kai", name: "Kai" } });
  const changeWorkingAs = () => act(async () => window.dispatchEvent(new Event(WORKING_AS_CHANGED_EVENT)));

  it("shows the new Working-as list when Working-as changes during the first read, answered last", async () => {
    await mount(page({ initialView: "list" }));
    await openTab("Follow-ups");
    await changeWorkingAs();
    expect(followUpReads().map((h) => h.url)).toEqual([
      "/api/settings/customers/followups?scope=mine",
      "/api/settings/customers/followups?scope=mine",
    ]);
    const [asJess, asKai] = followUpReads();

    await asKai!.answer(kai("mine", "Kai row"));
    await asJess!.answer(followUps("mine", "Jess row"));

    expect(host.textContent).toContain("Working as Kai");
    expect(host.textContent).toContain("Kai row");
    expect(host.textContent).not.toContain("Jess row");
  });

  it("shows the new Working-as list when Working-as changes during the first read, answered first", async () => {
    await mount(page({ initialView: "list" }));
    await openTab("Follow-ups");
    await changeWorkingAs();
    const [asJess, asKai] = followUpReads();

    await asJess!.answer(followUps("mine", "Jess row"));
    await asKai!.answer(kai("mine", "Kai row"));

    expect(host.textContent).toContain("Working as Kai");
    expect(host.textContent).not.toContain("Jess row");
  });

  it("reloads the chosen scope when Working-as changes", async () => {
    await mount(<FollowUpsTab canEdit={false} initialData={followUps("mine", "Mine row")} />);
    await click(button("All"));
    await lastFor("scope=all").answer(followUps("all", "All row"));

    await act(async () => window.dispatchEvent(new Event(WORKING_AS_CHANGED_EVENT)));

    expect(held.map((h) => h.url)).toEqual([
      "/api/settings/customers/followups?scope=all",
      "/api/settings/customers/followups?scope=all",
    ]);
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

describe("Customers list: the search box", () => {
  const searchBox = () => host.querySelector<HTMLInputElement>('input[placeholder="Search by name or email…"]')!;
  const list = (initialFilters?: { stage: string[] }) => (
    <CustomersClient initialData={{ customers: customersPage(1, "Pageone") as never }} initialFilters={initialFilters as never} />
  );

  it("stays on page 2 when page 2 is clicked as soon as the list loads", async () => {
    await mount(list());
    await click(button("2"));
    await lastFor("page=2").answer(customersPage(2, "Pagetwo"));
    await pastDebounce();

    expect(held.map((h) => h.url).filter((u) => u.startsWith("/api/shop/customers"))).toEqual([
      "/api/shop/customers?page=2&limit=20",
    ]);
    expect(host.textContent).toContain("Pagetwo");
  });

  it("searches once typing stops, from page 1", async () => {
    await mount(list());
    await click(button("2"));
    await lastFor("page=2").answer(customersPage(2, "Pagetwo"));
    await typeInto(searchBox(), "me");
    await typeInto(searchBox(), "mei");
    expect(held.filter((h) => h.url.includes("search="))).toEqual([]);
    await pastDebounce();

    expect(held.filter((h) => h.url.includes("search=")).map((h) => h.url)).toEqual([
      "/api/shop/customers?search=mei&page=1&limit=20",
    ]);
  });

  it("drops a search still waiting when Clear all is pressed", async () => {
    await mount(list({ stage: ["lead"] }));
    await typeInto(searchBox(), "mei");
    await click(button("Clear all"));
    await pastDebounce();

    expect(held.filter((h) => h.url.includes("search="))).toEqual([]);
    expect(searchBox().value).toBe("");
  });
});

describe("Customer journey: Sent it while the first read is still loading", () => {
  const journey = (reloadSignal: number) => (
    <CustomerJourney
      customerId="c1"
      canEdit={false}
      viewer={{ userId: "u1", grantsAll: false }}
      initialNotes={[]}
      migration={undefined}
      importHistoryHref={null}
      nextStepText={null}
      stageLabel={null}
      composerMode="note"
      onComposerModeChange={() => {}}
      composerFocus={0}
      reloadSignal={reloadSignal}
      onAnswerReview={() => {}}
    />
  );
  const note = (id: string, at: string, detail: string) => ({
    id: `note.added:${id}`,
    at,
    kind: "note.added",
    ref: { type: "customer_note", id },
    summary: "Note by Jess",
    detail,
    group: "notes",
  });
  const timeline = (...entries: ReturnType<typeof note>[]) => ({
    ok: true,
    entries,
    next: null,
    groups: [{ key: "notes", label: "Notes" }],
    unavailable: [],
  });
  const followUpsWith = (...titles: string[]) => ({
    rows: titles.map((title, i) => ({
      id: `f${i}`,
      customerId: "c1",
      title,
      dueOn: "2026-10-23",
      assignee: { id: "p-jess", name: "Jess", archived: false },
      createdBy: { id: "p-jess", name: "Jess" },
      createdAt: "2026-10-20T02:00:00Z",
      doneAt: null,
      doneBy: null,
    })),
    today: "2026-10-21",
    me: { id: "p-jess", name: "Jess" },
    assignees: [],
  });
  const reads = (part: string) => held.filter((h) => h.url.includes(part));

  it("keeps the note the second read brought when the first read answers last", async () => {
    await mount(journey(0));
    await act(async () => root!.render(journey(1)));
    const [first, second] = reads("/timeline");

    await second.answer(timeline(note("n1", "2026-10-01T02:00:00Z", "Prefers mornings."), note("n2", "2026-10-20T02:00:00Z", "Sent the care guide.")));
    await first.answer(timeline(note("n1", "2026-10-01T02:00:00Z", "Prefers mornings.")));

    expect(host.textContent).toContain("Sent the care guide.");
    expect(host.textContent).toContain("Prefers mornings.");
  });

  it("keeps the follow-up the second read brought when the first read answers last", async () => {
    await mount(journey(0));
    await act(async () => root!.render(journey(1)));
    const [first, second] = reads("/followups");
    for (const read of reads("/timeline")) await read.answer(timeline(note("n1", "2026-10-01T02:00:00Z", "Prefers mornings.")));

    await second.answer(followUpsWith("Call about her second pillow"));
    await first.answer(followUpsWith());

    expect(host.textContent).toContain("Call about her second pillow");
  });

  it("shows the journey when only the first read answers, after the second failed", async () => {
    await mount(journey(0));
    await act(async () => root!.render(journey(1)));
    const [first, second] = reads("/timeline");

    await second.answer({ ok: false, error: "offline" });
    await first.answer(timeline(note("n1", "2026-10-01T02:00:00Z", "Prefers mornings.")));

    expect(host.textContent).toContain("Prefers mornings.");
  });
});

describe("Find customer on a Google review: 'jo' then 'john', answered out of order", () => {
  const box = () => host.querySelector("input")!;
  const searchFor = async (text: string) => {
    await typeInto(box(), text);
    await pastDebounce();
  };

  it("shows the matches for 'john' when the 'jo' search answers last", async () => {
    await mount(<FindCustomerLink reviewId="r1" onLinked={() => {}} />);
    await click(button("Find customer…"));
    await searchFor("jo");
    await searchFor("john");
    const jo = lastFor("search=jo&");
    const john = lastFor("search=john&");

    await john.answer({ ok: true, rows: [customerRow("Johnny")] });
    await jo.answer({ ok: true, rows: [customerRow("Joanne")] });

    expect(host.textContent).toContain("Johnny");
    expect(host.textContent).not.toContain("Joanne");
    expect(host.textContent).not.toContain("Searching…");
  });

  it("stops saying Searching… when a search answers after the box was emptied", async () => {
    await mount(<FindCustomerLink reviewId="r1" onLinked={() => {}} />);
    await click(button("Find customer…"));
    await searchFor("jo");
    await typeInto(box(), "");
    expect(host.textContent).toContain("Searching…");

    await lastFor("search=jo&").answer({ ok: true, rows: [customerRow("Joanne")] });

    expect(host.textContent).not.toContain("Searching…");
    expect(host.textContent).toContain("Type at least two letters.");
  });
});
