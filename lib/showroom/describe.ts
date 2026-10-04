import type { ShowroomUnit, Vec3, ViewerPart } from "./types";

/**
 * Zone colours in the viewer: the render pipeline's red / green / blue ID
 * colours, softened so the shell still reads as a building.
 */
export const ZONE_TINTS: [number, number, number][] = [
  [204, 118, 100], [110, 172, 124], [106, 148, 204],
  [214, 186, 92], [178, 120, 190], [96, 182, 188],
];

/** The key's swatches: each entry's colour is the one its item is painted in. */
export function legendSwatches(unit: ShowroomUnit): { label: string; rgb: [number, number, number] }[] {
  return unit.legend.flatMap(({ label, item }) => {
    const rgb = unit.model.parts.find((p) => p.item === item)?.rgb;
    return rgb ? [{ label, rgb }] : [];
  });
}

/** What a part is, in words: a wall piece's own name, else its item's, else the raw item. */
export function partLabel(unit: ShowroomUnit, part: Pick<ViewerPart, "item" | "role">): string {
  return unit.pieceNames[`${part.item}:${part.role}`] ?? unit.partNames[part.item] ?? part.item;
}

/** Axis-aligned bounds of a flat xyz list. */
export function bounds(position: number[]): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < position.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], position[i + k]);
      max[k] = Math.max(max[k], position[i + k]);
    }
  }
  return { min, max };
}

const m = (x: number) => x.toFixed(2);

/** A part's size and place, one line each: plan size, height range, plan position. */
export function partFacts(b: { min: Vec3; max: Vec3 }): string[] {
  const [x0, y0, z0] = b.min;
  const [x1, y1, z1] = b.max;
  return [
    `${m(x1 - x0)} × ${m(z1 - z0)} m in plan`,
    `${m(y0)} → ${m(y1)} m above floor`,
    `x ${m(x0)}–${m(x1)} · z ${m(z0)}–${m(z1)}`,
  ];
}

/**
 * Camera distance that fits a halfW × halfH metre frame (half-width across the
 * screen, half-height up it) into a perspective view of vertical `fovDeg`.
 */
export function fitDistance(halfW: number, halfH: number, fovDeg: number, aspect: number): number {
  const t = Math.tan((fovDeg * Math.PI) / 360);
  return Math.max(halfH / t, halfW / (t * aspect));
}
