import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimits } from "@/lib/rate-limit";

const h = vi.hoisted(() => ({
  isSlotFree: vi.fn(),
  bookCalendarSlot: vi.fn(),
  recordBoxConsentByEmail: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from: () => ({ select: () => ({ in: async () => ({ data: [], error: null }) }) }),
  }),
}));
vi.mock("@/lib/locations", () => ({
  getLocation: vi.fn(async () => ({ id: "loc-1", name: "Studio", address: "1 Road", bookable: true })),
}));
vi.mock("@/lib/appointments/slots", () => ({ isOfferableSlot: () => true }));
vi.mock("@/lib/appointments/book-slot", () => ({
  isSlotFree: h.isSlotFree,
  bookCalendarSlot: h.bookCalendarSlot,
}));
vi.mock("@/lib/marketing-consent/consent", () => ({ recordBoxConsentByEmail: h.recordBoxConsentByEmail }));

const { POST } = await import("@/app/api/appointments/book/route");

const post = (extra: Record<string, unknown> = {}) =>
  POST(
    new Request("https://x.test/api/appointments/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location_id: "loc-1",
        start_iso: "2026-11-14T06:30:00.000Z",
        end_iso: "2026-11-14T07:30:00.000Z",
        guest_name: "Ada",
        phone: "91234567",
        email: "Ada@X.test",
        ...extra,
      }),
    }),
  );

const consent = () => h.recordBoxConsentByEmail.mock.calls.map(([, email, ticked, source]) => ({ email, ticked, source }));

beforeEach(() => {
  resetRateLimits();
  vi.clearAllMocks();
  h.isSlotFree.mockResolvedValue(true);
  h.bookCalendarSlot.mockResolvedValue({ eventId: "evt-1", contact: "created" });
  h.recordBoxConsentByEmail.mockResolvedValue(undefined);
});

describe("POST /api/appointments/book — the marketing email box", () => {
  it("ticked: records it for the email given, as appointment, once the visit is booked", async () => {
    const res = await post({ marketing_email: true });
    expect(res.status).toBe(200);
    expect(consent()).toEqual([{ email: "Ada@X.test", ticked: true, source: "appointment" }]);
    expect(h.bookCalendarSlot.mock.invocationCallOrder[0]).toBeLessThan(h.recordBoxConsentByEmail.mock.invocationCallOrder[0]);
  });

  it("unticked, or absent as from a tab opened before the box, is unticked", async () => {
    await post({ marketing_email: false });
    await post();
    expect(consent()).toEqual([
      { email: "Ada@X.test", ticked: false, source: "appointment" },
      { email: "Ada@X.test", ticked: false, source: "appointment" },
    ]);
  });

  it("records nothing when the visit was not booked", async () => {
    h.isSlotFree.mockResolvedValue(false);
    expect((await post({ marketing_email: true })).status).toBe(409);
    h.isSlotFree.mockResolvedValue(true);
    h.bookCalendarSlot.mockRejectedValue(new Error("calendar down"));
    expect((await post({ marketing_email: true })).status).toBe(502);
    expect(h.recordBoxConsentByEmail).not.toHaveBeenCalled();
  });

  it("reads the box only as a boolean", async () => {
    expect((await post({ marketing_email: "yes" })).status).toBe(400);
    expect(h.recordBoxConsentByEmail).not.toHaveBeenCalled();
  });
});
