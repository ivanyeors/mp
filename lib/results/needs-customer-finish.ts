/**
 * An Assisted customisation submitted from the questionnaire carries no cover,
 * case or shipping. Staff compose the fillings first; the customer then picks
 * the finish and pays (ADR 0017). The missing address is the marker: every
 * finished Result has one, because both the hold path and the finish route
 * require it.
 *
 * Keyed on `source` as well as the address because an in-store `manual` Result
 * also has no address, and that one means "handed over at the counter", not
 * "customer still to choose".
 */
export function needsCustomerFinish(row: {
  source: string | null;
  shipping_address: unknown;
}): boolean {
  return row.source === "staff_assisted" && row.shipping_address == null;
}
