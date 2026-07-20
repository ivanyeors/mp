/**
 * RE slice 07 — completed-preview mix visual selection.
 *
 * Spatially-defined recommended templates render in the read-only x-ray;
 * legacy-flat templates (no placements) keep the text mix summary. The
 * slice-05 reveal gate is separate and unchanged — this only picks the
 * visual once the reveal fires.
 */
export function previewMixMode(
  placements: readonly unknown[] | null | undefined,
): "xray" | "text" {
  return placements && placements.length > 0 ? "xray" : "text";
}
