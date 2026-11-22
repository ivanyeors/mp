import { beforeEach, describe, expect, it, vi } from "vitest";
import { guestText } from "@/lib/appointments/messages";

const m = vi.hoisted(() => ({
  sendText: vi.fn(),
  cancelAppointment: vi.fn(),
  getOpenReminderByPhone: vi.fn(),
  updateReminder: vi.fn(),
  claimAutoReply: vi.fn(),
  claimInboundMessage: vi.fn(),
  recordInboundOutcome: vi.fn(),
  recordDeliveryFailure: vi.fn(),
  latestAftercareSentAt: vi.fn(),
  recordAftercareDeliveryFailure: vi.fn(),
  visitDayFeeByEvent: vi.fn(),
  getEventTiming: vi.fn(),
}));

vi.mock("@/lib/site-settings", () => ({ getSiteSettings: () => Promise.resolve({}) }));
vi.mock("@/lib/readjustment/lifecycle", () => ({
  moveReadjustmentByEvent: vi.fn(),
  visitDayFeeByEvent: m.visitDayFeeByEvent,
}));
vi.mock("@/lib/appointments/book-slot", () => ({ isSlotFree: vi.fn(), liveSlotHolds: vi.fn() }));
vi.mock("@/lib/appointments/calendar", () => ({
  freeBusy: vi.fn(),
  patchEventTimes: vi.fn(),
  getEventTiming: m.getEventTiming,
}));
vi.mock("@/lib/appointments/cancel", () => ({ cancelAppointment: m.cancelAppointment }));
vi.mock("@/lib/appointments/reminders-db", () => ({
  claimAutoReply: m.claimAutoReply,
  claimInboundMessage: m.claimInboundMessage,
  getOpenReminderByPhone: m.getOpenReminderByPhone,
  recordDeliveryFailure: m.recordDeliveryFailure,
  recordInboundOutcome: m.recordInboundOutcome,
  updateReminder: m.updateReminder,
}));
vi.mock("@/lib/appointments/whatsapp", async (orig) => {
  const real = await orig<typeof import("@/lib/appointments/whatsapp")>();
  return { ...real, sendText: m.sendText, sendSlotList: vi.fn() };
});
vi.mock("@/lib/whatsapp/aftercare-notify", () => ({
  latestAftercareSentAt: m.latestAftercareSentAt,
  recordAftercareDeliveryFailure: m.recordAftercareDeliveryFailure,
}));

const { POST } = await import("../route");

const PHONE = "+6591234567";
const reminder = {
  id: "r1",
  calendar_event_id: "evt-1",
  phone: PHONE,
  guest_name: "Ana",
  appointment_type: "readjustment",
  starts_at: "2026-11-10T06:00:00Z",
  status: "confirmed",
  offered_slots: null,
  last_outbound_at: "2026-11-02T01:00:00Z",
};

let seq = 0;
const inbound = (body: string) =>
  new Request("https://x.test/api/webhooks/whatsapp", {
    method: "POST",
    body: JSON.stringify({
      entry: [{ changes: [{ value: { messages: [{ id: `wamid.${++seq}`, from: "6591234567", type: "text", text: { body } }] } }] }],
    }),
  });

const outcomes = () => m.recordInboundOutcome.mock.calls.map((c) => c[1]);

beforeEach(() => {
  delete process.env.WHATSAPP_APP_SECRET;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  for (const fn of Object.values(m)) fn.mockReset();
  m.claimInboundMessage.mockResolvedValue(true);
  m.recordInboundOutcome.mockResolvedValue(undefined);
  m.claimAutoReply.mockResolvedValue(true);
  m.sendText.mockResolvedValue("wamid.out");
  m.getOpenReminderByPhone.mockResolvedValue(reminder);
  m.cancelAppointment.mockResolvedValue({ kind: "cancelled" });
  m.latestAftercareSentAt.mockResolvedValue(null);
  m.recordDeliveryFailure.mockResolvedValue(0);
  m.recordAftercareDeliveryFailure.mockResolvedValue(0);
  m.visitDayFeeByEvent.mockResolvedValue(null);
  m.getEventTiming.mockResolvedValue({ startsAt: reminder.starts_at, updatedAt: null });
});

describe("a STOP reply", () => {
  it("gets the stop reply every time, with no cooldown, and is recorded as kind stop", async () => {
    for (const word of ["STOP", "stop", "Unsubscribe"]) await POST(inbound(word));

    expect(m.sendText.mock.calls).toEqual([
      [PHONE, guestText.stopReply()],
      [PHONE, guestText.stopReply()],
      [PHONE, guestText.stopReply()],
    ]);
    expect(m.claimAutoReply).not.toHaveBeenCalled();
    expect(m.claimInboundMessage.mock.calls.map((c) => c[2])).toEqual(["stop", "stop", "stop"]);
    expect(outcomes()).toEqual(["stop: replied", "stop: replied", "stop: replied"]);
  });

  it("leaves an open appointment reminder for that number exactly as it was", async () => {
    await POST(inbound("stop"));
    expect(m.getOpenReminderByPhone).not.toHaveBeenCalled();
    expect(m.updateReminder).not.toHaveBeenCalled();
    expect(m.cancelAppointment).not.toHaveBeenCalled();
  });
});

describe("a bare cancel", () => {
  it("asks a question and cancels nothing right after an aftercare message", async () => {
    m.latestAftercareSentAt.mockResolvedValue("2026-11-03T01:00:00Z");
    await POST(inbound("cancel"));

    expect(m.cancelAppointment).not.toHaveBeenCalled();
    expect(m.updateReminder).not.toHaveBeenCalled();
    expect(m.sendText).toHaveBeenCalledWith(PHONE, guestText.cancelQuestion(reminder.starts_at));
    expect(outcomes()).toEqual(["cancel: asked first (aftercare since the reminder)"]);
  });

  it("cancels, as today, with no aftercare send since the last reminder", async () => {
    m.latestAftercareSentAt.mockResolvedValue("2026-11-01T01:00:00Z");
    await POST(inbound("Cancel please"));
    expect(m.cancelAppointment).toHaveBeenCalledWith(reminder, expect.anything(), {
      cause: "guest",
      within24h: true,
      now: expect.any(Date),
      startsAt: reminder.starts_at,
    });
    expect(outcomes()).toEqual(["cancelled"]);
  });

  it("cancels, as today, when the number never had an aftercare message", async () => {
    await POST(inbound("cancel"));
    expect(m.cancelAppointment).toHaveBeenCalledTimes(1);
  });

  it("asks rather than cancels when the aftercare lookup fails", async () => {
    m.latestAftercareSentAt.mockRejectedValue(new Error("db down"));
    await POST(inbound("cancel"));
    expect(m.cancelAppointment).not.toHaveBeenCalled();
    expect(m.sendText).toHaveBeenCalledWith(PHONE, guestText.cancelQuestion(reminder.starts_at));
  });
});

describe("a cancel that names the appointment", () => {
  it.each(["cancel appointment", "cancel booking"])("%j cancels at once, even right after aftercare", async (word) => {
    m.latestAftercareSentAt.mockResolvedValue("2026-11-03T01:00:00Z");
    await POST(inbound(word));
    expect(m.cancelAppointment).toHaveBeenCalledTimes(1);
    expect(m.latestAftercareSentAt).not.toHaveBeenCalled();
  });
});

describe("a cancel on the visit day of a paid re-adjustment", () => {
  const FEE = { amount: 32.7, currency: "SGD", orderNumber: "1077" };
  const LIVE_START = "2026-11-10T08:00:00Z";

  beforeEach(() => {
    m.getEventTiming.mockResolvedValue({ startsAt: LIVE_START, updatedAt: null });
    m.visitDayFeeByEvent.mockResolvedValue(FEE);
  });

  it.each(["cancel", "cancel appointment", "cancel booking"])(
    "%j warns that the fee is refunded by hand only, and cancels nothing",
    async (word) => {
      await POST(inbound(word));
      expect(m.cancelAppointment).not.toHaveBeenCalled();
      expect(m.sendText.mock.calls).toEqual([[PHONE, guestText.visitDayCancelQuestion(LIVE_START, FEE)]]);
      expect(outcomes()).toEqual(["cancel: asked first (visit-day fee is refunded by hand only)"]);
    },
  );

  it("judges the visit-day fee by the event's live time", async () => {
    await POST(inbound("cancel"));
    expect(m.visitDayFeeByEvent).toHaveBeenCalledWith(reminder.calendar_event_id, LIVE_START, expect.any(Date));
  });

  it("warns once, not twice, right after an aftercare message", async () => {
    m.latestAftercareSentAt.mockResolvedValue("2026-11-03T01:00:00Z");
    await POST(inbound("cancel"));
    expect(m.sendText).toHaveBeenCalledTimes(1);
    expect(m.sendText).toHaveBeenCalledWith(PHONE, guestText.visitDayCancelQuestion(LIVE_START, FEE));
  });

  it('"none of these" to the new times warns too, since it cancels', async () => {
    m.getOpenReminderByPhone.mockResolvedValue({ ...reminder, status: "offering_slots" });
    await POST(inbound("none of these"));
    expect(m.cancelAppointment).not.toHaveBeenCalled();
    expect(m.sendText).toHaveBeenCalledWith(PHONE, guestText.visitDayCancelQuestion(LIVE_START, FEE));
  });

  it('"cancel anyway" cancels, at the same live time and clock the warning used', async () => {
    await POST(inbound("cancel anyway"));
    expect(m.visitDayFeeByEvent).not.toHaveBeenCalled();
    expect(m.cancelAppointment).toHaveBeenCalledWith(reminder, expect.anything(), {
      cause: "guest",
      within24h: true,
      now: expect.any(Date),
      startsAt: LIVE_START,
    });
    expect(outcomes()).toEqual(["cancelled"]);
  });

  it("cancels at once when no fee would be kept (free visit, day before, already refunded)", async () => {
    m.visitDayFeeByEvent.mockResolvedValue(null);
    await POST(inbound("cancel appointment"));
    expect(m.cancelAppointment).toHaveBeenCalledTimes(1);
    expect(m.sendText).not.toHaveBeenCalled();
  });

  it("cancels nothing and says so when the fee can't be checked", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    m.visitDayFeeByEvent.mockRejectedValue(new Error("db down"));
    await POST(inbound("cancel appointment"));
    err.mockRestore();
    expect(m.cancelAppointment).not.toHaveBeenCalled();
    expect(m.sendText).toHaveBeenCalledWith(PHONE, guestText.cancelFailed());
  });

  it("names the time, the amount and the reply that cancels", () => {
    const text = guestText.visitDayCancelQuestion(LIVE_START, FEE);
    expect(text).toContain("today at 16:00");
    expect(text).toContain("SGD 32.70");
    expect(text).toContain("refunded manually only");
    expect(text).toContain('Reply "cancel anyway"');
  });
});

describe("anything else", () => {
  it("gets the reworded auto-reply, at most once per 12 hours", async () => {
    await POST(inbound("hello?"));
    expect(m.sendText).toHaveBeenCalledWith(PHONE, guestText.autoReply());
    expect(guestText.autoReply()).toContain("automated messages from Mpillow");
    expect(m.claimAutoReply).toHaveBeenCalledWith(PHONE, 12 * 60 * 60 * 1000);
  });
});

describe("a late delivery failure", () => {
  it("is recorded on the reminders and on the aftercare ledger", async () => {
    const reason = "WhatsApp delivery failed (131050): marketing messages off";
    await POST(
      new Request("https://x.test/api/webhooks/whatsapp", {
        method: "POST",
        body: JSON.stringify({
          entry: [
            {
              changes: [
                {
                  value: {
                    statuses: [
                      {
                        id: "wamid.after",
                        status: "failed",
                        recipient_id: "6591234567",
                        errors: [{ code: 131050, error_data: { details: "marketing messages off" } }],
                      },
                    ],
                  },
                },
              ],
            },
          ],
        }),
      }),
    );
    expect(m.recordDeliveryFailure).toHaveBeenCalledWith("wamid.after", reason);
    expect(m.recordAftercareDeliveryFailure).toHaveBeenCalledWith("wamid.after", reason);
  });
});
