import { CUSTOMER_FILTER_KEYS, customerFilterParams, customerFiltersSchema, type CustomerFilters } from "@/lib/crm/customer-filters";

/**
 * *Same filters* for a Playbook's Segment, in one place: the Email funnel's
 * *set up* (lib/email-funnel/model.ts) and New campaign's Playbook Segment
 * (lib/email-campaigns/starters.ts) both read filters this way. Pure, and
 * safe in the browser.
 */

const FILTER_KEYS = new Set<string>(CUSTOMER_FILTER_KEYS);

/** Pure — stored or query filters, each parsed by the list's schema; null when any key or value does not parse. */
export function parseFilters(params: Readonly<Record<string, string | undefined>> | URLSearchParams): Partial<CustomerFilters> | null {
  const entries = params instanceof URLSearchParams ? [...params.entries()] : Object.entries(params);
  const out: Record<string, unknown> = {};
  for (const [key, value] of entries) {
    if (value === undefined) continue;
    if (!FILTER_KEYS.has(key)) return null;
    const parsed = customerFiltersSchema.shape[key as keyof typeof customerFiltersSchema.shape].safeParse(value);
    if (!parsed.success || parsed.data === undefined) return null;
    out[key] = parsed.data;
  }
  return out as Partial<CustomerFilters>;
}

/**
 * Pure — filters as one canonical string (`customerFiltersSchema` →
 * `customerFilterParams`): two sets that choose the same Customers give the
 * same key, whatever their order. Null when any filter does not parse. What
 * *same filters as the Playbook* means on the Email funnel and on New
 * campaign (PRD-email-funnel slice 04).
 */
export function filtersKey(params: Readonly<Record<string, string | undefined>> | URLSearchParams | string): string | null {
  const f = parseFilters(typeof params === "string" ? new URLSearchParams(params) : params);
  return f ? customerFilterParams(f).toString() : null;
}
