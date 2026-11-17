import { isExploreRoute } from "@/lib/routing/explore-route";
import { isPageBuilderPreviewRoute } from "@/lib/routing/preview-route";

export function isMarketingRoute(basePathname: string): boolean {
  // Preview mode renders landing content but is an Admin Panel surface: it must not
  // carry storefront chrome that would sit on top of what Staff are reviewing.
  if (isPageBuilderPreviewRoute(basePathname)) return false;
  if (basePathname === "/settings" || basePathname.startsWith("/settings/")) return false;
  if (basePathname === "/account" || basePathname.startsWith("/account/")) return false;
  // The sign-in steps (/auth/confirm): the same bare screen as Sign in itself.
  if (basePathname === "/auth" || basePathname.startsWith("/auth/")) return false;
  if (basePathname === "/results" || basePathname.startsWith("/results/")) return false;
  if (["/mp-config", "/mp-basic", "/mp-maker", "/mbolster-config"].includes(basePathname)) return false;
  // The Explore page is one full screen with its own logo and nothing else.
  if (isExploreRoute(basePathname)) return false;
  return true;
}
