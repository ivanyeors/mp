export function isNearDocumentBottom(
  viewportHeight: number,
  scrollY: number,
  documentHeight: number,
  threshold = 24,
) {
  return viewportHeight + scrollY >= documentHeight - threshold;
}
