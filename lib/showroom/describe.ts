import type { ShowroomUnit, Vec3, ViewerPart } from "./types";

export const ZONE_TINTS: [number, number, number][] = [
  [204, 118, 100], [110, 172, 124], [106, 148, 204],
  [214, 186, 92], [178, 120, 190], [96, 182, 188],
];

export function legendSwatches(unit: ShowroomUnit): { label: string; rgb: [number, number, number] }[] {
  return unit.legend.flatMap(({ label, item }) => {
    const rgb = unit.model.parts.find((p) => p.item === item)?.rgb;
    return rgb ? [{ label, rgb }] : [];
  });
}

export function partLabel(unit: ShowroomUnit, part: Pick<ViewerPart, "item" | "role">): string {
  const named = unit.pieceNames[`${part.item}:${part.role}`] ?? unit.partNames[part.item];
  if (named) return named;
  if (part.role === "block") return blockLabel(part.item);
  return part.item;
}

function blockLabel(name: string): string {
  const words = name.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

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

export function partFacts(b: { min: Vec3; max: Vec3 }): string[] {
  const [x0, y0, z0] = b.min;
  const [x1, y1, z1] = b.max;
  return [
    `${m(x1 - x0)} × ${m(z1 - z0)} m in plan`,
    `${m(y0)} → ${m(y1)} m above floor`,
    `x ${m(x0)}–${m(x1)} · z ${m(z0)}–${m(z1)}`,
  ];
}

export function fitDistance(halfW: number, halfH: number, fovDeg: number, aspect: number): number {
  const t = Math.tan((fovDeg * Math.PI) / 360);
  return Math.max(halfH / t, halfW / (t * aspect));
}
