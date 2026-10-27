/** Landing Menu last-pill + Admin Panel dock path rules (pure). */

export type DockSessionRole = "guest" | "customer" | "staff" | "partner";

export function resolveDockSessionRole(
  signedIn: boolean,
  isStaff: boolean,
  isPartner = false,
): DockSessionRole {
  if (isStaff) return "staff";
  if (isPartner) return "partner";
  if (signedIn) return "customer";
  return "guest";
}

/** Locale-stripped hrefs; callers wrap with `withLocale`. */
export function landingAuthPill(role: DockSessionRole): {
  label: string;
  href: string;
} {
  if (role === "staff") return { label: "Admin Panel", href: "/settings" };
  if (role === "partner") return { label: "Partner Hub", href: "/partner" };
  if (role === "customer") return { label: "Profile", href: "/account" };
  return { label: "Sign in", href: "/account/login" };
}

/** Home + Sign out dock only on Admin Panel routes (not the login redirect). */
export function isAdminPanelDockPath(basePathname: string): boolean {
  if (
    basePathname === "/settings/login" ||
    basePathname.startsWith("/settings/login/")
  ) {
    return false;
  }
  return basePathname === "/settings" || basePathname.startsWith("/settings/");
}
