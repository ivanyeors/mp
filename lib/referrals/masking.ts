/**
 * PDPA identity masking (#80) — PURE (no I/O). A test target for slice #85, so
 * keep it free of any DB/server imports.
 *
 * Link/code referrals expose only a MASKED identity to the partner (they never
 * verified the customer). Partner-ASSISTED referrals show full details (the
 * partner ran the configurator with the customer in the room). The Admin Panel
 * always sees the full, unmasked value — it never calls these.
 *
 *   maskName("Jo Tan")  -> "Jo… T."
 *   maskEmail("jo@x.com") -> "j***@…"
 */

/** First 2 chars of the given name + "…", then the surname initial + ".". */
export function maskName(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim().replace(/\s+/g, " ");
  if (!trimmed) return "Customer";
  const parts = trimmed.split(" ");
  const first = parts[0];
  const head = `${first.slice(0, 2)}…`;
  if (parts.length === 1) return head;
  const lastInitial = parts[parts.length - 1][0]?.toUpperCase() ?? "";
  return `${head} ${lastInitial}.`;
}

/** First char of the local part + "***@…" — domain fully hidden. */
export function maskEmail(email: string | null | undefined): string {
  const trimmed = (email ?? "").trim();
  const at = trimmed.indexOf("@");
  if (at <= 0) return "—";
  return `${trimmed[0]}***@…`;
}
