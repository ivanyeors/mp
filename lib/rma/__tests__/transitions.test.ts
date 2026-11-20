import { describe, it, expect } from "vitest";
import {
  canTransition,
  nextStatuses,
  isTerminal,
  terminalForResolution,
  RMA_TERMINAL_STATUSES,
  type RmaStatus,
} from "@/lib/rma/transitions";

describe("rma transitions", () => {
  it("allows the documented forward edges", () => {
    expect(canTransition("requested", "approved")).toBe(true);
    expect(canTransition("requested", "rejected")).toBe(true);
    expect(canTransition("requested", "cancelled")).toBe(true);
    expect(canTransition("approved", "instructions_sent")).toBe(true);
    expect(canTransition("instructions_sent", "received")).toBe(true);
    expect(canTransition("received", "completed")).toBe(true);
    expect(canTransition("received", "refunded")).toBe(true);
  });

  it("refuses illegal transitions", () => {
    expect(canTransition("rejected", "approved")).toBe(false);
    expect(canTransition("requested", "received")).toBe(false);
    expect(canTransition("approved", "refunded")).toBe(false);
    expect(canTransition("received", "cancelled")).toBe(false);
    expect(canTransition("completed", "refunded")).toBe(false);
  });

  it("marks the four terminal states as terminal with no exits", () => {
    for (const s of RMA_TERMINAL_STATUSES) {
      expect(isTerminal(s)).toBe(true);
      expect(nextStatuses(s)).toEqual([]);
    }
  });

  it("cancellable until received, then not", () => {
    const cancellable: RmaStatus[] = ["requested", "approved", "instructions_sent"];
    for (const s of cancellable) expect(canTransition(s, "cancelled")).toBe(true);
    expect(canTransition("received", "cancelled")).toBe(false);
  });

  it("maps resolution to its terminal outcome", () => {
    expect(terminalForResolution("refund")).toBe("refunded");
    expect(terminalForResolution("exchange")).toBe("completed");
    expect(terminalForResolution("replacement")).toBe("completed");
  });
});
