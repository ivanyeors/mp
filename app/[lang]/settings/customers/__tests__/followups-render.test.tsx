import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import type { CustomerFollowUp, CustomerFollowUpsData, FollowUpListData } from "@/lib/crm/followup-rules";

/**
 * Follow-ups in the Admin Panel (CRM slice 06). Without `customers-edit` the
 * card and the tab show every follow-up, assignee and due date, with no form
 * and no *Done*, *Reassign* or delete. An archived assignee's open follow-up
 * carries the *Assignee archived* chip.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/settings/customers",
}));

const { CustomerFollowUpsCard } = await import("../[id]/customer-followups-card");
const { FollowUpsTab } = await import("../followups-tab");

const JESS = { id: "p-jess", name: "Jess" };
const KAI = { id: "p-kai", name: "Kai" };

const followUp = (over: Partial<CustomerFollowUp>): CustomerFollowUp => ({
  id: "f1",
  customerId: "c1",
  title: "Call about her second pillow",
  dueOn: "2026-10-23",
  assignee: { ...JESS, archived: false },
  createdBy: KAI,
  createdAt: "2026-10-20T02:00:00Z",
  doneAt: null,
  doneBy: null,
  ...over,
});

const rows = [
  followUp({ id: "f-arch", title: "Send the fill sample", dueOn: "2026-10-10", assignee: { id: "p-ana", name: "Ana", archived: true } }),
  followUp({}),
  followUp({ id: "f-done", title: "Booked the visit", doneAt: "2026-10-02T03:00:00Z", doneBy: KAI }),
];

const card = (canEdit: boolean, data: Partial<CustomerFollowUpsData> = {}) =>
  renderToString(
    <CustomerFollowUpsCard
      customerId="c1"
      canEdit={canEdit}
      initialData={{ rows, today: "2026-10-21", me: JESS, assignees: canEdit ? [JESS, KAI] : [], ...data }}
    />,
  );

const tab = (canEdit: boolean, data: Partial<FollowUpListData> = {}) =>
  renderToString(
    <FollowUpsTab
      canEdit={canEdit}
      initialData={{
        scope: "all",
        rows: rows.filter((r) => !r.doneAt).map((r) => ({ ...r, customerName: "Mei Tan" })),
        truncated: false,
        today: "2026-10-21",
        me: JESS,
        assignees: canEdit ? [JESS, KAI] : [],
        ...data,
      }}
    />,
  );

/** Each change control, as it appears in the markup. */
const CARD_CONTROLS = ['aria-label="New follow-up"', 'id="followup-due"', 'aria-label="Assign to"', "Add follow-up", ">Done<", "Reassign", 'aria-label="Delete follow-up"'];
const TAB_CONTROLS = [">Done<", "Reassign", ">Actions<"];

describe("Follow-ups card on the Customer detail", () => {
  it("renders the form, Done, Reassign and delete for customers-edit, with tomorrow and you as defaults", () => {
    const html = card(true);
    for (const c of CARD_CONTROLS) expect(html, c).toContain(c);
    expect(html).toContain('value="2026-10-22"');
  });

  it("shows a view-only role every follow-up, with none of the controls", () => {
    const html = card(false);
    for (const c of CARD_CONTROLS) expect(html, c).not.toContain(c);
    for (const fact of ["Send the fill sample", "Call about her second pillow", "Booked the visit", "Jess", "Ana", "Due 23 Oct 2026", "Overdue · due 10 Oct 2026", "Done 2 Oct 2026 by Kai"]) {
      expect(html, fact).toContain(fact);
    }
  });

  it("marks an archived assignee's open follow-up, and lists open ones before done ones", () => {
    const html = card(false);
    expect(html).toContain("Assignee archived");
    expect(html.indexOf("Send the fill sample")).toBeLessThan(html.indexOf("Call about her second pillow"));
    expect(html.indexOf("Call about her second pillow")).toBeLessThan(html.indexOf("Booked the visit"));
  });
});

describe("Follow-ups tab on the Customers page", () => {
  it("shows Mine, All and Overdue, each row's Customer, title, due date and assignee", () => {
    const html = tab(false);
    for (const label of [">Mine<", ">All<", ">Overdue<", "Mei Tan", "Call about her second pillow", "Due 23 Oct 2026", "Jess", "Assignee archived"]) {
      expect(html, label).toContain(label);
    }
    expect(html).toContain('href="/en-US/settings/customers/c1"');
  });

  it("renders Done and Reassign only for customers-edit", () => {
    for (const c of TAB_CONTROLS) expect(tab(true), c).toContain(c);
    for (const c of TAB_CONTROLS) expect(tab(false), c).not.toContain(c);
  });

  it("asks who you are working as before showing Mine on a shared login", () => {
    const html = tab(true, { scope: "mine", rows: [], me: null });
    expect(html).toContain("Choose who you are working as");
  });
});
