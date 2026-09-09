/**
 * Detail-page grouping for the journey graph.
 *
 * A blog post is one node per slug, so a handful of one-view posts sprawls the
 * graph and buries the pages that matter. Collapsing them to a single `/blog/*`
 * node keeps the flow readable — views, drop-offs, dwell, routes and sections
 * all aggregate onto the group because the rewrite happens where paths enter
 * the loader, before any metric is built.
 */

/** Prefixes whose children collapse into one node. Index pages stay separate. */
const GROUPED_PREFIXES = ["/blog"] as const;

export const PATH_GROUP_SUFFIX = "/*";

/** `/blog/*` — a group, not a real storefront URL. */
export function isGroupedPath(path: string): boolean {
  return path.endsWith(PATH_GROUP_SUFFIX);
}

/**
 * `/blog/some-post` → `/blog/*`; `/blog` and everything else unchanged.
 * Takes bare page paths only — section children are `path#sectionId` and are
 * built from an already-collapsed page path.
 */
export function collapseJourneyPath(path: string): string {
  for (const prefix of GROUPED_PREFIXES) {
    if (path.startsWith(`${prefix}/`) && path.length > prefix.length + 1) {
      return `${prefix}${PATH_GROUP_SUFFIX}`;
    }
  }
  return path;
}
