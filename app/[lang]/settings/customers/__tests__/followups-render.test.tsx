import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import type { CustomerFollowUp, CustomerFollowUpsData, FollowUpListData } from "@/lib/crm/followup-rules";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/settings/customers",
}));

const { NowCard } = await import("../[id]/customer-journey");
const { JourneyComposer } = await import("../[id]/journey-composer");
const { CustomerShortcutsProvider } = await import("../[id]/customer-shortcuts");
const { FollowUpActions } = await import("../followup-parts");
const { journeyNow } = await import("@/lib/crm/journey/chapters");
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

const data = (canEdit: boolean): CustomerFollowUpsData => ({ rows, today: "2026-10-21", me: JESS, assignees: canEdit ? [JESS, KAI] : [] });
const open = rows.filter((r) => !r.doneAt);

const nowCard = (canEdit: boolean) =>
  renderToString(
    <NowCard
      now={journeyNow(open, "2026-10-21")}
      nextStepText={null}
      followUps={open}
      today="2026-10-21"
      actions={(f) => (canEdit ? <FollowUpActions followUp={f} assignees={[JESS, KAI]} onChange={() => {}} allowDelete /> : null)}
    />,
  );

const form = () =>
  renderToString(
    <CustomerShortcutsProvider customerId="c1" email="mei@example.test" phone={null} canLog onLogged={() => {}}>
      <JourneyComposer
        customerId="c1"
        mode="followup"
        onModeChange={() => {}}
        focusSignal={0}
        followUps={data(true)}
        onNoteAdded={() => {}}
        onFollowUpAdded={() => {}}
      />
    </CustomerShortcutsProvider>,
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

const FORM_CONTROLS = ['aria-label="New follow-up"', 'id="followup-due"', 'aria-label="Assign to"', "Add follow-up"];
const ROW_CONTROLS = [">Done<", "Reassign", 'aria-label="Delete follow-up"'];
const TAB_CONTROLS = [">Done<", "Reassign", ">Actions<"];

describe("Follow-ups on the Customer page", () => {
  it("has the form in the composer, with tomorrow and you as defaults", () => {
    const html = form();
    for (const c of FORM_CONTROLS) expect(html, c).toContain(c);
    expect(html).toContain('value="2026-10-22"');
  });

  it("renders Done, Reassign and delete on Now for customers-edit", () => {
    const html = nowCard(true);
    for (const c of ROW_CONTROLS) expect(html, c).toContain(c);
  });

  it("shows a view-only role every open follow-up, with none of the controls", () => {
    const html = nowCard(false).replace(/<!-- -->/g, "");
    for (const c of ROW_CONTROLS) expect(html, c).not.toContain(c);
    for (const fact of ["Send the fill sample", "Call about her second pillow", "Jess", "Ana", "Due 23 Oct 2026", "Overdue · due 10 Oct 2026"]) {
      expect(html, fact).toContain(fact);
    }
    expect(html).not.toContain("Booked the visit");
  });

  it("marks an archived assignee's open follow-up, and says Now needs care while one is overdue", () => {
    const html = nowCard(false);
    expect(html).toContain("Assignee archived");
    expect(html).toContain("Needs care");
    expect(html).toContain("a follow-up overdue");
    expect(html.indexOf("Send the fill sample")).toBeLessThan(html.indexOf("Call about her second pillow"));
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
