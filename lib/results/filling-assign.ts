import { fingerprintPlacements, placementsExactMatch, type AnyPlacement } from "@/lib/spatial-fillings";

export type FillingAssignDecision = {
  fillingTemplateId: number | null;
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
