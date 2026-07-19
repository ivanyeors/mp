/**
 * Preview reveal gate: recommendation UI only when inputs are complete and
 * any Flow route is resolved (slice 06). Mid-wizard never shows a partial answer.
 */

export type RevealGateInput = {
  /** All flow-catalog engine inputs answered. */
  requiredInputsComplete: boolean;
  /**
   * True while an Upsell card awaits Upgrade/Keep (slice 06).
   * Until then, omit — treated as resolved.
   */
  flowRouteUnresolved?: boolean;
};

/** Whether the completed preview may render size + why + mix. */
export function shouldRevealRecommendation(gate: RevealGateInput): boolean {
  if (!gate.requiredInputsComplete) return false;
  if (gate.flowRouteUnresolved) return false;
  return true;
}
