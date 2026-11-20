export const PAGE_BUILDER_PREVIEW_PATH = "/page-builder-preview";

export function isPageBuilderPreviewRoute(basePathname: string): boolean {
  return (
    basePathname === PAGE_BUILDER_PREVIEW_PATH ||
    basePathname.startsWith(`${PAGE_BUILDER_PREVIEW_PATH}/`)
  );
}
