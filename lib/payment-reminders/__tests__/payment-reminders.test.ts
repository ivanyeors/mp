import { describe, expect, it } from "vitest";

import {
  DEFAULT_PAYMENT_REMINDER_SETTINGS as D,
  nextReminderDue,
  parsePaymentReminderSettings,
  paymentReminderSettingsToStored,
  planPaymentReminder,
  type PaymentReminderSettings,
  type PaymentReminderState,
} from "../index";

const ASSIGNED = new Date("2026-09-01T00:00:00Z");
const day = (n: number) => new Date(ASSIGNED.getTime() + n * 24 * 60 * 60 * 1000);

const fresh: PaymentReminderState = {
  assignedAt: ASSIGNED,
  lastReminderAt: null,
  remindersSent: 0,
};

describe("parsePaymentReminderSettings", () => {
  it("falls back to defaults on empty storage", () => {
    expect(parsePaymentReminderSettings({})).toEqual(D);
  });

  it("round-trips through stored form", () => {
    const s: PaymentReminderSettings = {
      enabled: false,
      firstDelayDays: 5,
      intervalDays: 7,
      maxReminders: 2,
    };
    expect(parsePaymentReminderSettings(paymentReminderSettingsToStored(s))).toEqual(s);
  });

  it("accepts a zero first delay but never a zero interval", () => {
    const s = parsePaymentReminderSettings({
      results_payment_reminder_first_days: "0",
      results_payment_reminder_interval_days: "0",
    });
    // 0 days to the first chase is a real choice; a 0-day interval would mail
    // the customer on every daily tick until the cap.
    expect(s.firstDelayDays).toBe(0);
    expect(s.intervalDays).toBe(1);
  });

  it("ignores garbage and negatives", () => {
    const s = parsePaymentReminderSettings({
      results_payment_reminder_first_days: "-3",
      results_payment_reminder_max: "not a number",
    });
    expect(s.firstDelayDays).toBe(D.firstDelayDays);
    expect(s.maxReminders).toBe(D.maxReminders);
  });

  it("treats max 0 as 'never chase' without touching the switch", () => {
    const s = parsePaymentReminderSettings({ results_payment_reminder_max: "0" });
    expect(s.enabled).toBe(true);
    expect(planPaymentReminder(fresh, s, day(365))).toBe("none");
  });
});

describe("planPaymentReminder", () => {
  it("waits the first delay, then fires", () => {
    expect(planPaymentReminder(fresh, D, day(2))).toBe("none");
    expect(planPaymentReminder(fresh, D, day(3))).toBe("remind");
  });

  it("measures later reminders from the last one, not from assignment", () => {
    const sent = { assignedAt: ASSIGNED, lastReminderAt: day(3), remindersSent: 1 };
    expect(planPaymentReminder(sent, D, day(5))).toBe("none");
    expect(planPaymentReminder(sent, D, day(6))).toBe("remind");
  });

  it("stops at the cap", () => {
    const done = {
      assignedAt: ASSIGNED,
      lastReminderAt: day(9),
      remindersSent: D.maxReminders,
    };
    expect(planPaymentReminder(done, D, day(400))).toBe("none");
    expect(nextReminderDue(done, D)).toBeNull();
  });

  it("sends nothing at all when disabled", () => {
    const off = { ...D, enabled: false };
    expect(planPaymentReminder(fresh, off, day(365))).toBe("none");
  });

  it("does not skip a reminder the daily cron arrives late for", () => {
    // Cron missed a day; the chase was due at day 3 and this tick is day 4.
    expect(planPaymentReminder(fresh, D, day(4))).toBe("remind");
  });

  it("walks a full three-reminder schedule and then goes quiet", () => {
    let state = fresh;
    const fired: number[] = [];
    for (let d = 0; d <= 30; d++) {
      if (planPaymentReminder(state, D, day(d)) === "remind") {
        fired.push(d);
        state = {
          ...state,
          lastReminderAt: day(d),
          remindersSent: state.remindersSent + 1,
        };
      }
    }
    expect(fired).toEqual([3, 6, 9]);
  });
});
