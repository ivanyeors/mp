export type RevealGateInput = {
  requiredInputsComplete: boolean;
  flowRouteUnresolved?: boolean;
};

export function shouldRevealRecommendation(gate: RevealGateInput): boolean {
  if (!gate.requiredInputsComplete) return false;
  if (gate.flowRouteUnresolved) return false;
  return true;
}
