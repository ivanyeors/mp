/** Assign-save decision for the spatial filling snapshot (slice 06). Pure — no I/O. */

import { fingerprintPlacements, placementsExactMatch, type AnyPlacement } from "@/lib/spatial-fillings";

export type FillingAssignDecision = {
  /** Kept only while the saved snapshot exactly matches the confirmed template (PRD divergence rule). */
  fillingTemplateId: number | null;
  /** Null when the save carries no placement rows — "fillings not yet chosen" stays explicit. */
  fillingFingerprint: string | null;
};

export function decideFillingAssign(input: {
  confirmedTemplateId: number;
  saved: AnyPlacement[];
  templatePlacements: AnyPlacement[];
}): FillingAssignDecision {
  return {
    fillingTemplateId: placementsExactMatch(input.saved, input.templatePlacements)
      ? input.confirmedTemplateId
      : null,
    fillingFingerprint: input.saved.length > 0 ? fingerprintPlacements(input.saved) : null,
  };
}
