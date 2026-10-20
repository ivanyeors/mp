import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import type { Customer } from "@/lib/types/ecommerce";

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
  notes: "Prefers mornings.",
  total_orders: 2,
  total_spent: 480,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
} as unknown as Customer;

const render = (canEdit: boolean) =>
  renderToString(<CustomerDetailClient initialData={{ customer: { ok: true, row: customer } }} canEdit={canEdit} />);

/** Each edit control, as it appears in the markup. */
const CONTROLS = ["Save Changes", "Add Address", 'placeholder="Add tag..."', 'id="first-name"', 'id="phone"', "<textarea", "Click to remove"];

describe("Customer detail edit controls", () => {
  it("renders every edit control for customers-edit", () => {
    const html = render(true);
    for (const c of CONTROLS) expect(html, c).toContain(c);
  });

  it("renders none of them without customers-edit, and still shows the Customer", () => {
    const html = render(false);
    for (const c of CONTROLS) expect(html, c).not.toContain(c);
    for (const fact of ["Ana Tan", "ana@x.test", "+6591234567", "vip", "Prefers mornings."]) expect(html, fact).toContain(fact);
  });
});
