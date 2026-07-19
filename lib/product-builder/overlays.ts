import { z } from "zod/v4";

/**
 * Product Builder (slice 10): cover/case Item → overlay Media Asset mapping.
 * Fit is an optional non-default placement inside the silhouette viewBox
 * (664×374 for the pillow): uniform scale + x/y offsets in viewBox units.
 */
export const OverlayFitSchema = z.object({
  scale: z.number().min(0.2).max(3).optional(),
  x: z.number().min(-400).max(400).optional(),
  y: z.number().min(-400).max(400).optional(),
});

export type OverlayFit = z.infer<typeof OverlayFitSchema>;

/** Overlay payload riding along on configurator ComponentOptions. */
export type ItemOverlay = { url: string; fit: OverlayFit | null };

/**
 * SVG <image> frame for an overlay inside the silhouette viewBox.
 * No fit (or identity fit) fills the whole viewBox, centered.
 */
export function overlayFrame(
  fit: OverlayFit | null | undefined,
  viewW = 664,
  viewH = 374,
): { x: number; y: number; width: number; height: number } {
  const scale = fit?.scale ?? 1;
  const width = viewW * scale;
  const height = viewH * scale;
  return {
    x: (viewW - width) / 2 + (fit?.x ?? 0),
    y: (viewH - height) / 2 + (fit?.y ?? 0),
    width,
    height,
  };
}
