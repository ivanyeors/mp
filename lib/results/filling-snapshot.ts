/**
 * Slice 05: pure decision for the Result Filling configuration snapshot at
 * hold create (ADR 0008). The hold route validates the mix and fetches the
 * claimed template's current placements; this decides what gets written.
 * No placements (guest hold) → the null snapshot. `filling_template_id` is
 * set only when the server-confirmed catalog placements exactly match —
 * the client's claim alone is never trusted.
 */

import {
  fingerprintPlacements,
  pillowPlacementsToRows,
  placementsExactMatch,
  type PillowPlacement,
  type PillowPlacementRow,
} from "@/lib/spatial-fillings";

export type FillingSnapshot = {
  /** Copy rows for result_filling_placements (qty 1 per row via DB default). */
  rows: PillowPlacementRow[];
  fingerprint: string | null;
  fillingTemplateId: number | null;
};

export function buildFillingSnapshot(input: {
  placements: PillowPlacement[];
  /** Client's still-matching template claim (may be null). */
  claimedTemplateId: number | null;
  /** Current catalog placements of the claimed template (null when none claimed). */
  templatePlacements: PillowPlacement[] | null;
}): FillingSnapshot {
  const { placements, claimedTemplateId, templatePlacements } = input;
  if (placements.length === 0) {
    return { rows: [], fingerprint: null, fillingTemplateId: null };
  }
  const confirmed =
    claimedTemplateId != null &&
    templatePlacements != null &&
    templatePlacements.length > 0 &&
    placementsExactMatch(placements, templatePlacements);
  return {
    rows: pillowPlacementsToRows(placements),
    fingerprint: fingerprintPlacements(placements),
    fillingTemplateId: confirmed ? claimedTemplateId : null,
  };
}
