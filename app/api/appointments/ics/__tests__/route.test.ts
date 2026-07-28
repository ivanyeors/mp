import { describe, expect, it } from "vitest";
import { GET } from "../route";

function call(qs: string): Response {
  return GET(new Request(`http://localhost/api/appointments/ics?${qs}`)) as Response;
}

describe("GET /api/appointments/ics", () => {
  it("400s when start/end are missing", () => {
    expect(call("summary=Hi").status).toBe(400);
  });

  it("400s when start/end lack an offset/Z (naive datetime would corrupt the time)", () => {
    const res = call("start=2026-07-27T14:30:00&end=2026-07-27T15:30:00");
    expect(res.status).toBe(400);
  });

  it("serves text/calendar for offset-bearing start/end", async () => {
    const res = call(
      "start=2026-07-27T14:30:00%2B08:00&end=2026-07-27T15:30:00%2B08:00&summary=Mpillow",
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/calendar");
    expect(res.headers.get("content-disposition")).toContain("appointment.ics");
    const body = await res.text();
    expect(body).toContain("BEGIN:VEVENT");
    expect(body).toContain("DTSTART:20260727T063000Z"); // 14:30 SGT → 06:30 UTC
  });

  it("accepts Z-suffixed datetimes (the format slots.ts emits)", () => {
    expect(call("start=2026-07-27T06:30:00.000Z&end=2026-07-27T07:30:00.000Z").status).toBe(200);
  });
});
