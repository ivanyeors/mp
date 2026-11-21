import type { LifecycleDetail, LifecycleStage } from "@/lib/crm/lifecycle-stage";
import type { MarketingEmailState } from "@/lib/marketing-consent/state";

export interface ResultContactFacts {
  status: string | null;
  customer_email: string | null;
  data: unknown;
}

export function resultContactEditable(row: ResultContactFacts): boolean {
  const email = row.customer_email?.trim();
  if (!email) return true;
  if (row.status != null) return false;
  const data = row.data && typeof row.data === "object" && !Array.isArray(row.data) ? (row.data as Record<string, unknown>) : {};
  return data.configurator !== "full" && data.configurator !== "basic";
}

export interface ResultCustomerSummary {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  stage: LifecycleStage | null;
  detail: LifecycleDetail | null;
  purchases: number;
  marketingEmail: MarketingEmailState | null;
}

export function customerDisplayName(row: { first_name: string | null; last_name: string | null }): string | null {
  const name = [row.first_name, row.last_name].map((p) => p?.trim()).filter(Boolean).join(" ");
  return name || null;
}

const nameKey = (name: string | null | undefined) => (name ?? "").toLowerCase().replace(/\s+/g, " ").trim();

export function measuredForSomeoneElse(resultName: string | null | undefined, customerName: string | null | undefined): boolean {
  const a = nameKey(resultName);
  const b = nameKey(customerName);
  if (!a || !b) return false;
  return a !== b && !b.includes(a) && !a.includes(b);
}
