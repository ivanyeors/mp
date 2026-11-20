import { describe, it, expect } from "vitest";
import {
  isPhoneAllowed,
  normalizePhone,
} from "@/lib/appointments/phone";
import {
  DEFAULT_APPOINTMENT_SETTINGS,
  appointmentSettingsToStored,
  availabilityFromLegacy,
  legacyFromAvailability,
  parseAppointmentSettings,
  validateAvailability,
} from "@/lib/appointments/settings";
import { resolveAppointmentType, matchAppointmentType } from "@/lib/appointments/type";
import {
  blockedRangesToBusy,
  offerSlots,
  sgtLocalToUtcMs,
  suggestNextDays,
  type BusyInterval,
} from "@/lib/appointments/slots";
import {
  LIVE_STATUSES,
  isDayBeforeEligible,
  isMorningOfEligible,
  missedReminder,
  transitionReminder,
} from "@/lib/appointments/state";
import {
  parseFailedDeliveries,
  parseInboundActions,
  withinServiceWindow,
} from "@/lib/appointments/whatsapp";
import {
  extractPhoneFromEvent,
  extractGuestName,
  mapGCalItemToRangeEvent,
  resolveEventLocation,
  plainDescription,
  toGCalRfc3339,
  formatGoogleCalendarError,
  eventStateOf,
  mapGCalItemToGuestEvent,
} from "@/lib/appointments/calendar";

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

  it("matchAppointmentType returns null for non-appointment busy blocks", () => {
    expect(matchAppointmentType("Out of office", settings)).toBeNull();
    expect(matchAppointmentType("Blocked", settings)).toBeNull();
    expect(matchAppointmentType("Focus time", settings)).toBeNull();
  });
});

describe("appointment-slots", () => {
  it("respects last-start 18:00, bookable days, busy overlap, max three", () => {
    const now = new Date(sgtLocalToUtcMs(2026, 7, 8, 9, 0));
    const busy: BusyInterval[] = [
      {
        startMs: sgtLocalToUtcMs(2026, 7, 8, 10, 0),
        endMs: sgtLocalToUtcMs(2026, 7, 8, 11, 0),
      },
    ];
    const slots = offerSlots(busy, DEFAULT_APPOINTMENT_SETTINGS, now);
    expect(slots.length).toBe(3);
    expect(slots[0]!.startIso).toBe(new Date(sgtLocalToUtcMs(2026, 7, 8, 11, 0)).toISOString());
    for (const s of slots) {
      const start = Date.parse(s.startIso);
      const hour = new Date(start + 8 * 3600_000).getUTCHours();
      expect(hour).toBeGreaterThanOrEqual(10);
      expect(hour).toBeLessThanOrEqual(18);
      expect(start).toBeGreaterThan(now.getTime());
      expect(start >= busy[0]!.endMs || start + 3600_000 <= busy[0]!.startMs).toBe(true);
    }
  });

  it("suggests the earliest days with three or more free times", () => {
    const now = new Date(sgtLocalToUtcMs(2026, 7, 4, 9, 0));
    const busy: BusyInterval[] = [
      { startMs: sgtLocalToUtcMs(2026, 7, 4, 0, 0), endMs: sgtLocalToUtcMs(2026, 7, 6, 0, 0) },
    ];
    const days = suggestNextDays(busy, DEFAULT_APPOINTMENT_SETTINGS, {}, now);
    expect(days).toEqual([
      { date: "2026-07-07", count: 9 },
      { date: "2026-07-08", count: 9 },
      { date: "2026-07-09", count: 9 },
    ]);
  });

  it("drops a day that has fewer than three free times", () => {
    const now = new Date(sgtLocalToUtcMs(2026, 7, 4, 9, 0));
    const busy: BusyInterval[] = [
      { startMs: sgtLocalToUtcMs(2026, 7, 4, 0, 0), endMs: sgtLocalToUtcMs(2026, 7, 6, 0, 0) },
      { startMs: sgtLocalToUtcMs(2026, 7, 7, 0, 0), endMs: sgtLocalToUtcMs(2026, 7, 7, 17, 0) },
    ];
    const days = suggestNextDays(busy, DEFAULT_APPOINTMENT_SETTINGS, {}, now);
    expect(days.map((d) => d.date)).toEqual(["2026-07-08", "2026-07-09", "2026-07-10"]);
  });

  it("falls back to any opening when no day can reach three", () => {
    const now = new Date(sgtLocalToUtcMs(2026, 7, 4, 9, 0));
    const settings = { ...DEFAULT_APPOINTMENT_SETTINGS, durationMinutes: 240 };
    const days = suggestNextDays([], settings, {}, now);
    expect(days.map((d) => d.date)).toEqual(["2026-07-04", "2026-07-05", "2026-07-07"]);
    for (const d of days) expect(d.count).toBe(2);
  });

  it("never suggests past the booking horizon", () => {
    const now = new Date(sgtLocalToUtcMs(2026, 7, 4, 9, 0));
    const settings = { ...DEFAULT_APPOINTMENT_SETTINGS, slotLookaheadDays: 2 };
    const busy: BusyInterval[] = [
      { startMs: sgtLocalToUtcMs(2026, 7, 4, 0, 0), endMs: sgtLocalToUtcMs(2026, 7, 5, 0, 0) },
    ];
    const days = suggestNextDays(busy, settings, {}, now);
    expect(days.map((d) => d.date)).toEqual(["2026-07-05"]);
  });

  it("skips Monday when only Tue–Sun bookable", () => {
    const now = new Date(sgtLocalToUtcMs(2026, 7, 12, 19, 0));
    const slots = offerSlots([], DEFAULT_APPOINTMENT_SETTINGS, now);
    expect(slots.length).toBe(3);
    for (const s of slots) {
      const dow = new Date(Date.parse(s.startIso) + 8 * 3600_000).getUTCDay();
      expect(dow).not.toBe(1);
    }
  });

  it("skips admin-blocked ranges", () => {
    const now = new Date(sgtLocalToUtcMs(2026, 7, 8, 9, 0));
    const blockStart = new Date(sgtLocalToUtcMs(2026, 7, 8, 11, 0)).toISOString();
    const blockEnd = new Date(sgtLocalToUtcMs(2026, 7, 8, 13, 0)).toISOString();
    const settings = {
      ...DEFAULT_APPOINTMENT_SETTINGS,
      blockedRanges: [{ start: blockStart, end: blockEnd }],
    };
    const slots = offerSlots([], settings, now);
    expect(slots.length).toBe(3);
    for (const s of slots) {
      const start = Date.parse(s.startIso);
      const end = Date.parse(s.endIso);
      const blocked = blockedRangesToBusy(settings.blockedRanges)[0]!;
      expect(start >= blocked.endMs || end <= blocked.startMs).toBe(true);
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

  it("morning-of from reminded, or pending as a catch-up", () => {
    expect(isMorningOfEligible("reminded")).toBe(true);
    expect(isMorningOfEligible("pending")).toBe(true);
    expect(isMorningOfEligible("confirmed")).toBe(false);
    expect(isMorningOfEligible("skipped_invalid_phone")).toBe(false);
    expect(transitionReminder("reminded", { type: "morning_of_sent" })).toMatchObject({
      status: "morning_sent",
    });
    expect(transitionReminder("pending", { type: "morning_of_sent" })).toMatchObject({
      ok: true,
      status: "morning_sent",
    });
    expect(transitionReminder("confirmed", { type: "morning_of_sent" }).ok).toBe(false);
  });

  describe("missedReminder (short-notice bookings)", () => {
    const at = (hour: number, minute = 0) => sgtLocalToUtcMs(2026, 10, 19, hour, minute);
    const tomorrow5pm = sgtLocalToUtcMs(2026, 10, 20, 17);

    it("same day → morning-of, whatever the hour", () => {
      expect(missedReminder(sgtLocalToUtcMs(2026, 10, 19, 17), at(8))).toBe("morning_of");
      expect(missedReminder(sgtLocalToUtcMs(2026, 10, 19, 17), at(11))).toBe("morning_of");
    });

    it("tomorrow → day-before once today's 09:00 run has gone", () => {
      expect(missedReminder(tomorrow5pm, at(9))).toBe("day_before");
      expect(missedReminder(tomorrow5pm, at(23, 59))).toBe("day_before");
    });

    it("tomorrow, before the run → left to the run", () => {
      expect(missedReminder(tomorrow5pm, at(8, 59))).toBeNull();
    });

    it("later, or already started → nothing", () => {
      expect(missedReminder(sgtLocalToUtcMs(2026, 10, 21, 10), at(23))).toBeNull();
      expect(missedReminder(at(10), at(11))).toBeNull();
    });

    it("crosses month ends in SGT, not UTC", () => {
      const lateOct31 = sgtLocalToUtcMs(2026, 10, 31, 23, 30);
      expect(missedReminder(sgtLocalToUtcMs(2026, 11, 1, 10), lateOct31)).toBe("day_before");
    });
  });

  it("cancel from any live status, once", () => {
    for (const from of LIVE_STATUSES) {
      expect(transitionReminder(from, { type: "cancel" })).toMatchObject({
        ok: true,
        noop: false,
        status: "cancelled",
      });
    }
    expect(transitionReminder("cancelled", { type: "cancel" })).toMatchObject({
      ok: true,
      noop: true,
    });
    expect(transitionReminder("skipped_invalid_phone", { type: "cancel" }).ok).toBe(false);
  });

  it("confirmed and rescheduled guests can still ask for another time", () => {
    for (const from of ["confirmed", "rescheduled", "offering_slots"] as const) {
      expect(transitionReminder(from, { type: "request_reschedule" })).toMatchObject({
        ok: true,
        status: "offering_slots",
      });
    }
    expect(transitionReminder("cancelled", { type: "request_reschedule" }).ok).toBe(false);
  });

  it("a visit moved over WhatsApp is reminded for its new date", () => {
    expect(isDayBeforeEligible("rescheduled")).toBe(true);
    expect(isMorningOfEligible("rescheduled")).toBe(true);
    expect(transitionReminder("rescheduled", { type: "day_before_sent" })).toMatchObject({
      ok: true,
      status: "reminded",
    });
    expect(isDayBeforeEligible("confirmed")).toBe(false);
    expect(isMorningOfEligible("cancelled")).toBe(false);
  });

  it("invalid phone → skipped", () => {
    expect(transitionReminder("pending", { type: "invalid_phone" })).toMatchObject({
      status: "skipped_invalid_phone",
    });
  });
});

describe("whatsapp inbound parse", () => {
  const inbound = (msg: Record<string, unknown>) => ({
    entry: [{ changes: [{ value: { messages: [{ id: "wamid.1", from: "6591234567", ...msg }] } }] }],
  });

  it("template quick-reply taps → confirm / reschedule", () => {
    expect(
      parseInboundActions(inbound({ type: "button", button: { payload: "Confirm", text: "Confirm" } })),
    ).toEqual([{ kind: "confirm", fromE164: "+6591234567", messageId: "wamid.1" }]);
    expect(
      parseInboundActions(inbound({ type: "button", button: { payload: "Reschedule", text: "Reschedule" } })),
    ).toMatchObject([{ kind: "reschedule" }]);
  });

  it("typed confirm still works without a button", () => {
    expect(parseInboundActions(inbound({ type: "text", text: { body: " Confirm " } }))).toMatchObject([
      { kind: "confirm" },
    ]);
  });

  it("free chatter and media are unknown; reactions are ignored", () => {
    expect(
      parseInboundActions(inbound({ type: "text", text: { body: "can I come at 6 instead?" } })),
    ).toMatchObject([{ kind: "unknown" }]);
    expect(parseInboundActions(inbound({ type: "audio", audio: { id: "a1" } }))).toMatchObject([
      { kind: "unknown" },
    ]);
    expect(parseInboundActions(inbound({ type: "reaction", reaction: { emoji: "👍" } }))).toEqual([]);
  });

  it("a whole-message cancel cancels; a question that mentions it does not", () => {
    expect(parseInboundActions(inbound({ type: "text", text: { body: "Cancel" } }))).toMatchObject([
      { kind: "cancel" },
    ]);
    expect(
      parseInboundActions(inbound({ type: "text", text: { body: "None of these" } })),
    ).toMatchObject([{ kind: "reject_slots" }]);
    expect(
      parseInboundActions(inbound({ type: "text", text: { body: "can I cancel and come Friday?" } })),
    ).toMatchObject([{ kind: "unknown" }]);
    expect(parseInboundActions(inbound({ type: "text", text: { body: "Ok" } }))).toMatchObject([
      { kind: "unknown" },
    ]);
  });

  it("reads failed deliveries, ignores other statuses", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "utility-sender" },
                statuses: [
                  { id: "wamid.ok", status: "delivered", recipient_id: "6591234567" },
                  {
                    id: "wamid.bad",
                    status: "failed",
                    recipient_id: "6591234567",
                    errors: [
                      { code: 131026, title: "Message undeliverable", error_data: { details: "Receiver incapable" } },
                    ],
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    expect(parseFailedDeliveries(payload, "utility-sender")).toEqual([
      {
        waId: "wamid.bad",
        recipient: "+6591234567",
        reason: "WhatsApp delivery failed (131026): Receiver incapable",
      },
    ]);
    expect(parseFailedDeliveries(payload, "sales-line")).toEqual([]);
  });

  it("the free-text window is opened by the guest's message", () => {
    const now = Date.parse("2026-10-20T10:00:00Z");
    expect(withinServiceWindow("2026-10-19T10:30:00Z", now)).toBe(true);
    expect(withinServiceWindow("2026-10-19T09:30:00Z", now)).toBe(false);
    expect(withinServiceWindow(null, now)).toBe(false);
  });

  it("only acts on messages sent to our sender", () => {
    const to = (phoneNumberId: string) => ({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: phoneNumberId },
                messages: [{ id: "wamid.2", from: "6591234567", type: "text", text: { body: "yes" } }],
              },
            },
          ],
        },
      ],
    });
    expect(parseInboundActions(to("sales-line"), "utility-sender")).toEqual([]);
    expect(parseInboundActions(to("utility-sender"), "utility-sender")).toMatchObject([
      { kind: "confirm" },
    ]);
    expect(parseInboundActions(to("sales-line"))).toMatchObject([{ kind: "confirm" }]);
  });
});

describe("appointment-settings parse", () => {
  it("merges defaults", () => {
    expect(parseAppointmentSettings({})).toEqual(DEFAULT_APPOINTMENT_SETTINGS);
  });

  it("defaults the WhatsApp kill switch to on", () => {
    expect(parseAppointmentSettings({}).whatsappEnabled).toBe(true);
  });

  it("turns WhatsApp off only for an explicit false", () => {
    expect(
      parseAppointmentSettings({ appointments_whatsapp_enabled: "false" }).whatsappEnabled,
    ).toBe(false);
    expect(
      parseAppointmentSettings({ appointments_whatsapp_enabled: "0" }).whatsappEnabled,
    ).toBe(false);
    expect(
      parseAppointmentSettings({ appointments_whatsapp_enabled: "" }).whatsappEnabled,
    ).toBe(true);
    expect(
      parseAppointmentSettings({ appointments_whatsapp_enabled: "nope" }).whatsappEnabled,
    ).toBe(true);
  });

  it("round-trips the WhatsApp switch via stored keys", () => {
    const off = { ...DEFAULT_APPOINTMENT_SETTINGS, whatsappEnabled: false };
    expect(parseAppointmentSettings(appointmentSettingsToStored(off)).whatsappEnabled).toBe(
      false,
    );
  });

  it("parses blocked ranges JSON", () => {
    const start = new Date(sgtLocalToUtcMs(2026, 7, 10, 14, 0)).toISOString();
    const end = new Date(sgtLocalToUtcMs(2026, 7, 10, 16, 0)).toISOString();
    const parsed = parseAppointmentSettings({
      appointments_blocked_ranges: JSON.stringify([{ start, end }]),
    });
    expect(parsed.blockedRanges).toEqual([{ start, end }]);
  });

  it("round-trips blocked ranges via stored keys", () => {
    const start = new Date(sgtLocalToUtcMs(2026, 7, 11, 10, 0)).toISOString();
    const end = new Date(sgtLocalToUtcMs(2026, 7, 11, 12, 0)).toISOString();
    const settings = {
      ...DEFAULT_APPOINTMENT_SETTINGS,
      blockedRanges: [{ start, end }],
    };
    const stored = appointmentSettingsToStored(settings);
    expect(parseAppointmentSettings(stored).blockedRanges).toEqual([{ start, end }]);
  });

  it("rebuilds windows from the legacy open/close/days trio when no availability is stored", () => {
    const parsed = parseAppointmentSettings({
      appointments_open_hour: "9",
      appointments_close_hour: "17",
      appointments_bookable_days: "1,2",
      appointments_duration_minutes: "60",
    });
    expect(parsed.availability[1]).toEqual([{ start: "09:00", end: "18:00" }]);
    expect(parsed.availability[2]).toEqual([{ start: "09:00", end: "18:00" }]);
    expect(parsed.availability[0]).toEqual([]);
    expect(parsed).toMatchObject({ openHour: 9, closeHour: 17, bookableDays: [1, 2] });
    expect(DEFAULT_APPOINTMENT_SETTINGS.availability).toEqual(
      availabilityFromLegacy(DEFAULT_APPOINTMENT_SETTINGS),
    );
  });

  it("stored windows win over the trio and drive the derived hour fields", () => {
    const availability = Array.from({ length: 7 }, () => [] as { start: string; end: string }[]);
    availability[2] = [
      { start: "14:00", end: "18:00" },
      { start: "09:00", end: "12:00" },
    ];
    const parsed = parseAppointmentSettings({
      appointments_availability: JSON.stringify(availability),
      appointments_open_hour: "6",
      appointments_close_hour: "23",
      appointments_bookable_days: "0,1,2,3,4,5,6",
    });
    expect(parsed.availability[2]).toEqual([
      { start: "09:00", end: "12:00" },
      { start: "14:00", end: "18:00" },
    ]);
    expect(parsed).toMatchObject({ openHour: 9, closeHour: 17, bookableDays: [2] });
    const stored = appointmentSettingsToStored(parsed);
    expect(parseAppointmentSettings(stored).availability).toEqual(parsed.availability);
    expect(
      parseAppointmentSettings({ appointments_availability: "not json" }).availability,
    ).toEqual(DEFAULT_APPOINTMENT_SETTINGS.availability);
  });

  it("validates a week of windows", () => {
    const week = (day: { start: string; end: string }[]) => {
      const av = Array.from({ length: 7 }, () => [] as { start: string; end: string }[]);
      av[3] = day;
      return av;
    };
    expect(validateAvailability(week([{ start: "10:00", end: "12:00" }]))).toBeNull();
    expect(validateAvailability(week([{ start: "10:00", end: "24:00" }]))).toBeNull();
    expect(validateAvailability(week([{ start: "12:00", end: "10:00" }]))).toMatch(/end after/);
    expect(validateAvailability(week([{ start: "10:00", end: "10:00" }]))).toMatch(/end after/);
    expect(validateAvailability(week([{ start: "1000", end: "12:00" }]))).toMatch(/HH:MM/);
    expect(
      validateAvailability(week([{ start: "10:00", end: "13:00" }, { start: "12:00", end: "14:00" }])),
    ).toMatch(/overlap/);
    expect(validateAvailability(week([]))).toMatch(/At least one/);
    expect(validateAvailability([])).toMatch(/seven/);
    expect(legacyFromAvailability(week([]), 60).bookableDays).toEqual([]);
  });

  it("parses showCancelled as a bool (default off, garbage → default)", () => {
    expect(parseAppointmentSettings({}).showCancelled).toBe(false);
    expect(parseAppointmentSettings({ appointments_show_cancelled: "true" }).showCancelled).toBe(true);
    expect(parseAppointmentSettings({ appointments_show_cancelled: "1" }).showCancelled).toBe(true);
    expect(parseAppointmentSettings({ appointments_show_cancelled: "nope" }).showCancelled).toBe(false);
    const stored = appointmentSettingsToStored({
      ...DEFAULT_APPOINTMENT_SETTINGS,
      showCancelled: true,
    });
    expect(stored.appointments_show_cancelled).toBe("true");
    expect(parseAppointmentSettings(stored).showCancelled).toBe(true);
  });
});

describe("calendar RFC3339 + errors", () => {
  it("appends SGT offset to floating FullCalendar times", () => {
    expect(toGCalRfc3339("2026-07-05T00:00:00")).toBe("2026-07-05T00:00:00+08:00");
    expect(toGCalRfc3339("2026-07-05T00:00:00Z")).toBe("2026-07-05T00:00:00Z");
    expect(toGCalRfc3339("2026-07-05T00:00:00+08:00")).toBe("2026-07-05T00:00:00+08:00");
  });

  it("explains disabled Calendar API", () => {
    const msg = formatGoogleCalendarError(
      403,
      JSON.stringify({
        error: {
          message:
            "Google Calendar API has not been used in project 418363243665 before or it is disabled.",
        },
      }),
    );
    expect(msg).toMatch(/calendar-json\.googleapis\.com/);
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

  it("maps timed and all-day GCal items for admin mirror", () => {
    const timed = mapGCalItemToRangeEvent(
      {
        id: "t1",
        summary: "Alice - Mpillow Customisation",
        start: { dateTime: "2026-07-10T02:00:00Z" },
        end: { dateTime: "2026-07-10T03:00:00Z" },
      },
      DEFAULT_APPOINTMENT_SETTINGS,
    );
    expect(timed).toMatchObject({
      id: "t1",
      allDay: false,
      kind: "appointment",
      summary: "Alice - Mpillow Customisation",
      appointmentType: "customisation",
    });

    const allDay = mapGCalItemToRangeEvent(
      {
        id: "a1",
        summary: "Out of office",
        eventType: "outOfOffice",
        start: { date: "2026-07-11" },
        end: { date: "2026-07-12" },
      },
      DEFAULT_APPOINTMENT_SETTINGS,
    );
    expect(allDay).toMatchObject({
      id: "a1",
      allDay: true,
      kind: "busy",
      startsAt: "2026-07-11",
      endsAt: "2026-07-12",
      summary: "Out of office",
      appointmentType: null,
    });

    const blocked = mapGCalItemToRangeEvent(
      {
        id: "b1",
        summary: "Blocked",
        description: "Staff meeting / prep<br>Do not book",
        start: { dateTime: "2026-07-10T04:00:00Z" },
        end: { dateTime: "2026-07-10T06:00:00Z" },
      },
      DEFAULT_APPOINTMENT_SETTINGS,
    );
    expect(blocked).toMatchObject({
      kind: "busy",
      summary: "Blocked",
      description: "Staff meeting / prep\nDo not book",
      appointmentType: null,
    });
    expect(plainDescription("A<br>B")).toBe("A\nB");

    expect(
      mapGCalItemToRangeEvent(
        {
          id: "c1",
          status: "cancelled",
          start: { dateTime: "x" },
          end: { dateTime: "y" },
        },
        DEFAULT_APPOINTMENT_SETTINGS,
      ),
    ).toBeNull();

    const cancelledAppt = {
      id: "c2",
      status: "cancelled",
      summary: "Bob - Mpillow Customisation",
      start: { dateTime: "2026-07-10T02:00:00Z" },
      end: { dateTime: "2026-07-10T03:00:00Z" },
    };
    expect(mapGCalItemToRangeEvent(cancelledAppt, DEFAULT_APPOINTMENT_SETTINGS)).toBeNull();
    expect(
      mapGCalItemToRangeEvent(cancelledAppt, DEFAULT_APPOINTMENT_SETTINGS, {
        includeCancelled: true,
      }),
    ).toMatchObject({ id: "c2", kind: "appointment", cancelled: true, guestName: "Bob" });
    expect(
      mapGCalItemToRangeEvent(
        {
          id: "c3",
          status: "cancelled",
          summary: "Dentist",
          start: { dateTime: "2026-07-10T02:00:00Z" },
          end: { dateTime: "2026-07-10T03:00:00Z" },
        },
        DEFAULT_APPOINTMENT_SETTINGS,
        { includeCancelled: true },
      ),
    ).toBeNull();
    expect(timed?.cancelled).toBe(false);

    expect(
      mapGCalItemToRangeEvent(
        {
          id: "w1",
          eventType: "workingLocation",
          summary: "Office",
          start: { date: "2026-07-11" },
          end: { date: "2026-07-12" },
        },
        DEFAULT_APPOINTMENT_SETTINGS,
      ),
    ).toBeNull();
  });

  it("resolves an event's Location: stamped id first, then exact address, else null", () => {
    const locations = [
      { id: "own", name: "Sin Ming Studio", address: "22 Sin Ming Lane, #08-83, Midview City" },
      { id: "clinic", name: "Spine Clinic", address: "1 Clinic Ave" },
    ];
    expect(
      resolveEventLocation(
        { location: "1 Clinic Ave", extendedProperties: { private: { mpLocationId: "own" } } },
        locations,
      )?.id,
    ).toBe("own");
    expect(
      resolveEventLocation(
        { location: "1 clinic ave", extendedProperties: { private: { mpLocationId: "gone" } } },
        locations,
      )?.id,
    ).toBe("clinic");
    expect(
      resolveEventLocation({ location: "  22 sin ming   Lane, #08-83,  Midview City " }, locations)?.id,
    ).toBe("own");
    expect(resolveEventLocation({ location: "Somewhere else" }, locations)).toBeNull();
    expect(resolveEventLocation({}, locations)).toBeNull();

    const mapped = mapGCalItemToRangeEvent(
      {
        id: "t2",
        summary: "Alice - Mpillow Customisation",
        location: "1 Clinic Ave",
        start: { dateTime: "2026-07-10T02:00:00Z" },
        end: { dateTime: "2026-07-10T03:00:00Z" },
      },
      DEFAULT_APPOINTMENT_SETTINGS,
      { locations },
    );
    expect(mapped).toMatchObject({ locationId: "clinic", locationName: "Spine Clinic" });
    const busy = mapGCalItemToRangeEvent(
      {
        id: "b2",
        summary: "Lunch",
        location: "1 Clinic Ave",
        start: { dateTime: "2026-07-10T02:00:00Z" },
        end: { dateTime: "2026-07-10T03:00:00Z" },
      },
      DEFAULT_APPOINTMENT_SETTINGS,
      { locations },
    );
    expect(busy).toMatchObject({ kind: "busy", locationId: null, locationName: null });
  });

  it("derives guest RSVP from first non-self attendee (missing → needsAction, self ignored)", () => {
    const rsvpOf = (
      attendees: Array<{ self?: boolean; responseStatus?: string }> | undefined,
    ) =>
      mapGCalItemToRangeEvent(
        {
          id: "r1",
          summary: "Alice - Mpillow Customisation",
          start: { dateTime: "2026-07-10T02:00:00Z" },
          end: { dateTime: "2026-07-10T03:00:00Z" },
          attendees,
        },
        DEFAULT_APPOINTMENT_SETTINGS,
      )?.rsvp;

    expect(rsvpOf([{ responseStatus: "accepted" }])).toBe("accepted");
    expect(
      rsvpOf([
        { self: true, responseStatus: "accepted" },
        { responseStatus: "declined" },
      ]),
    ).toBe("declined");
    expect(rsvpOf([{ responseStatus: "tentative" }])).toBe("tentative");
    expect(rsvpOf(undefined)).toBe("needsAction");
    expect(rsvpOf([{ self: true, responseStatus: "accepted" }])).toBe("needsAction");
    expect(rsvpOf([{ responseStatus: "bogus" }])).toBe("needsAction");

    const ooo = mapGCalItemToRangeEvent(
      {
        id: "r2",
        summary: "Out of office",
        eventType: "outOfOffice",
        start: { date: "2026-07-11" },
        end: { date: "2026-07-12" },
        attendees: [{ responseStatus: "accepted" }],
      },
      DEFAULT_APPOINTMENT_SETTINGS,
    );
    expect(ooo?.kind).toBe("busy");
    expect(ooo?.rsvp).toBeNull();
  });

  it("an appointment is off when deleted or declined, on otherwise", () => {
    expect(eventStateOf({ status: "cancelled" })).toBe("cancelled");
    expect(eventStateOf({ status: "confirmed", attendees: [{ responseStatus: "declined" }] })).toBe(
      "declined",
    );
    expect(
      eventStateOf({ status: "confirmed", attendees: [{ self: true, responseStatus: "declined" }] }),
    ).toBe("live");
    expect(eventStateOf({ status: "confirmed", attendees: [{ responseStatus: "accepted" }] })).toBe(
      "live",
    );

    const guest = (responseStatus: string) =>
      mapGCalItemToGuestEvent(
        {
          id: "g1",
          summary: "Alice - Mpillow Customisation",
          description: "Name: Alice\nPhone: +6591234567",
          start: { dateTime: "2026-07-10T02:00:00Z" },
          end: { dateTime: "2026-07-10T03:00:00Z" },
          attendees: [{ email: "a@example.com", responseStatus }],
        },
        DEFAULT_APPOINTMENT_SETTINGS,
      );
    expect(guest("declined")?.guestDeclined).toBe(true);
    expect(guest("needsAction")?.guestDeclined).toBe(false);
  });
});

describe("gcal reschedule drift detection", () => {
  const drift = (gcal: string, row: string) =>
    Math.abs(Date.parse(gcal) - Date.parse(row)) > 60_000;

  it("same instant across +08:00 and UTC Z is not drift", () => {
    expect(drift("2026-08-20T15:00:00+08:00", "2026-08-20T07:00:00.000Z")).toBe(false);
  });

  it("a moved appointment drifts", () => {
    expect(drift("2026-08-20T18:00:00+08:00", "2026-08-20T07:00:00.000Z")).toBe(true);
  });
});
