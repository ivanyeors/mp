export const COST_KEY = /cost|cogs|margin|markup|total_charge/i;

export function withoutCosts<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutCosts) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !COST_KEY.test(key))
        .map(([key, v]) => [key, withoutCosts(v)]),
    ) as T;
  }
  return value;
}
