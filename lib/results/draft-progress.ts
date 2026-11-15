import { draftAnswersFrom, draftConfiguratorOf, resumeStepFor } from "@/lib/configurator/continue-draft";
import { stepOrderFor, type MpConfigStep } from "@/lib/mp-config/flow-variant";

/**
 * How a **Draft Result** reads in the Results queue (PRD-results-to-customer
 * slice 03): where the shopper stopped, and whether it was started online.
 * Pure, over the stored row.
 */

function record(stored: unknown): Record<string, unknown> {
  return stored && typeof stored === "object" && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {};
}

/** Each question, as Staff name the step someone stopped on. */
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

/** The questions a Draft counts, in this configurator's order: not the welcome, What to expect or the optional photos. */
const counted = (step: MpConfigStep) => step !== "welcome" && step !== "what-to-expect" && step !== "photos";

export interface DraftProgress {
  /** The first question left unanswered, or `preview` once every one is. */
  step: MpConfigStep;
  /** Staff's words: "Stopped at Shoulder", or "Saw their recommendation". */
  label: string;
  /** Questions answered before it, of how many (the preview not counted). */
  answered: number;
  of: number;
}

/**
 * Where a Draft stopped, by the same rule its **Continue link** reopens on
 * (`resumeStepFor`), so the queue and the link agree.
 */
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

/** The row's columns this module reads. */
export interface DraftRowFacts {
  status?: string | null;
  source?: string | null;
  data?: unknown;
}

/**
 * A guest's own Draft, started online: its email came from the first question,
 * recorded with `data.configurator` (ADR 0049, 0050).
 */
export function isOnlineDraft(row: DraftRowFacts): boolean {
  if (row.status != null) return false;
  const configurator = record(row.data).configurator;
  return configurator === "full" || configurator === "basic";
}

/**
 * The source the queue shows and filters by. A guest's Draft reads *Online*:
 * its stored `source` is the column default, `manual`, which the list would
 * otherwise call *In-store*. Display only: `source` itself is never written
 * for this, since it authorises the no-card submit
 * (`app/api/mp-config/responses/route.ts`).
 */
export function resultSourceKey(row: DraftRowFacts): string {
  if (row.source === "staff_assisted" || row.source === "online_purchase") return row.source;
  if (isOnlineDraft(row)) return "online_customization";
  return row.source ?? "manual";
}
