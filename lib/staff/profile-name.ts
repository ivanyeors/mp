/**
 * The default first Staff profile name for a login: its email's local part,
 * split on `.`, `_` and `-`, title-cased (`kai.lin@x` → "Kai Lin"). Pure, so
 * the invite dialog can show the same default the server would use.
 */
export function defaultProfileName(email: string): string {
  const local = email.split("@")[0] ?? email;
  return (
    local
      .split(/[._-]+/)
      .filter(Boolean)
      .map((w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase())
      .join(" ") || email
  );
}
