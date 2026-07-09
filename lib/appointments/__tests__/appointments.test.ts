import { describe, it, expect } from "vitest";
import {
  isPhoneAllowed,
  normalizePhone,
} from "@/lib/appointments/phone";
import {
  DEFAULT_APPOINTMENT_SETTINGS,
  parseAppointmentSettings,
} from "@/lib/appointments/settings";
import { resolveAppointmentType } from "@/lib/appointments/type";
import {
  offerSlots,
  sgtLocalToUtcMs,
  type BusyInterval,
} from "@/lib/appointments/slots";
import {
  isMorningOfEligible,
  transitionReminder,
} from "@/lib/appointments/state";
import { extractPhoneFromEvent, extractGuestName } from "@/lib/appointments/calendar";

describe("appointment-phone", () => {
  it("normalizes SG formats to E.164", () => {
    expect(normalizePhone("87805311")).toBe("+6587805311");
    expect(normalizePhone("8780 5311")).toBe("+6587805311");
    expect(normalizePhone("+65 8780 5311")).toBe("+6587805311");
    expect(normalizePhone("65 87805311")).toBe("+6587805311");
    expect(normalizePhone("61234567")).toBe("+6561234567");
  });

  it("rejects invalid numbers", () => {
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("abcdefgh")).toBeNull();
  });

  it("allowlist gates non-prod only", () => {
    expect(
      isPhoneAllowed("+6587805311", {
        nodeEnv: "production",
        allowlistEnv: "+6599999999",
      }),
    ).toBe(true);
    expect(
      isPhoneAllowed("+6587805311", {
        nodeEnv: "development",
        allowlistEnv: "+6599999999",
      }),
    ).toBe(false);
    expect(
      isPhoneAllowed("+6587805311", {
        nodeEnv: "development",
        allowlistEnv: "87805311",
      }),
    ).toBe(true);
    expect(
      isPhoneAllowed("+6587805311", {
        nodeEnv: "development",
        allowlistEnv: "",
      }),
    ).toBe(true);
  });
});

describe("appointment-type", () => {
  const settings = DEFAULT_APPOINTMENT_SETTINGS;

  it("matches Customisation and Re-adjustment summaries", () => {
    expect(
      resolveAppointmentType("Jane - Mpillow Customisation", settings).type,
    ).toBe("customisation");
    expect(
      resolveAppointmentType("Bob - Mpillow Re-adjustment", settings).bookingUrl,
    ).toBe(settings.readjustmentBookingUrl);
  });

  it("falls back to Customisation URL when unclear", () => {
    const r = resolveAppointmentType("Mystery booking", settings);
    expect(r.type).toBe("customisation");
    expect(r.bookingUrl).toBe(settings.customisationBookingUrl);
  });
});

describe("appointment-slots", () => {
  it("respects last-start 18:00, bookable days, busy overlap, max three", () => {
    // Wednesday 2026-07-08 09:00 SGT = 2026-07-08 01:00 UTC
    const now = new Date(sgtLocalToUtcMs(2026, 7, 8, 9, 0));
    const busy: BusyInterval[] = [
      {
        startMs: sgtLocalToUtcMs(2026, 7, 8, 10, 0),
        endMs: sgtLocalToUtcMs(2026, 7, 8, 11, 0),
      },
    ];
    const slots = offerSlots(busy, DEFAULT_APPOINTMENT_SETTINGS, now);
    expect(slots.length).toBe(3);
    // First free after busy 10–11 → 11:00
    expect(slots[0]!.startIso).toBe(new Date(sgtLocalToUtcMs(2026, 7, 8, 11, 0)).toISOString());
    // No Monday (bookable Tue–Sun only) — if we jump far, still ≤3
    for (const s of slots) {
      const start = Date.parse(s.startIso);
      const hour = new Date(start + 8 * 3600_000).getUTCHours();
      expect(hour).toBeGreaterThanOrEqual(10);
      expect(hour).toBeLessThanOrEqual(18);
      expect(start).toBeGreaterThan(now.getTime());
      // not overlapping busy
      expect(start >= busy[0]!.endMs || start + 3600_000 <= busy[0]!.startMs).toBe(true);
    }
  });

  it("skips Monday when only Tue–Sun bookable", () => {
    // Sunday evening → next slots should not land on Monday
    const now = new Date(sgtLocalToUtcMs(2026, 7, 12, 19, 0)); // Sun 19:00 SGT
    const slots = offerSlots([], DEFAULT_APPOINTMENT_SETTINGS, now);
    expect(slots.length).toBe(3);
    for (const s of slots) {
      const dow = new Date(Date.parse(s.startIso) + 8 * 3600_000).getUTCDay();
      expect(dow).not.toBe(1); // not Monday
    }
  });
});

describe("appointment-reminder-state", () => {
  it("confirm path: pending → reminded → confirmed (idempotent)", () => {
    expect(transitionReminder("pending", { type: "day_before_sent" })).toMatchObject({
      ok: true,
      status: "reminded",
    });
    expect(transitionReminder("reminded", { type: "confirm" })).toMatchObject({
      ok: true,
      status: "confirmed",
    });
    expect(transitionReminder("confirmed", { type: "confirm" })).toMatchObject({
      ok: true,
      noop: true,
      status: "confirmed",
    });
  });

  it("reschedule happy path and second reject", () => {
    expect(
      transitionReminder("reminded", { type: "request_reschedule" }),
    ).toMatchObject({ status: "offering_slots", intent: "offer_slots" });
    expect(
      transitionReminder("offering_slots", { type: "slot_picked" }),
    ).toMatchObject({ status: "rescheduled", intent: "confirm_reschedule" });
    expect(
      transitionReminder("offering_slots", { type: "slots_rejected" }),
    ).toMatchObject({ status: "cancelled", intent: "cancel_and_rebook" });
  });

  it("morning-of only from reminded", () => {
    expect(isMorningOfEligible("reminded")).toBe(true);
    expect(isMorningOfEligible("confirmed")).toBe(false);
    expect(transitionReminder("reminded", { type: "morning_of_sent" })).toMatchObject({
      status: "morning_sent",
    });
    expect(transitionReminder("confirmed", { type: "morning_of_sent" }).ok).toBe(false);
  });

  it("invalid phone → skipped", () => {
    expect(transitionReminder("pending", { type: "invalid_phone" })).toMatchObject({
      status: "skipped_invalid_phone",
    });
  });
});

describe("appointment-settings parse", () => {
  it("merges defaults", () => {
    expect(parseAppointmentSettings({})).toEqual(DEFAULT_APPOINTMENT_SETTINGS);
  });
});

describe("calendar extract helpers", () => {
  it("extracts phone and guest name from event fields", () => {
    expect(
      extractPhoneFromEvent({
        description: "Guest phone: +65 8780 5311",
      }),
    ).toBe("+6587805311");
    expect(
      extractGuestName({
        summary: "Alice Tan - Mpillow Customisation",
        attendees: [],
      }),
    ).toBe("Alice Tan");
  });
});
