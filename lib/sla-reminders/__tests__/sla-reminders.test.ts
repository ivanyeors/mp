import { describe, it, expect } from "vitest";
import {
  DEFAULT_SLA_SETTINGS,
  addWorkingDays,
  authExpiresAt,
  expiryDeadline,
  parseSlaSettings,
  planHeldTick,
  STRIPE_AUTH_HOLD_DAYS,
} from "@/lib/sla-reminders";

describe("sla-reminders", () => {
  it("defaults to 5 working days and both reminder channels", () => {
    expect(parseSlaSettings({})).toEqual(DEFAULT_SLA_SETTINGS);
    expect(DEFAULT_SLA_SETTINGS.workingDays).toBe(5);
  });

  it("adds working days skipping weekends (UTC)", () => {
    const fri = new Date(Date.UTC(2026, 6, 3, 10, 0, 0));
    expect(addWorkingDays(fri, 1).toISOString().slice(0, 10)).toBe("2026-07-06");
    const mon = new Date(Date.UTC(2026, 6, 6, 10, 0, 0));
    expect(addWorkingDays(mon, 5).toISOString().slice(0, 10)).toBe("2026-07-13");
  });

  it("expires at min(SLA, auth − buffer) so capture never needs a dead hold", () => {
    const heldAt = new Date(Date.UTC(2026, 6, 6, 12, 0, 0));
    const settings = { ...DEFAULT_SLA_SETTINGS, workingDays: 5 };
    const deadline = expiryDeadline(heldAt, settings);
    const auth = authExpiresAt(heldAt);
    expect(auth.getTime() - heldAt.getTime()).toBe(STRIPE_AUTH_HOLD_DAYS * 24 * 60 * 60 * 1000);
    expect(deadline.getTime()).toBeLessThan(auth.getTime());
    expect(DEFAULT_SLA_SETTINGS.authExpiryBufferHours).toBeGreaterThanOrEqual(48);
    const longSla = expiryDeadline(heldAt, { ...settings, workingDays: 20 });
    expect(longSla.getTime()).toBe(
      auth.getTime() - DEFAULT_SLA_SETTINGS.authExpiryBufferHours * 60 * 60 * 1000,
    );
  });

  it("plans expire when past deadline", () => {
    const heldAt = new Date(Date.UTC(2026, 6, 1, 12, 0, 0));
    const now = new Date(Date.UTC(2026, 6, 20, 12, 0, 0));
    expect(
      planHeldTick({ id: "r1", heldAt, lastReminderAt: null }, DEFAULT_SLA_SETTINGS, now),
    ).toBe("expire");
  });

  it("plans remind after interval, none before", () => {
    const heldAt = new Date(Date.UTC(2026, 6, 6, 12, 0, 0));
    const settings = { ...DEFAULT_SLA_SETTINGS, reminderIntervalDays: 1, opsEmail: "ops@x.com" };
    const before = new Date(heldAt.getTime() + 12 * 60 * 60 * 1000);
    expect(planHeldTick({ id: "r1", heldAt, lastReminderAt: null }, settings, before)).toBe(
      "none",
    );
    const after = new Date(heldAt.getTime() + 25 * 60 * 60 * 1000);
    expect(planHeldTick({ id: "r1", heldAt, lastReminderAt: null }, settings, after)).toBe(
      "remind",
    );
    expect(
      planHeldTick(
        { id: "r1", heldAt, lastReminderAt: after },
        settings,
        new Date(after.getTime() + 12 * 60 * 60 * 1000),
      ),
    ).toBe("none");
  });

  it("skips remind when no channels are usable", () => {
    const heldAt = new Date(Date.UTC(2026, 6, 6, 12, 0, 0));
    const now = new Date(heldAt.getTime() + 48 * 60 * 60 * 1000);
    expect(
      planHeldTick(
        { id: "r1", heldAt, lastReminderAt: null },
        {
          ...DEFAULT_SLA_SETTINGS,
          remindTelegram: false,
          remindEmail: true,
          opsEmail: null,
        },
        now,
      ),
    ).toBe("none");
  });
});

describe("planHeldTick — a Result with no Authorization hold", () => {
  const settings = { ...DEFAULT_SLA_SETTINGS, opsEmail: "ops@mpillow.com" };
  const heldAt = new Date("2026-01-01T09:00:00.000Z");
  const now = new Date("2026-06-01T09:00:00.000Z");

  it("never expires — there is no Stripe clock to beat", () => {
    expect(planHeldTick({ id: "r1", heldAt, lastReminderAt: null }, settings, now, false))
      .toBe("remind");
  });

  it("still expires when a hold is present, unchanged", () => {
    expect(planHeldTick({ id: "r1", heldAt, lastReminderAt: null }, settings, now, true))
      .toBe("expire");
  });

  it("respects the reminder interval rather than nagging every tick", () => {
    const justReminded = new Date(now.getTime() - 60 * 60 * 1000);
    expect(
      planHeldTick({ id: "r1", heldAt, lastReminderAt: justReminded }, settings, now, false),
    ).toBe("none");
  });
});
