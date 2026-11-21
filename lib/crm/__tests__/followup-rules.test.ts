import { describe, expect, it } from "vitest";
import {
  FollowUpInputSchema,
  FollowUpPatchSchema,
  defaultDueOn,
  describeDue,
  followUpBadge,
  followUpState,
  isDue,
  isOverdue,
  parseFollowUpScope,
  sgtToday,
  sortFollowUps,
} from "@/lib/crm/followup-rules";

const UUID = "11111111-1111-4111-8111-111111111111";
const open = (dueOn: string) => ({ dueOn, doneAt: null });

describe("today is the Singapore calendar day", () => {
  it("turns over at midnight SGT (16:00 UTC), not at midnight UTC", () => {
    expect(sgtToday(new Date("2026-10-21T15:59:59.999Z"))).toBe("2026-10-21");
    expect(sgtToday(new Date("2026-10-21T16:00:00.000Z"))).toBe("2026-10-22");
    expect(sgtToday(new Date("2026-10-21T23:30:00.000Z"))).toBe("2026-10-22");
    expect(sgtToday(new Date("2026-10-21T17:00:00.000Z"))).toBe("2026-10-22");
  });

  it("defaults a new follow-up to tomorrow in Singapore", () => {
    expect(defaultDueOn(new Date("2026-10-21T15:59:00Z"))).toBe("2026-10-22");
    expect(defaultDueOn(new Date("2026-10-21T16:01:00Z"))).toBe("2026-10-23");
    expect(defaultDueOn(new Date("2026-12-31T17:00:00Z"))).toBe("2027-01-02");
  });
});

describe("overdue means due before today in Singapore", () => {
  const dueOn21 = open("2026-10-21");

  it("is not overdue on its own day, right up to 23:59:59 SGT", () => {
    const today = sgtToday(new Date("2026-10-21T15:59:59Z"));
    expect(isOverdue(dueOn21, today)).toBe(false);
    expect(followUpState(dueOn21, today)).toBe("due_today");
    expect(isDue(dueOn21, today)).toBe(true);
  });

  it("is overdue from 00:00 SGT the next day, while UTC is still on the same date", () => {
    const today = sgtToday(new Date("2026-10-21T16:00:00Z"));
    expect(isOverdue(dueOn21, today)).toBe(true);
    expect(isDue(dueOn21, today)).toBe(true);
  });

  it("an upcoming one is neither overdue nor due; a done one is never either", () => {
    expect(followUpState(open("2026-10-22"), "2026-10-21")).toBe("upcoming");
    expect(isDue(open("2026-10-22"), "2026-10-21")).toBe(false);
    const done = { dueOn: "2026-10-01", doneAt: "2026-10-02T03:00:00Z" };
    expect(isOverdue(done, "2026-10-21")).toBe(false);
    expect(isDue(done, "2026-10-21")).toBe(false);
    expect(followUpState(done, "2026-10-21")).toBe("done");
  });

  it("says so in words", () => {
    expect(describeDue(open("2026-10-21"), "2026-10-21")).toBe("Due today");
    expect(describeDue(open("2026-10-23"), "2026-10-21")).toBe("Due 23 Oct 2026");
    expect(describeDue(open("2026-10-01"), "2026-10-21")).toBe("Overdue · due 1 Oct 2026");
  });
});

describe("FollowUpInputSchema", () => {
  const valid = { title: "  Call about her second pillow ", dueOn: "2026-10-23", assignedToProfileId: UUID };

  it("trims the title and keeps the rest", () => {
    expect(FollowUpInputSchema.parse(valid)).toEqual({ ...valid, title: "Call about her second pillow" });
  });

  it("refuses a blank or over-long title, a date that is not a day, and an assignee that is not an id", () => {
    expect(FollowUpInputSchema.safeParse({ ...valid, title: "   " }).success).toBe(false);
    expect(FollowUpInputSchema.safeParse({ ...valid, title: "x".repeat(201) }).success).toBe(false);
    expect(FollowUpInputSchema.safeParse({ ...valid, title: "x".repeat(200) }).success).toBe(true);
    expect(FollowUpInputSchema.safeParse({ ...valid, dueOn: "2026-02-30" }).success).toBe(false);
    expect(FollowUpInputSchema.safeParse({ ...valid, dueOn: "23/10/2026" }).success).toBe(false);
    expect(FollowUpInputSchema.safeParse({ ...valid, assignedToProfileId: "Jess" }).success).toBe(false);
  });

  it("takes one change at a time: done, or a new assignee", () => {
    expect(FollowUpPatchSchema.safeParse({ done: true }).success).toBe(true);
    expect(FollowUpPatchSchema.safeParse({ assignedToProfileId: UUID }).success).toBe(true);
    expect(FollowUpPatchSchema.safeParse({ done: false }).success).toBe(false);
    expect(FollowUpPatchSchema.safeParse({ done: true, assignedToProfileId: UUID }).success).toBe(false);
    expect(FollowUpPatchSchema.safeParse({ title: "renamed" }).success).toBe(false);
  });
});

describe("sortFollowUps", () => {
  it("puts open ones first by due date, then the done ones, latest done first", () => {
    const rows = [
      { id: "d-old", dueOn: "2026-10-01", doneAt: "2026-10-02T00:00:00Z", createdAt: "2026-09-01T00:00:00Z" },
      { id: "late", dueOn: "2026-10-30", doneAt: null, createdAt: "2026-09-01T00:00:00Z" },
      { id: "d-new", dueOn: "2026-10-05", doneAt: "2026-10-06T00:00:00Z", createdAt: "2026-09-01T00:00:00Z" },
      { id: "soon-b", dueOn: "2026-10-22", doneAt: null, createdAt: "2026-09-02T00:00:00Z" },
      { id: "soon-a", dueOn: "2026-10-22", doneAt: null, createdAt: "2026-09-01T00:00:00Z" },
    ];
    expect(sortFollowUps(rows).map((r) => r.id)).toEqual(["soon-a", "soon-b", "late", "d-new", "d-old"]);
  });
});

describe("the sidebar badge", () => {
  it("shows nothing without a profile or with nothing due", () => {
    expect(followUpBadge(null)).toBeNull();
    expect(followUpBadge({ dueToday: 0, overdue: 0 })).toBeNull();
  });

  it("counts due today and overdue, red when anything is overdue", () => {
    expect(followUpBadge({ dueToday: 2, overdue: 0 })).toEqual({
      total: 2,
      title: "Your follow-ups: 2 due today",
      urgent: false,
    });
    expect(followUpBadge({ dueToday: 1, overdue: 3 })).toEqual({
      total: 4,
      title: "Your follow-ups: 3 overdue, 1 due today",
      urgent: true,
    });
  });
});

describe("parseFollowUpScope", () => {
  it("reads the three lists, and falls back to Mine", () => {
    expect(parseFollowUpScope("all")).toBe("all");
    expect(parseFollowUpScope("overdue")).toBe("overdue");
    expect(parseFollowUpScope("mine")).toBe("mine");
    expect(parseFollowUpScope("everyone")).toBe("mine");
    expect(parseFollowUpScope(null)).toBe("mine");
  });
});
