import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));
vi.mock("@/lib/appointments/google-auth", () => ({ getGoogleAccessToken: vi.fn(async () => "t") }));

const { withoutInterval } = await import("@/lib/appointments/book-slot");

const own = { startMs: 100, endMs: 200 };

describe("withoutInterval", () => {
  it("drops the visit's own slot from the busy times", () => {
    expect(withoutInterval([{ startMs: 100, endMs: 200 }], own)).toEqual([]);
  });

  it("keeps a neighbour that Google merged into the same busy block", () => {
    expect(withoutInterval([{ startMs: 100, endMs: 300 }], own)).toEqual([{ startMs: 200, endMs: 300 }]);
    expect(withoutInterval([{ startMs: 0, endMs: 300 }], own)).toEqual([
      { startMs: 0, endMs: 100 },
      { startMs: 200, endMs: 300 },
    ]);
  });

  it("leaves busy times that don't touch the visit alone", () => {
    const other = [
      { startMs: 0, endMs: 100 },
      { startMs: 200, endMs: 260 },
    ];
    expect(withoutInterval(other, own)).toEqual(other);
  });
});
