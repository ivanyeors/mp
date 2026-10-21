/** The kinds of `points_ledger` entry (ADR 0030 (q)), and how people read each. */

export const POINTS_LEDGER_KINDS = ["earn", "claim_bonus", "spend", "spend_release", "clawback", "expire", "adjust"] as const;
export type PointsLedgerKind = (typeof POINTS_LEDGER_KINDS)[number];

/** How Staff and customers read each kind. */
export const POINTS_KIND_LABEL: Record<PointsLedgerKind, string> = {
  earn: "Earned on an order",
  claim_bonus: "Claim bonus",
  spend: "Used at checkout",
  spend_release: "Returned: checkout not completed",
  clawback: "Taken back: refund",
  expire: "Expired",
  adjust: "Adjusted by Mpillow",
};
