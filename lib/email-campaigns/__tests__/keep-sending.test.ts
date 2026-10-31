import { describe, expect, it } from "vitest";
import {
  KEEP_SENDING_DEFAULT_CAP,
  KEEP_SENDING_OFF,
  approvedSegmentsRow,
  campaignSegmentIds,
  isKeptWave,
  keepSendingBlocker,
  keepSendingFromRow,
  keepSendingStatus,
  keptToday,
  keptWaveLabel,
  keptWaveSize,
  parseDailyCap,
  segmentChange,
  singaporeDate,
  stableJson,
  waveName,
  type LiveSegment,
} from "../keep-sending";
import { nextWaveLabel } from "../rules";

/** Kept sending, the pure parts (PRD-campaign-audiences slice 10). */

const SEG = "11111111-0000-4000-8000-000000000001";
const OUT = "11111111-0000-4000-8000-000000000002";
const live = (over: Partial<LiveSegment> = {}): LiveSegment => ({
  name: "Delivered over 60 days",
  filters: { delivered: "over:60", not_bought: ["mbolster"] },
  filtersVersion: 3,
  archivedAt: null,
  ...over,
});

describe("the stored state", () => {
  it("reads absent columns as off, with the default cap", () => {
    expect(keepSendingFromRow({})).toEqual(KEEP_SENDING_OFF);
    expect(KEEP_SENDING_OFF.dailyCap).toBe(KEEP_SENDING_DEFAULT_CAP);
  });

  it("reads the columns, and the approved Segments by id", () => {
    const k = keepSendingFromRow({
      keep_sending: true,
      keep_sending_daily_cap: 12,
      keep_sending_paused_at: "2026-11-01T02:00:00Z",
      keep_sending_paused_reason: "its Segment changed",
      keep_sending_segments: { [SEG]: { filters: { delivered: "over:60" }, filters_version: 3 }, bad: "x" },
    });
    expect(k).toEqual({
      on: true,
      dailyCap: 12,
      pausedAt: "2026-11-01T02:00:00Z",
      pausedReason: "its Segment changed",
      segments: { [SEG]: { filters: { delivered: "over:60" }, filtersVersion: 3 } },
      holdoutAt: null,
    });
    // What a save stores reads back the same.
    expect(keepSendingFromRow({ keep_sending_segments: approvedSegmentsRow(k.segments) }).segments).toEqual(k.segments);
    expect(approvedSegmentsRow({})).toBeNull();
  });

  it("reads the holdout only while it keeps sending (slice 11)", () => {
    expect(keepSendingFromRow({ keep_sending: true, holdout_at: "2026-11-01T02:00:00Z" }).holdoutAt).toBe("2026-11-01T02:00:00Z");
    expect(keepSendingFromRow({ keep_sending: false, holdout_at: "2026-11-01T02:00:00Z" }).holdoutAt).toBeNull();
  });

  it("takes a cap of 1 to 100, whole", () => {
    expect([parseDailyCap(1), parseDailyCap("20"), parseDailyCap(100)]).toEqual([1, 20, 100]);
    for (const bad of [0, 101, 2.5, "", "ten", null, undefined]) expect(parseDailyCap(bad)).toBeNull();
    // A cap out of range on the row reads as the default rather than break the page.
    expect(keepSendingFromRow({ keep_sending: true, keep_sending_daily_cap: 500 }).dailyCap).toBe(KEEP_SENDING_DEFAULT_CAP);
  });

  it("says what the list and the card show", () => {
    expect(keepSendingStatus(undefined)).toBeNull();
    expect(keepSendingStatus(KEEP_SENDING_OFF)).toBeNull();
    expect(keepSendingStatus({ ...KEEP_SENDING_OFF, on: true })).toEqual({ label: "Keeps sending", tone: "on" });
    expect(keepSendingStatus({ ...KEEP_SENDING_OFF, on: true, pausedAt: "2026-11-01T02:00:00Z" })).toEqual({ label: "Paused", tone: "paused" });
  });
});

describe("only a campaign a person sent can keep sending", () => {
  it("needs the first wave to have reached someone", () => {
    expect(keepSendingBlocker({ lockedAt: null, archivedAt: null }, 0)).toMatch(/^Send a first wave/);
    expect(keepSendingBlocker({ lockedAt: "2026-10-30T00:00:00Z", archivedAt: null }, 0)).toMatch(/^Send a first wave/);
    expect(keepSendingBlocker({ lockedAt: "2026-10-30T00:00:00Z", archivedAt: null }, 1)).toBeNull();
    expect(keepSendingBlocker({ lockedAt: "2026-10-30T00:00:00Z", archivedAt: "2026-10-31T00:00:00Z" }, 9)).toMatch(/archived/);
  });
});

describe("the Audience a person approved", () => {
  const approved = { [SEG]: { filters: { not_bought: ["mbolster"], delivered: "over:60" }, filtersVersion: 3 } };

  it("is the Segment it is sent to, then those it leaves out", () => {
    expect(campaignSegmentIds({ segmentId: SEG, excludeSegmentIds: [OUT] })).toEqual([SEG, OUT]);
    expect(campaignSegmentIds({ segmentId: null, excludeSegmentIds: [] })).toEqual([]);
  });

  it("is unchanged when the filters are the same, in any key order", () => {
    expect(stableJson({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: null } })).toBe('{"a":{"c":null,"d":[1,{"x":1,"y":2}]},"b":1}');
    expect(segmentChange([SEG], approved, new Map([[SEG, live()]]))).toBeNull();
    expect(segmentChange([], {}, new Map())).toBeNull();
  });

  it("has changed when a filter, the schema, or a left-out Segment did", () => {
    expect(segmentChange([SEG], approved, new Map([[SEG, live({ filters: { delivered: "over:30", not_bought: ["mbolster"] } })]]))).toBe(
      "its Segment “Delivered over 60 days” changed since keep sending was turned on",
    );
    expect(segmentChange([SEG], approved, new Map([[SEG, live({ filtersVersion: 4 })]]))).toMatch(/changed since/);
    // A Segment it leaves out that nobody approved (or that changed) widens the Audience as surely.
    expect(segmentChange([SEG, OUT], approved, new Map([[SEG, live()], [OUT, live({ name: "Bought last month" })]]))).toBe(
      "its Segment “Bought last month” changed since keep sending was turned on",
    );
  });

  it("is gone when a Segment was archived or deleted", () => {
    expect(segmentChange([SEG], approved, new Map([[SEG, live({ archivedAt: "2026-11-01T00:00:00Z" })]]))).toBe(
      "its Segment “Delivered over 60 days” was archived",
    );
    expect(segmentChange([SEG], approved, new Map([[SEG, null]]))).toBe("a Segment it reads no longer exists");
  });
});

describe("the day's Wave", () => {
  it("is named for Singapore's date", () => {
    expect(singaporeDate(new Date("2026-10-31T15:59:00Z"))).toBe("2026-10-31");
    expect(singaporeDate(new Date("2026-10-31T16:00:00Z"))).toBe("2026-11-01");
    expect(keptWaveLabel(new Date("2026-11-01T02:00:00Z"))).toBe("daily-2026-11-01");
    expect(isKeptWave("daily-2026-11-01")).toBe(true);
    expect(isKeptWave("w2")).toBe(false);
    expect(waveName("daily-2026-11-01")).toBe("Daily, 1 Nov");
    expect(waveName("w2")).toBe("w2");
  });

  it("is not counted among a person's numbered waves", () => {
    expect(nextWaveLabel(["w1", "daily-2026-11-01", "daily-2026-11-02"])).toBe("w2");
  });

  it("never passes the cap, counting what today's Wave claimed, nor the reserve", () => {
    expect(keptWaveSize({ cap: 20, claimedToday: 0, remaining: 100 })).toEqual({ size: 20, limit: null });
    expect(keptWaveSize({ cap: 20, claimedToday: 15, remaining: 100 })).toEqual({ size: 5, limit: null });
    expect(keptWaveSize({ cap: 20, claimedToday: 20, remaining: 100 })).toEqual({ size: 0, limit: "cap" });
    expect(keptWaveSize({ cap: 20, claimedToday: 0, remaining: 34 })).toEqual({ size: 4, limit: null });
    expect(keptWaveSize({ cap: 20, claimedToday: 0, remaining: 30 })).toEqual({ size: 0, limit: "room" });
    expect(keptWaveSize({ cap: 20, claimedToday: 0, remaining: 12, reserve: 10 })).toEqual({ size: 2, limit: null });
  });

  it("counts today's kept-sending emails across campaigns", () => {
    const at = new Date("2026-11-01T05:00:00Z");
    expect(
      keptToday(
        [
          { wave: "daily-2026-11-01", handed: 3 },
          { wave: "daily-2026-11-01", handed: 2 },
          { wave: "daily-2026-10-31", handed: 9 },
          { wave: "w1", handed: 40 },
        ],
        at,
      ),
    ).toBe(5);
  });
});
