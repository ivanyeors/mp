export type CapturePlan =
  | { kind: "capture"; amount: number }
  | { kind: "top_up"; holdCapture: number; topUp: number };

export function planCapture(finalAmount: number, authorizedAmount: number): CapturePlan {
  if (finalAmount <= 0) {
    throw new Error("final amount must be positive");
  }
  if (authorizedAmount <= 0) {
    return { kind: "top_up", holdCapture: 0, topUp: finalAmount };
  }
  if (finalAmount <= authorizedAmount) {
    return { kind: "capture", amount: finalAmount };
  }
  return {
    kind: "top_up",
    holdCapture: authorizedAmount,
    topUp: Math.round((finalAmount - authorizedAmount) * 100) / 100,
  };
}
