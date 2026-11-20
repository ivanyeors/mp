import { describe, expect, it, vi } from "vitest";
import { aiWritingLimited, aiWritingLimitMessage, aiWritingRetryAt } from "@/lib/ai/limits";
import { AI_WRITING_DEFAULTS } from "@/lib/ai/writing-settings";
import type { RateLimitOptions } from "@/lib/rate-limit";

const NOW = new Date("2026-10-29T08:03:00Z");

describe("aiWritingRetryAt", () => {
  it("is the end of the fixed window now falls in", () => {
    expect(aiWritingRetryAt(10 * 60_000, NOW).toISOString()).toBe("2026-10-29T08:10:00.000Z");
    expect(aiWritingRetryAt(24 * 3_600_000, NOW).toISOString()).toBe("2026-10-30T00:00:00.000Z");
  });
});

describe("aiWritingLimitMessage", () => {
  it("names the time in Singapore, and tomorrow when it is", () => {
    expect(aiWritingLimitMessage(new Date("2026-10-29T08:10:00Z"), NOW)).toBe("You've drafted a lot today. Try again after 4:10 pm.");
    expect(aiWritingLimitMessage(new Date("2026-10-30T00:00:00Z"), NOW)).toBe("You've drafted a lot today. Try again after 8:00 am tomorrow.");
    expect(aiWritingLimitMessage(new Date("2026-10-30T00:00:00Z"), new Date("2026-10-29T22:30:00Z"))).toBe(
      "You've drafted a lot today. Try again after 8:00 am.",
    );
  });
});

describe("aiWritingLimited", () => {
  it("counts the call against both allowances, at the settings' limits", async () => {
    const exceeded = vi.fn(async (o: RateLimitOptions) => o.max < 0);
    expect(await aiWritingLimited({ limit10min: 4, limitDay: 30 }, "member-1", { now: NOW, exceeded })).toBeNull();
    expect(exceeded.mock.calls.map(([o]) => [o.bucket, o.key, o.max])).toEqual([
      ["ai-writing-10min", "member-1", 4],
      ["ai-writing-day", "member-1", 30],
    ]);
  });

  it("past the 10-minute limit, refuses with the time it can run again", async () => {
    const exceeded = async (o: RateLimitOptions) => o.bucket === "ai-writing-10min";
    expect(await aiWritingLimited(AI_WRITING_DEFAULTS, "member-1", { now: NOW, exceeded })).toBe(
      "You've drafted a lot today. Try again after 4:10 pm.",
    );
  });

  it("with the day used up, waits for the day", async () => {
    const exceeded = async () => true;
    expect(await aiWritingLimited(AI_WRITING_DEFAULTS, "member-1", { now: NOW, exceeded })).toBe(
      "You've drafted a lot today. Try again after 8:00 am tomorrow.",
    );
  });

  it("takes a lower limit at the very next call", async () => {
    let count = 12;
    const exceeded = async (o: RateLimitOptions) => ++count > o.max;
    expect(await aiWritingLimited({ limit10min: 50, limitDay: 500 }, "m", { now: NOW, exceeded })).toBeNull();
    count = 12;
    expect(await aiWritingLimited({ limit10min: 10, limitDay: 500 }, "m", { now: NOW, exceeded })).toMatch(/^You've drafted a lot today/);
  });
});
