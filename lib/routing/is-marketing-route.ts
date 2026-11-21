import { isExploreRoute } from "@/lib/routing/explore-route";
import { isPageBuilderPreviewRoute } from "@/lib/routing/preview-route";

export function isMarketingRoute(basePathname: string): boolean {
  if (isPageBuilderPreviewRoute(basePathname)) return false;
  if (basePathname === "/settings" || basePathname.startsWith("/settings/")) return false;
  if (basePathname === "/account" || basePathname.startsWith("/account/")) return false;
  if (basePathname === "/auth" || basePathname.startsWith("/auth/")) return false;
  if (basePathname === "/results" || basePathname.startsWith("/results/")) return false;
  if (["/mp-config", "/mp-basic", "/mp-maker", "/mbolster-config"].includes(basePathname)) return false;
  if (isExploreRoute(basePathname)) return false;
  return true;
}
