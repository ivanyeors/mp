import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import type { Customer } from "@/lib/types/ecommerce";
import type { CustomerNote } from "@/lib/crm/note-rules";

/**
 * View-only Customers (CRM slice 10): without `customers-edit` the Customer
 * detail renders the same facts as text, with none of its edit controls.
 */

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "c1" }),
  usePathname: () => "/en/settings/customers/c1",
}));

const { CustomerDetailClient } = await import("../[id]/customer-detail-client");
const { parseCustomerTab } = await import("@/lib/crm/customer-tabs");

const customer = {
  id: "c1",
  email: "ana@x.test",
  first_name: "Ana",
  last_name: "Tan",
  phone: "+6591234567",
  locale: "en-US",
  tags: ["vip"],
  total_orders: 2,
  total_spent: 480,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
} as unknown as Customer;

/** A Customer note (CRM 02) written by the viewer, so it is theirs to delete. */
const notes: CustomerNote[] = [
  { id: "n1", body: "Prefers mornings.", createdAt: "2026-10-01T02:00:00Z", authorName: "Jess", authorUserId: "u1", legacy: false },
];

const render = (canEdit: boolean) =>
  renderToString(
    <CustomerDetailClient
      initialData={{ customer: { ok: true, row: customer }, notes }}
      canEdit={canEdit}
      viewer={{ userId: "u1", grantsAll: false }}
    />,
  );

/**
 * Each edit control on the page as it opens. Name, mobile and tags sit behind
 * *Edit*; a note is added from the Journey's composer; a follow-up and a note
 * each have a button in the header. What a press reveals (the edit form, an
 * entry's buttons, *Add address* in its row) renders for the same flag.
 */
const CONTROLS = [">Edit<", "<textarea", "Add note", 'aria-label="New note"', ">Note<", ">Follow-up<", 'aria-label="Add to the journey"'];

describe("Customer detail edit controls", () => {
  it("renders every edit control for customers-edit", () => {
    const html = render(true).replace(/<!-- -->/g, "");
    for (const c of CONTROLS) expect(html, c).toContain(c);
  });

  it("renders none of them without customers-edit, and still shows the Customer", () => {
    const html = render(false).replace(/<!-- -->/g, "");
    for (const c of CONTROLS) expect(html, c).not.toContain(c);
    for (const fact of ["Ana Tan", "ana@x.test", "+65 9123 4567", "vip", "Contact details", ">Email<", ">WhatsApp<"]) expect(html, fact).toContain(fact);
  });

  it("opens on the Journey, with the three sections as tabs and the tab the address names", () => {
    const html = render(false);
    for (const label of ["Journey", "Pillow and fittings", "Reviews"]) expect(html, label).toContain(label);
    const opened = (tab: "journey" | "pillow" | "reviews") =>
      renderToString(
        <CustomerDetailClient
          initialData={{ customer: { ok: true, row: customer }, notes }}
          canEdit={false}
          viewer={{ userId: "u1", grantsAll: false }}
          initialTab={tab}
        />,
      );
    expect(opened("reviews")).toMatch(/aria-selected="true"[^>]*id="[^"]*trigger-reviews"|id="[^"]*trigger-reviews"[^>]*aria-selected="true"/);
    expect(opened("journey")).toMatch(/aria-selected="true"[^>]*id="[^"]*trigger-journey"|id="[^"]*trigger-journey"[^>]*aria-selected="true"/);
  });
});

describe("parseCustomerTab", () => {
  it("reads a tab, and anything else as the Journey", () => {
    expect(parseCustomerTab("reviews")).toBe("reviews");
    expect(parseCustomerTab("pillow")).toBe("pillow");
    expect(parseCustomerTab("orders")).toBe("journey");
    expect(parseCustomerTab(undefined)).toBe("journey");
  });
});
