import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  user: { id: "u1", email: "ada@example.com" } as { id: string; email: string } | null,
  reschedule: vi.fn(),
  limited: null as Response | null,
}));

vi.mock("@/lib/auth/user", () => ({ getAuthUser: async () => h.user }));
vi.mock("@/lib/auth/customer-identity", () => ({
  linkCustomerToAuthUser: async () => ({ id: "cust-1", email: "ada@example.com" }),
}));
vi.mock("@/lib/rate-limit", () => ({ tooManyRequests: async () => h.limited }));
vi.mock("@/lib/appointments/reschedule", () => ({ rescheduleOwnBooking: h.reschedule }));

const { POST } = await import("@/app/api/appointments/reschedule/route");

const body = { event_id: "ev-1", start_iso: "2026-11-27T06:00:00.000Z", end_iso: "2026-11-27T07:00:00.000Z", location_id: "loc-2" };
const post = (b: unknown) => POST(new Request("http://x.test", { method: "POST", body: JSON.stringify(b) }));

beforeEach(() => {
  h.user = { id: "u1", email: "ada@example.com" };
  h.limited = null;
  h.reschedule.mockReset();
  h.reschedule.mockResolvedValue({
    ok: true,
    startsAt: body.start_iso,
    endsAt: body.end_iso,
    locationName: "Mpillow Studio",
  });
});

describe("POST /api/appointments/reschedule", () => {
  it("needs a signed-in customer", async () => {
    h.user = null;
    expect((await post(body)).status).toBe(401);
    expect(h.reschedule).not.toHaveBeenCalled();
  });

  it("rejects a malformed request", async () => {
    expect((await post({ event_id: "ev-1" })).status).toBe(400);
  });

  it("moves the booking as the signed-in customer", async () => {
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(h.reschedule.mock.calls[0][1]).toEqual({ customerId: "cust-1", email: "ada@example.com" });
    expect(await res.json()).toMatchObject({ ok: true, location_name: "Mpillow Studio" });
  });

  it("explains a refusal", async () => {
    h.reschedule.mockResolvedValue({ ok: false, reason: "closed" });
    const res = await post(body);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("day before the visit");
    h.reschedule.mockResolvedValue({ ok: false, reason: "not_found" });
    expect((await post(body)).status).toBe(404);
  });
});
