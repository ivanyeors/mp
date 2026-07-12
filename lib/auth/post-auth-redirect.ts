import { stripLocale } from "@/lib/i18n/routing";

/**
 * Pure post-auth destination for OAuth callback + login "already signed in".
 *
 * Staff defaulting to account home → Admin Panel. Non-staff cannot land under
 * `/settings` via `next` alone. Other safe `next` values are honored.
 */
export function resolvePostAuthRedirect({
  next,
  isStaff,
  accountHome,
  adminHome,
}: {
  next: string | null | undefined;
  isStaff: boolean;
  accountHome: string;
  adminHome: string;
}): string {
  const path = safeNextPath(next, accountHome);
  const base = stripLocale(path.split("?")[0] ?? path);

  if (isStaff) {
    if (base === "/account") return adminHome;
    return path;
  }

  if (base === "/settings" || base.startsWith("/settings/")) return accountHome;
  return path;
}

/** Open-redirect guard: only same-origin relative paths. */
export function safeNextPath(next: string | null | undefined, fallback: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  return next;
}
