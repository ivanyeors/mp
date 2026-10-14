import { describe, it, expect, vi } from "vitest";
import { POST } from "@/app/api/appointments/book/route";

// The bookable guard runs right after the location lookup, before any
// supabase / calendar I/O, so only the location lookup needs stubbing.
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
      : null,
  ),
}));

// email is now required: zod parse runs before any I/O, so a bad/missing email
// short-circuits to 400 without touching supabase/calendar/location.
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
