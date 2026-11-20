import { stripLocale } from "@/lib/i18n/routing";

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

export function safeNextPath(next: string | null | undefined, fallback: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  if (/[\\\x00-\x1f\x7f]/.test(next)) return fallback;
  return next;
}
