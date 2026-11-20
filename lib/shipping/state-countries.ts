export const STATE_COUNTRIES: ReadonlySet<string> = new Set(["US", "CA", "AU", "MX", "MY", "TH", "CN", "ID", "VN"]);

export function needsState(country: string): boolean {
  return STATE_COUNTRIES.has(country.trim().toUpperCase());
}
