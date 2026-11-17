/**
 * The Explore page (`/explore`): the launch countdown over a full-screen
 * scene (owner, 2026-11-17). It fills the screen and does not scroll, so the
 * storefront's header, footer, dock and chat stay off it; its own logo is the
 * way home.
 */
export const EXPLORE_PATH = "/explore";

export function isExploreRoute(basePathname: string): boolean {
  return basePathname === EXPLORE_PATH;
}
