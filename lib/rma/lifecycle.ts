import type { RmaStatus } from "./transitions";
import type { RmaEmailTemplateName } from "@/lib/email/rma";

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
      return null;
  }
}
