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

export function maskEmail(email: string | null | undefined): string {
  const trimmed = (email ?? "").trim();
  const at = trimmed.indexOf("@");
  if (at <= 0) return "—";
  return `${trimmed[0]}***@…`;
}
