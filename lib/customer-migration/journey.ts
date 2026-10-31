import type { MigrationSummary } from "./overview";

/**
 * The Shopify migration as one journey (owner, 2026-10-31): every Migrated
 * customer sits at exactly one **Journey stage**, the furthest they have
 * reached, counted by `admin_customer_migration_summary`
 * (20261031120000_migration_journey_stages.sql). The Migration card draws it
 * as a funnel: each stage's bar is everyone who reached it, split into who is
 * there now and who went further.
 *
 * Pure: the card, and its tests, read the summary through `migrationJourney`.
 */

/** In journey order. The SQL checks them from the last back. */
export const JOURNEY_STAGES = ["imported", "emailed", "clicked", "signed_up", "claim_bonus", "ordered"] as const;
export type JourneyStage = (typeof JOURNEY_STAGES)[number];

/** Of `imported`, those at one stage now. */
export interface JourneyStageCount {
  here: number;
  /** Of `here`, those no campaign email can reach: unsubscribed, bounced or marked as spam. 0 from *Signed up* on. */
  unreachable: number;
}

export const JOURNEY_STAGE_LABEL: Record<JourneyStage, string> = {
  imported: "Imported",
  emailed: "Emailed",
  clicked: "Clicked",
  signed_up: "Signed up",
  claim_bonus: "Claim bonus",
  ordered: "Ordered",
};

/** What reaching the stage means, under its name. */
export const JOURNEY_STAGE_RULE: Record<JourneyStage, string> = {
  imported: "In the Shopify export",
  emailed: "A campaign email went out",
  clicked: "Opened their Claim link",
  signed_up: "Have an account here",
  claim_bonus: "Got the sign-in bonus in points",
  ordered: "Bought here since import",
};

/** Who is there now and has gone no further, for the tooltip. */
export const JOURNEY_HERE_MEANS: Record<JourneyStage, string> = {
  imported: "not emailed, clicked or signed up yet",
  emailed: "haven't opened their Claim link",
  clicked: "opened it, but haven't signed up",
  signed_up: "no Claim bonus or order yet",
  claim_bonus: "haven't ordered here yet",
  ordered: "the end of the journey",
};

/** Those who did the step itself, as a phrase: "860 were emailed". */
const DID_STEP: Partial<Record<JourneyStage, string>> = {
  emailed: "were emailed",
  clicked: "opened a Claim link",
  signed_up: "signed up",
  claim_bonus: "got the bonus",
};

export interface JourneyStep {
  stage: JourneyStage;
  label: string;
  rule: string;
  /** At this stage now, or further: the bar. */
  reached: number;
  /** At this stage now. */
  here: number;
  /** Of `here`, those no campaign email can reach. */
  unreachable: number;
  /** `reached` less `here`: the next stage's `reached`. */
  wentFurther: number;
  /** Of `reached`, those who passed this step without doing it, e.g. signed up without a campaign email. */
  skipped: number;
  /** "860 were emailed" when some skipped it; null otherwise. */
  didStep: string | null;
  /** Everyone imported: the scale every bar is drawn against. */
  total: number;
  /** `reached` of `total`, for display: "70%", "<1%". */
  ofTotal: string;
  /** `reached` of the step before's, for display; null for the first. */
  ofPrevious: string | null;
  /** The step before's label, for "35% of emailed"; null for the first. */
  previousLabel: string | null;
}

/** The facts each step counts on its own, to say how many skipped it. Null: nobody can skip it. */
function didStepCount(stage: JourneyStage, summary: MigrationSummary): number | null {
  switch (stage) {
    case "emailed":
      return summary.emailed;
    case "clicked":
      return summary.clicked;
    case "signed_up":
      return summary.signedUp;
    case "claim_bonus":
      return summary.claimBonuses;
    default:
      return null;
  }
}

/**
 * `part` of `whole` as a share to print. Never "0%" for some, nor "100%" for
 * not all: "<1%" and ">99%" keep one customer visible in the figures, as the
 * bar's minimum width does in the chart.
 */
export function shareLabel(part: number, whole: number): string {
  if (whole <= 0 || part <= 0) return "0%";
  if (part >= whole) return "100%";
  const pct = (part / whole) * 100;
  if (pct < 1) return "<1%";
  if (pct > 99) return ">99%";
  return `${Math.round(pct)}%`;
}

/** The six steps of the journey, in order, from the summary's stage counts. */
export function migrationJourney(summary: MigrationSummary): JourneyStep[] {
  const total = JOURNEY_STAGES.reduce((sum, s) => sum + summary.stages[s].here, 0);
  let reachedAfter = 0;
  const reachedBy = new Map<JourneyStage, number>();
  for (const stage of [...JOURNEY_STAGES].reverse()) {
    reachedAfter += summary.stages[stage].here;
    reachedBy.set(stage, reachedAfter);
  }

  return JOURNEY_STAGES.map((stage, i) => {
    const { here, unreachable } = summary.stages[stage];
    const reached = reachedBy.get(stage)!;
    const previous = i > 0 ? JOURNEY_STAGES[i - 1]! : null;
    const did = didStepCount(stage, summary);
    const skipped = did === null ? 0 : Math.max(0, reached - did);
    return {
      stage,
      label: JOURNEY_STAGE_LABEL[stage],
      rule: JOURNEY_STAGE_RULE[stage],
      reached,
      here,
      unreachable: Math.min(unreachable, here),
      wentFurther: reached - here,
      skipped,
      didStep: skipped > 0 && did !== null ? `${did.toLocaleString("en-SG")} ${DID_STEP[stage]}` : null,
      total,
      ofTotal: shareLabel(reached, total),
      ofPrevious: previous ? shareLabel(reached, reachedBy.get(previous)!) : null,
      previousLabel: previous ? JOURNEY_STAGE_LABEL[previous].toLowerCase() : null,
    };
  });
}
