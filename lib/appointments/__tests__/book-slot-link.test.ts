import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ createEvent: vi.fn(async () => "ev-1") }));

vi.mock("@/lib/appointments/calendar", () => ({ createEvent: h.createEvent, freeBusy: vi.fn() }));
vi.mock("@/lib/appointments/contacts", () => ({ syncGuestContact: vi.fn(async () => "created") }));
vi.mock("@/lib/appointments/reminders-db", () => ({ upsertPendingReminder: vi.fn(async () => ({})) }));
vi.mock("@/lib/appointments/remind", () => ({ sendDayBeforeReminder: vi.fn(), sendMorningOfReminder: vi.fn() }));
vi.mock("@/lib/appointments/whatsapp", () => ({ sendTemplateMessage: vi.fn() }));
vi.mock("@/lib/site-url", () => ({ getSiteOrigin: () => "https://mpillow.test" }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));

const { bookCalendarSlot } = await import("@/lib/appointments/book-slot");
const { DEFAULT_APPOINTMENT_SETTINGS } = await import("@/lib/appointments/settings");

describe("bookCalendarSlot", () => {
  it("puts a link to change the booking in the calendar invite", async () => {
    await bookCalendarSlot({
      startIso: "2026-11-28T02:00:00.000Z",
      endIso: "2026-11-28T03:00:00.000Z",
      location: { id: "loc-1", address: "1 Studio Rd" },
      guestName: "Ada Tan",
      phone: "+6591234567",
      email: "ada@example.com",
      appointmentType: "customisation",
      settings: { ...DEFAULT_APPOINTMENT_SETTINGS, whatsappEnabled: false },
      notes: ["Language: English"],
    });
    const guest = (h.createEvent.mock.calls[0] as unknown as [{ notes: string[] }])[0];
    expect(guest.notes).toEqual(["Language: English", "", "Change your booking: https://mpillow.test/account/bookings"]);
  });
});
