import { describe, it, expect } from "vitest";
import { emailTemplateForStatus } from "@/lib/rma/lifecycle";
import { nextStatuses, type RmaStatus } from "@/lib/rma/transitions";

describe("emailTemplateForStatus", () => {
  it("maps each notifying transition to its template", () => {
    expect(emailTemplateForStatus("approved")).toBe("rma_approved");
    expect(emailTemplateForStatus("rejected")).toBe("rma_rejected");
    expect(emailTemplateForStatus("instructions_sent")).toBe("rma_instructions");
    expect(emailTemplateForStatus("completed")).toBe("rma_completed");
    expect(emailTemplateForStatus("refunded")).toBe("rma_refunded");
  });

  it("is silent for internal / already-notified statuses", () => {
    expect(emailTemplateForStatus("requested")).toBeNull();
    expect(emailTemplateForStatus("received")).toBeNull();
    expect(emailTemplateForStatus("cancelled")).toBeNull();
  });

  it("every admin-driven transition target from requested/approved has a template", () => {
    const adminTargets: RmaStatus[] = ["approved", "rejected", "instructions_sent"];
    for (const t of adminTargets) {
      expect(nextStatuses("requested").concat(nextStatuses("approved"))).toContain(t);
      expect(emailTemplateForStatus(t)).not.toBeNull();
    }
  });
});
