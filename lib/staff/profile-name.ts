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
