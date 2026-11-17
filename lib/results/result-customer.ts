import type { LifecycleDetail, LifecycleStage } from "@/lib/crm/lifecycle-stage";
import type { MarketingEmailState } from "@/lib/marketing-consent/state";

/**
 * A **Result**'s Customer, as the Result page's Customer panel shows and
 * changes it (ADR 0051 d–g; PRD-results-to-customer slice 02). Pure: the
 * route (`app/api/results/[id]/customer`) and the panel read the same rule.
 */

/** The Result columns the rule reads. */
export interface ResultContactFacts {
  status: string | null;
  customer_email: string | null;
  data: unknown;
}

/**
 * Whether Staff may point this Result at a Customer of their choosing, which
 * writes its email: while it has no email, or on a **Draft Result** whose
 * email Staff typed. Never the email a guest gave on the first question
 * (recorded with `data.configurator`), and never a live Result's: each is
 * where that Result's emails and its **Result access token** already go.
 */
export function resultContactEditable(row: ResultContactFacts): boolean {
  const email = row.customer_email?.trim();
  if (!email) return true;
  if (row.status != null) return false;
  const data = row.data && typeof row.data === "object" && !Array.isArray(row.data) ? (row.data as Record<string, unknown>) : {};
  return data.configurator !== "full" && data.configurator !== "basic";
}

/** What the panel shows of the Customer a Result belongs to. */
export interface ResultCustomerSummary {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  stage: LifecycleStage | null;
  detail: LifecycleDetail | null;
  /** Purchases here and Shopify-era: more than none means they bought before. */
  purchases: number;
  marketingEmail: MarketingEmailState | null;
}

/** A Customer's name as the panel writes it: first and last, or null. */
export function customerDisplayName(row: { first_name: string | null; last_name: string | null }): string | null {
  const name = [row.first_name, row.last_name].map((p) => p?.trim()).filter(Boolean).join(" ");
  return name || null;
}

/** Names compare ignoring case and spacing, as the fitting import's do. */
const nameKey = (name: string | null | undefined) => (name ?? "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Whether the Result was measured for someone other than its Customer (owner,
 * 2026-11-15: a returning Customer may be measuring someone they are with).
 * Only when both names are known and differ; a missing name says nothing.
 */
export function measuredForSomeoneElse(resultName: string | null | undefined, customerName: string | null | undefined): boolean {
  const a = nameKey(resultName);
  const b = nameKey(customerName);
  if (!a || !b) return false;
  return a !== b && !b.includes(a) && !a.includes(b);
}
