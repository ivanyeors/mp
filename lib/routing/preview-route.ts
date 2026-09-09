/**
 * The Page Builder's **Preview mode** route (CONTEXT.md — **Preview mode**).
 *
 * It renders the real landing route so preview and production cannot diverge, which
 * means the root layout mounts its full chrome and analytics around it. Everything that
 * must not run inside the builder's iframe keys off this one predicate.
 */
export const PAGE_BUILDER_PREVIEW_PATH = "/page-builder-preview";

export function isPageBuilderPreviewRoute(basePathname: string): boolean {
  return (
    basePathname === PAGE_BUILDER_PREVIEW_PATH ||
    basePathname.startsWith(`${PAGE_BUILDER_PREVIEW_PATH}/`)
  );
}
