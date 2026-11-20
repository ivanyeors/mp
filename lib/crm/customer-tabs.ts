export const CUSTOMER_TABS = ["journey", "pillow", "reviews"] as const;
export type CustomerTab = (typeof CUSTOMER_TABS)[number];

export function parseCustomerTab(value: string | null | undefined): CustomerTab {
  return (CUSTOMER_TABS as readonly string[]).includes(value ?? "") ? (value as CustomerTab) : "journey";
}
