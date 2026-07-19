/**
 * Slice 05: pure decision for the Result Filling configuration snapshot at
 * hold create (ADR 0008). The hold route validates the mix and fetches the
 * claimed template's current placements; this decides what gets written.
 * No placements (guest hold) → the null snapshot. `filling_template_id` is
 * set only when the server-confirmed catalog placements exactly match —
 * the client's claim alone is never trusted.
 * Slice 13: Mbolster variant shares the same decision over its own schema.
 */

import {
  bolsterPlacementsToRows,
  fingerprintPlacements,
  pillowPlacementsToRows,
  placementsExactMatch,
  type AnyPlacement,
  type BolsterPlacement,
  type BolsterPlacementRow,
  type PillowPlacement,
  type PillowPlacementRow,
} from "@/lib/spatial-fillings";

export type FillingSnapshot = {
  /** Copy rows for result_filling_placements (qty 1 per row via DB default). */
  rows: PillowPlacementRow[];
  fingerprint: string | null;
  fillingTemplateId: number | null;
};

export type BolsterFillingSnapshot = {
  /** Copy rows for result_bolster_filling_placements (qty 1 per row via DB default). */
  rows: BolsterPlacementRow[];
  fingerprint: string | null;
  fillingTemplateId: number | null;
};

/** Template id survives only on a server-confirmed exact match of the catalog placements. */
function confirmedTemplateId(
  placements: AnyPlacement[],
  claimedTemplateId: number | null,
  templatePlacements: AnyPlacement[] | null,
): number | null {
  const confirmed =
    claimedTemplateId != null &&
    templatePlacements != null &&
    templatePlacements.length > 0 &&
    placementsExactMatch(placements, templatePlacements);
  return confirmed ? claimedTemplateId : null;
}

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
  return {
    rows: pillowPlacementsToRows(placements),
    fingerprint: fingerprintPlacements(placements),
    fillingTemplateId: confirmedTemplateId(placements, claimedTemplateId, templatePlacements),
  };
}

/** Mbolster: same decision, own schema (single compartment — never pillow enums). */
export function buildBolsterFillingSnapshot(input: {
  placements: BolsterPlacement[];
  claimedTemplateId: number | null;
  templatePlacements: BolsterPlacement[] | null;
}): BolsterFillingSnapshot {
  const { placements, claimedTemplateId, templatePlacements } = input;
  if (placements.length === 0) {
    return { rows: [], fingerprint: null, fillingTemplateId: null };
  }
  return {
    rows: bolsterPlacementsToRows(placements),
    fingerprint: fingerprintPlacements(placements),
    fillingTemplateId: confirmedTemplateId(placements, claimedTemplateId, templatePlacements),
  };
}
