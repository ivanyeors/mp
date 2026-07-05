export function isMarketingRoute(basePathname: string): boolean {
  if (basePathname === "/settings" || basePathname.startsWith("/settings/")) return false;
  if (basePathname === "/account" || basePathname.startsWith("/account/")) return false;
  if (basePathname === "/results" || basePathname.startsWith("/results/")) return false;
  if (["/mp-config", "/mp-basic", "/mp-maker", "/mbolster-config"].includes(basePathname)) return false;
  return true;
}
