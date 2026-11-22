import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  log: [] as string[],
  mark: vi.fn(),
  deleteEvent: vi.fn(),
  timing: vi.fn(),
  updateReminder: vi.fn(async () => true),
}));

vi.mock("@/lib/readjustment/lifecycle", () => ({ markReadjustmentCancelledByEvent: h.mark }));
vi.mock("@/lib/appointments/calendar", () => ({ deleteEvent: h.deleteEvent, getEventTiming: h.timing }));
vi.mock("@/lib/appointments/phone", () => ({ isPhoneAllowed: () => false }));
vi.mock("@/lib/appointments/reminders-db", () => ({
  getReminderByEventId: vi.fn(),
  lastInboundAt: vi.fn(),
  updateReminder: h.updateReminder,
}));
vi.mock("@/lib/appointments/remind", () => ({ sendOrRecord: vi.fn() }));
vi.mock("@/lib/appointments/whatsapp", () => ({ sendCancelMessage: vi.fn(), withinServiceWindow: () => true }));

const { cancelAppointment } = await import("@/lib/appointments/cancel");

const NOW = new Date("2026-11-24T03:00:00.000Z");
const BOOKED = "2026-11-25T02:00:00.000Z";

const row = (extra: Record<string, unknown> = {}) =>
  ({
    calendar_event_id: "ev-1",
    phone: "+6591234567",
    guest_name: "Ada",
    appointment_type: "readjustment",
    starts_at: BOOKED,
    status: "pending",
    offered_slots: null,
    ...extra,
  }) as never;

const settings = { whatsappEnabled: false } as never;

beforeEach(() => {
  h.log.length = 0;
  h.mark.mockReset();
  h.mark.mockImplementation(async () => void h.log.push("mark"));
  h.deleteEvent.mockReset();
  h.deleteEvent.mockImplementation(async () => void h.log.push("delete"));
  h.timing.mockReset();
  h.timing.mockResolvedValue({ startsAt: BOOKED, updatedAt: "2026-11-24T01:00:00.000Z" });
  h.updateReminder.mockClear();
});

describe("cancelAppointment and the re-adjustment refund", () => {
  it("counts a WhatsApp cancel and a declined invite as the customer's, and a removed event as Staff's", async () => {
    await cancelAppointment(row(), settings, { cause: "guest", now: NOW });
    await cancelAppointment(row(), settings, { cause: "declined", now: NOW });
    await cancelAppointment(row(), settings, { cause: "removed", now: NOW });
    expect(h.mark.mock.calls.map((c) => c[1])).toEqual(["customer", "customer", "staff"]);
  });

  it("cancels the booking before deleting the event, so a calendar push can't claim it as a Staff cancel", async () => {
    await cancelAppointment(row(), settings, { cause: "guest", now: NOW });
    expect(h.log).toEqual(["mark", "delete"]);
  });

  it("leaves the event and the reminder alone when the booking can't be cancelled, so it is retried", async () => {
    h.mark.mockRejectedValue(new Error("connection reset"));
    await expect(cancelAppointment(row(), settings, { cause: "guest", now: NOW })).rejects.toThrow("connection reset");
    expect(h.deleteEvent).not.toHaveBeenCalled();
    expect(h.updateReminder).not.toHaveBeenCalled();
  });

  it("uses the event's live start, so a visit Staff moved later can still be cancelled and refunded", async () => {
    h.timing.mockResolvedValue({ startsAt: "2026-11-28T02:00:00.000Z", updatedAt: null });
    const afterBookedTime = new Date("2026-11-26T03:00:00.000Z");
    const out = await cancelAppointment(row(), settings, { cause: "guest", now: afterBookedTime });
    expect(out.kind).toBe("cancelled");
    expect(h.mark.mock.calls[0][2]).toMatchObject({ startsAt: "2026-11-28T02:00:00.000Z" });
  });

  it("dates a declined invite by the event's last update, and a WhatsApp cancel by now", async () => {
    await cancelAppointment(row(), settings, { cause: "declined", now: NOW });
    expect(h.mark.mock.calls[0][2].cancelledAt).toEqual(new Date("2026-11-24T01:00:00.000Z"));
    await cancelAppointment(row(), settings, { cause: "guest", now: NOW });
    expect(h.mark.mock.calls[1][2].cancelledAt).toEqual(NOW);
  });

  it("falls back to the stored time when Google can't be read", async () => {
    h.timing.mockRejectedValue(new Error("google down"));
    await cancelAppointment(row(), settings, { cause: "declined", now: NOW });
    expect(h.mark.mock.calls[0][2]).toMatchObject({ startsAt: BOOKED, cancelledAt: NOW });
  });
});
