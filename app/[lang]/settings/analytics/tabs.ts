export const ANALYTICS_TABS = ["sales", "stock", "customers", "traffic"] as const;
export type AnalyticsTab = (typeof ANALYTICS_TABS)[number];

export const ANALYTICS_TAB_LABELS: Record<AnalyticsTab, string> = {
  sales: "Sales & margin",
  stock: "Stock & builds",
  customers: "Customers",
  traffic: "Traffic & search",
};

export const ANALYTICS_TAB_QUESTIONS: Record<AnalyticsTab, string> = {
  sales: "What did we sell, what did it cost us, and what did we keep?",
  stock: "How did stock move, and what goes into each build?",
  customers: "Who customises with us, and what stops people buying?",
  traffic: "How do people find the site, and where do they go next?",
};

export function parseAnalyticsTab(value: string | string[] | undefined): AnalyticsTab {
  const v = Array.isArray(value) ? value[0] : value;
  return (ANALYTICS_TABS as readonly string[]).includes(v ?? "") ? (v as AnalyticsTab) : "sales";
}
