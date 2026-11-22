import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/appointments/google-auth", () => ({ getGoogleAccessToken: vi.fn(async () => "test-token") }));

const { listGuestBookings, moveEvent } = await import("@/lib/appointments/calendar");

const item = (email: string, extra: Record<string, unknown> = {}) => ({
  id: `ev-${email}`,
  summary: "Guest - Customisation",
  start: { dateTime: "2026-11-28T10:00:00+08:00" },
  end: { dateTime: "2026-11-28T11:00:00+08:00" },
  attendees: [{ email: "admin@mpillow.com", self: true }, { email, responseStatus: "accepted" }],
  extendedProperties: { private: { mpLocationId: "loc-1", mpReadjustmentBookingId: "bk-1" } },
  ...extra,
});

afterEach(() => vi.unstubAllGlobals());

describe("listGuestBookings", () => {
  it("searches by the email and keeps only events whose guest is exactly that email", async () => {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(async () =>
      Response.json({ items: [item("ada@example.com"), item("ada@example.com.evil.test"), item("notada@example.com")] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const out = await listGuestBookings(" Ada@Example.com ", "2026-11-24T00:00:00Z", "2027-11-24T00:00:00Z");
    expect(out.map((b) => b.id)).toEqual(["ev-ada@example.com"]);
    expect(out[0]).toMatchObject({ locationId: "loc-1", readjustmentBookingId: "bk-1", state: "live" });
    expect(fetchMock.mock.calls[0][0]).toContain("q=ada%40example.com");
  });
});

describe("moveEvent", () => {
  it("patches the time and place, keeps the event's other private fields, and notifies the guest", async () => {
    const fetchMock = vi.fn(async () => Response.json({}));
    vi.stubGlobal("fetch", fetchMock);
    await moveEvent(
      "ev-1",
      "2026-11-27T06:00:00.000Z",
      "2026-11-27T07:00:00.000Z",
      { id: "loc-2", address: "1 Studio Rd" },
      { mpLocationId: "loc-1", mpReadjustmentBookingId: "bk-1" },
    );
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("sendUpdates=all");
    expect(JSON.parse(String(init.body))).toMatchObject({
      location: "1 Studio Rd",
      extendedProperties: { private: { mpLocationId: "loc-2", mpReadjustmentBookingId: "bk-1" } },
    });
  });
});
