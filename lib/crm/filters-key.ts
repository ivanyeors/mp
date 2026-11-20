import { CUSTOMER_FILTER_KEYS, customerFilterParams, customerFiltersSchema, type CustomerFilters } from "@/lib/crm/customer-filters";

const FILTER_KEYS = new Set<string>(CUSTOMER_FILTER_KEYS);

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

export function filtersKey(params: Readonly<Record<string, string | undefined>> | URLSearchParams | string): string | null {
  const f = parseFilters(typeof params === "string" ? new URLSearchParams(params) : params);
  return f ? customerFilterParams(f).toString() : null;
}
