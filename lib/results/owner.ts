export function normaliseResultEmail(email: string | null | undefined): string | null {
  const value = email?.trim().toLowerCase();
  return value ? value : null;
}

export function isCustomersResult(
  customer: { id: string; email: string | null },
  row: { customer_id: string | null; customer_email: string | null },
): boolean {
  if (row.customer_id !== null && row.customer_id === customer.id) return true;
  const mine = normaliseResultEmail(customer.email);
  return mine !== null && mine === normaliseResultEmail(row.customer_email);
}

export function resultEmailPattern(email: string): string | null {
  const mine = normaliseResultEmail(email);
  if (!mine) return null;
  return `^\\s*${mine.replace(/[\\^$.|?*+()[\]{}]/g, (c) => `\\${c}`)}\\s*$`;
}
