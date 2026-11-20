export function previewMixMode(
  placements: readonly unknown[] | null | undefined,
): "xray" | "text" {
  return placements && placements.length > 0 ? "xray" : "text";
}
