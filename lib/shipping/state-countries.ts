/**
 * The countries where Easyship refuses an address without a state. Its own
 * module so an address form can ask for one without shipping the postal-code
 * tables in lib/shipping/states to the browser; states.ts holds a rule for
 * each, and its tests keep the two in step.
 */
export const STATE_COUNTRIES: ReadonlySet<string> = new Set(["US", "CA", "AU", "MX", "MY", "TH", "CN", "ID", "VN"]);

/** Whether Easyship needs a state for this country, so an address form should ask for one. */
export function needsState(country: string): boolean {
  return STATE_COUNTRIES.has(country.trim().toUpperCase());
}
