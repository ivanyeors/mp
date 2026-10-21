/**
 * The Customers page's tabs, kept in `?view=` so a tab can be linked. CRM
 * slice 12 added `reviews` (*Google reviews to match*), which the daily
 * Telegram update links to.
 */
export const CUSTOMERS_VIEWS = ["list", "followups", "reviews", "settings"] as const;
export type CustomersView = (typeof CUSTOMERS_VIEWS)[number];

export function parseCustomersView(value: string | string[] | undefined): CustomersView {
  const v = Array.isArray(value) ? value[0] : value;
  return (CUSTOMERS_VIEWS as readonly string[]).includes(v ?? "") ? (v as CustomersView) : "list";
}
