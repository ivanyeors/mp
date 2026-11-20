export const LOCATION_PALETTE: readonly string[] = [
  "#2dd4bf",
  "#fb923c",
  "#f472b6",
  "#a3e635",
  "#22d3ee",
  "#facc15",
];

export const OTHER_LOCATION_COLOR = "transparent";

export type LocationColorMap = ReadonlyMap<string, string>;

export function locationColorMap(ids: readonly string[]): LocationColorMap {
  const out = new Map<string, string>();
  for (const id of ids) {
    if (!out.has(id)) out.set(id, LOCATION_PALETTE[out.size % LOCATION_PALETTE.length]!);
  }
  return out;
}
