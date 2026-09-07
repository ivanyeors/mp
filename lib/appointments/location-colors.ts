/**
 * Location colour channel for the admin calendar.
 *
 * Type is the event fill (blue / violet) and RSVP is the left-border accent
 * (green / red / amber / gray), so a Location gets the one channel left: a
 * small dot. The palette below steers clear of all six of those hues and is
 * light enough to read on the dark fills with a white ring.
 *
 * Assignment is by position in the ordered Location list, so it is stable
 * across renders and pages and needs no stored colour. Reordering Locations
 * reshuffles the dots, but the legend always shows the current mapping.
 */
export const LOCATION_PALETTE: readonly string[] = [
  "#2dd4bf", // teal-400
  "#fb923c", // orange-400
  "#f472b6", // pink-400
  "#a3e635", // lime-400
  "#22d3ee", // cyan-400
  "#facc15", // yellow-400
];

/** Events whose Location could not be resolved (hand-typed venue, or none). */
export const OTHER_LOCATION_COLOR = "transparent";

export type LocationColorMap = ReadonlyMap<string, string>;

/** Map of Location id → dot colour, in the order the ids are given. */
export function locationColorMap(ids: readonly string[]): LocationColorMap {
  const out = new Map<string, string>();
  for (const id of ids) {
    if (!out.has(id)) out.set(id, LOCATION_PALETTE[out.size % LOCATION_PALETTE.length]!);
  }
  return out;
}
