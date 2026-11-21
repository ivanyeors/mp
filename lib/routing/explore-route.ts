export const EXPLORE_PATH = "/explore";

export function isExploreRoute(basePathname: string): boolean {
  return basePathname === EXPLORE_PATH;
}
