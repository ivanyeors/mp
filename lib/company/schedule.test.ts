import { describe, expect, it } from "vitest";
import { nextRun, parseCron, previousRun } from "./schedule";

const at = (iso: string) => new Date(iso);

describe("nextRun", () => {
  it("finds the next weekly run in Singapore time", () => {
    expect(nextRun("CRON_TZ=Asia/Singapore 9 8 * * 3", at("2026-11-24T08:00:00Z"))?.toISOString()).toBe("2026-11-25T00:09:00.000Z");
  });

  it("skips today's slot once it has passed", () => {
    expect(nextRun("CRON_TZ=Asia/Singapore 9 8 * * 3", at("2026-11-25T00:10:00Z"))?.toISOString()).toBe("2026-12-02T00:09:00.000Z");
  });

  it("handles day-of-month lists and quarterly months", () => {
    expect(nextRun("CRON_TZ=Asia/Singapore 23 10 1,15 * *", at("2026-11-24T08:00:00Z"))?.toISOString()).toBe("2026-12-01T02:23:00.000Z");
    expect(nextRun("CRON_TZ=Asia/Singapore 17 9 10 1,4,7,10 *", at("2026-11-24T08:00:00Z"))?.toISOString()).toBe("2027-01-10T01:17:00.000Z");
  });

  it("rolls over midnight in Singapore, not UTC", () => {
    expect(nextRun("CRON_TZ=Asia/Singapore 30 0 * * *", at("2026-11-24T15:00:00Z"))?.toISOString()).toBe("2026-11-24T16:30:00.000Z");
  });

  it("refuses schedules it cannot read rather than guessing", () => {
    expect(() => parseCron("CRON_TZ=America/Los_Angeles 0 9 * * 1")).toThrow();
    expect(() => parseCron("*/5 * * * *")).toThrow();
    expect(() => parseCron("0 9 * *")).toThrow();
  });

  it("finds the run just before a moment, for spotting a missed run", () => {
    expect(previousRun("CRON_TZ=Asia/Singapore 47 8 * * 2", at("2026-11-24T08:00:00Z"))?.toISOString()).toBe("2026-11-24T00:47:00.000Z");
    expect(previousRun("CRON_TZ=Asia/Singapore 47 8 * * 2", at("2026-11-24T00:46:00Z"))?.toISOString()).toBe("2026-11-17T00:47:00.000Z");
    expect(previousRun("CRON_TZ=Asia/Singapore 17 9 10 1,4,7,10 *", at("2026-11-24T08:00:00Z"))?.toISOString()).toBe("2026-10-10T01:17:00.000Z");
  });
});
