/**
 * The Customer page's three sections (PRD-customer-page-journey slice 01). The
 * address holds the open one as `?tab=`, so a link opens straight on Reviews.
 * Pure and import-free: the page reads it on the server and the client changes
 * it.
 */
export const CUSTOMER_TABS = ["journey", "pillow", "reviews"] as const;
export type CustomerTab = (typeof CUSTOMER_TABS)[number];

/** `?tab=`'s value as a tab; anything else is the Journey. */
export function parseCustomerTab(value: string | null | undefined): CustomerTab {
  return (CUSTOMER_TABS as readonly string[]).includes(value ?? "") ? (value as CustomerTab) : "journey";
}
