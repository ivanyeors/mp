import { draftAnswersFrom, draftConfiguratorOf, resumeStepFor } from "@/lib/configurator/continue-draft";
import { stepOrderFor, type MpConfigStep } from "@/lib/mp-config/flow-variant";

function record(stored: unknown): Record<string, unknown> {
  return stored && typeof stored === "object" && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {};
}

export const DRAFT_STEP_LABEL: Record<MpConfigStep, string> = {
  welcome: "Welcome",
  "what-to-expect": "What to expect",
  name: "Name",
  age: "Age and gender",
  health: "Sleep and health",
  "shoulder-length": "Shoulder",
  "neck-to-back": "Neck to back",
  "head-to-back": "Head to back",
  "neck-length": "Neck length",
  photos: "Photos",
  preview: "Recommendation",
};

const counted = (step: MpConfigStep) => step !== "welcome" && step !== "what-to-expect" && step !== "photos";

export interface DraftProgress {
  step: MpConfigStep;
  label: string;
  answered: number;
  of: number;
}

export function draftProgress(stored: unknown): DraftProgress {
  const variant = draftConfiguratorOf(stored);
  const step = resumeStepFor(variant, draftAnswersFrom(stored));
  const questions: MpConfigStep[] = stepOrderFor(variant).filter((s) => counted(s) && s !== "preview");
  const at = questions.indexOf(step);
  const answered = at === -1 ? questions.length : at;
  return {
    step,
    label: step === "preview" ? "Saw their recommendation" : `Stopped at ${DRAFT_STEP_LABEL[step]}`,
    answered,
    of: questions.length,
  };
}

export interface DraftRowFacts {
  status?: string | null;
  source?: string | null;
  data?: unknown;
}

export function isOnlineDraft(row: DraftRowFacts): boolean {
  if (row.status != null) return false;
  const configurator = record(row.data).configurator;
  return configurator === "full" || configurator === "basic";
}

export function resultSourceKey(row: DraftRowFacts): string {
  if (row.source === "staff_assisted" || row.source === "online_purchase") return row.source;
  if (isOnlineDraft(row)) return "online_customization";
  return row.source ?? "manual";
}
