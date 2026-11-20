import { describe, it, expect, vi } from "vitest";
import { POST } from "@/app/api/appointments/book/route";

const h = vi.hoisted(() => ({ bookCalendarSlot: vi.fn(async () => ({ eventId: "evt-1", contact: "created" })) }));

vi.mock("@/lib/locations", () => ({
  getLocation: vi.fn(async (id: string) =>
    id === "loc-off"
      ? {
          id,
          name: "Closed Clinic",
          type: "partner",
          address: "3 Off St",
          postalCode: null,
          visible: true,
          bookable: false,
        }
      : id === "loc-1"
        ? { id, name: "Studio", type: "own", address: "1 Road", postalCode: null, visible: false, bookable: true }
        : null,
  ),
}));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    rpc: async () => ({ data: false, error: null }),
    from: () => ({ select: () => ({ in: async () => ({ data: [], error: null }) }) }),
  }),
}));
vi.mock("@/lib/appointments/slots", async (orig) => ({
  ...(await orig<typeof import("@/lib/appointments/slots")>()),
  isOfferableSlot: () => true,
}));
vi.mock("@/lib/appointments/book-slot", () => ({
  isSlotFree: vi.fn(async () => true),
  bookCalendarSlot: h.bookCalendarSlot,
}));

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://test/api/appointments/book", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

const valid = {
  location_id: "loc-1",
  start_iso: "2026-07-08T02:00:00.000Z",
  end_iso: "2026-07-08T03:00:00.000Z",
  guest_name: "Jane",
  phone: "+6587805311",
  email: "jane@example.com",
};

describe("POST /api/appointments/book — email required", () => {
  it("400s when email is missing", async () => {
    const { email: _omit, ...noEmail } = valid;
    expect((await post(noEmail)).status).toBe(400);
  });

  it("400s when email is invalid", async () => {
    expect((await post({ ...valid, email: "not-an-email" })).status).toBe(400);
  });
});

describe("POST /api/appointments/book — bookable guard", () => {
  it("409s when the location has been switched off for bookings", async () => {
    const res = await post({ ...valid, location_id: "loc-off" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/not taking bookings/);
  });

  it("404s an unknown location", async () => {
    expect((await post({ ...valid, location_id: "nope" })).status).toBe(404);
  });
});

describe("POST /api/appointments/book — re-adjustments need Sign in (ADR 0024)", () => {
  it("refuses an anonymous re-adjustment before touching the calendar", async () => {
    const res = await post({ ...valid, appointment_type: "readjustment" });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("readjustment_requires_sign_in");
  });
});

describe("POST /api/appointments/book — language preference", () => {
  it("puts the guest's language preference on the event for Staff", async () => {
    h.bookCalendarSlot.mockClear();
    expect((await post({ ...valid, language_preference: "mandarin" })).status).toBe(200);
    expect(h.bookCalendarSlot).toHaveBeenCalledWith(
      expect.objectContaining({ notes: ["Language preference: Mandarin"] }),
    );
  });

  it("adds no line when there is no preference", async () => {
    h.bookCalendarSlot.mockClear();
    expect((await post(valid)).status).toBe(200);
    expect(h.bookCalendarSlot).toHaveBeenCalledWith(expect.objectContaining({ notes: [] }));
  });

  it("400s a language outside the list", async () => {
    expect((await post({ ...valid, language_preference: "klingon" })).status).toBe(400);
  });
});
