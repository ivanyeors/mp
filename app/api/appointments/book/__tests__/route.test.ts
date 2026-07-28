import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/appointments/book/route";

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
