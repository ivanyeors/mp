import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/appointments/slots/route";
import { sgtLocalToUtcMs } from "@/lib/appointments/slots";

const h = vi.hoisted(() => ({
  freeBusy: vi.fn<(fromIso: string, toIso: string) => Promise<{ startMs: number; endMs: number }[]>>(),
}));

vi.mock("@/lib/appointments/calendar", () => ({ freeBusy: h.freeBusy }));
vi.mock("@/lib/appointments/book-slot", () => ({ liveSlotHolds: async () => [] }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from: () => ({ select: () => ({ in: async () => ({ data: [], error: null }) }) }),
  }),
}));

function get(query: string): Promise<Response> {
  return GET(new Request(`http://test/api/appointments/slots?${query}`));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(sgtLocalToUtcMs(2026, 11, 24, 9, 0)));
  h.freeBusy.mockReset();
  h.freeBusy.mockResolvedValue([
    { startMs: sgtLocalToUtcMs(2026, 11, 25, 0, 0), endMs: sgtLocalToUtcMs(2026, 11, 26, 0, 0) },
  ]);
});
afterEach(() => vi.useRealTimers());

describe("GET /api/appointments/slots?month=", () => {
  it("returns the month's days that still have a free time, leaving out a fully booked day", async () => {
    const res = await get("month=2026-11");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.days.map((d: { date: string }) => d.date)).toEqual([
      "2026-11-24",
      "2026-11-26",
      "2026-11-27",
      "2026-11-28",
      "2026-11-29",
    ]);
  });

  it("asks the calendar about the whole month, Singapore time", async () => {
    await get("month=2026-11");
    expect(h.freeBusy).toHaveBeenCalledWith("2026-10-31T16:00:00.000Z", "2026-11-30T16:00:00.000Z");
  });

  it("refuses a month that does not exist", async () => {
    expect((await get("month=2026-13")).status).toBe(400);
    expect((await get("month=2026-1")).status).toBe(400);
    expect(h.freeBusy).not.toHaveBeenCalled();
  });

  it("502s when the calendar can't be read, so the picker leaves every day open", async () => {
    h.freeBusy.mockRejectedValue(new Error("Google down"));
    expect((await get("month=2026-11")).status).toBe(502);
  });
});

describe("GET /api/appointments/slots?date=", () => {
  it("still lists one day's times", async () => {
    const body = await (await get("date=2026-11-26")).json();
    expect(body.slots).toHaveLength(9);
    expect(body.suggestions).toEqual([]);
  });
});
