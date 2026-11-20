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
  rows: PillowPlacementRow[];
  fingerprint: string | null;
  fillingTemplateId: number | null;
};

export type BolsterFillingSnapshot = {
  rows: BolsterPlacementRow[];
  fingerprint: string | null;
  fillingTemplateId: number | null;
};

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
  claimedTemplateId: number | null;
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
