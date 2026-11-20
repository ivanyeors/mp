export function needsCustomerFinish(row: {
  source: string | null;
  shipping_address: unknown;
}): boolean {
  return row.source === "staff_assisted" && row.shipping_address == null;
}
