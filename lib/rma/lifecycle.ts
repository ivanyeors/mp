/**
 * RMA transition → lifecycle-email mapping (ADR 0011, slice 05/06). Pure: given
 * the status a request is moving *to*, which customer email (if any) should fire.
 * Shared by every admin transition action so the wiring never drifts from the
 * state machine.
 */
import type { RmaStatus } from "./transitions";
import type { RmaEmailTemplateName } from "@/lib/email/rma";

/**
 * The email to send when an RMA enters `to`. `null` for statuses that are
 * internal steps with no customer notification (`requested` already emailed at
 * create; `received` is a staff mark; `cancelled` is silent).
 */
export function emailTemplateForStatus(to: RmaStatus): RmaEmailTemplateName | null {
  switch (to) {
    case "approved":
      return "rma_approved";
    case "rejected":
      return "rma_rejected";
    case "instructions_sent":
      return "rma_instructions";
    case "completed":
      return "rma_completed";
    case "refunded":
      return "rma_refunded";
    default:
      return null; // requested, received, cancelled
  }
}
