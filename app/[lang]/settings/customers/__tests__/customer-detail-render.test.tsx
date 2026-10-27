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

/** Each edit control, as it appears in the markup. */
const CONTROLS = [
  "Save changes",
  "Add address",
  'placeholder="Add a tag…"',
  'id="first-name"',
  'id="phone"',
  "<textarea",
  "Click to remove",
  "Add note",
  'aria-label="Delete note"',
];

describe("Customer detail edit controls", () => {
  it("renders every edit control for customers-edit", () => {
    const html = render(true);
    for (const c of CONTROLS) expect(html, c).toContain(c);
  });

  it("renders none of them without customers-edit, and still shows the Customer", () => {
    const html = render(false);
    for (const c of CONTROLS) expect(html, c).not.toContain(c);
    for (const fact of ["Ana Tan", "ana@x.test", "+6591234567", "vip", "Prefers mornings.", "Jess"]) expect(html, fact).toContain(fact);
  });
});
