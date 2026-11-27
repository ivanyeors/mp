import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { KEEP_SENDING_OFF, keptRampUntil, type KeepSending } from "../keep-sending";
import { campaignProgress, keptRunAtOrAfter, keptRunCron, nextBatchLine } from "../progress";
import { stillToSend, type CampaignCandidate, type StillToSend } from "../rules";

const KEEPS: KeepSending = { ...KEEP_SENDING_OFF, on: true, dailyCap: 100 };
const PAUSED: KeepSending = { ...KEEPS, pausedAt: "2026-11-26T03:00:00Z", pausedReason: "spam" };
const ready = (readyNow: number, resting = 0, restingUntil: string | null = null): StillToSend => ({ readyNow, resting, restingUntil });

describe("the daily run time", () => {
  it("is 10:00 in Singapore, which is 02:00 UTC", () => {
    expect(keptRunAtOrAfter(Date.parse("2026-11-26T01:59:00Z")).toISOString()).toBe("2026-11-26T02:00:00.000Z");
    expect(keptRunAtOrAfter(Date.parse("2026-11-26T02:00:00Z")).toISOString()).toBe("2026-11-26T02:00:00.000Z");
    expect(keptRunAtOrAfter(Date.parse("2026-11-26T14:17:00Z")).toISOString()).toBe("2026-11-27T02:00:00.000Z");
    expect(keptRunAtOrAfter(Date.parse("2026-11-26T20:00:00Z")).toISOString()).toBe("2026-11-27T02:00:00.000Z");
  });

  it("matches the vercel.json cron that runs kept sending", () => {
    const vercel = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as { crons: { path: string; schedule: string }[] };
    expect(vercel.crons.find((c) => c.path === "/api/cron/results-sla")?.schedule).toBe(keptRunCron());
  });
});

describe("campaignProgress", () => {
  const firstWave = [{ handed: 98, lastSentAt: "2026-11-25T04:18:22Z" }];

  it("names the 10:00 run on the second day after a first wave, whatever hour that wave went", () => {
    const now = new Date("2026-11-26T01:00:00Z");
    const p = campaignProgress({ sent: 98, left: ready(565), keepSending: KEEPS, rampUntil: keptRampUntil(firstWave, now.getTime()), dailyLimit: 100, now });
    expect(p).toMatchObject({ sent: 98, total: 663, left: 565, percent: 14 });
    expect(p.next).toEqual({ kind: "batch", at: "2026-11-27T02:00:00.000Z", upTo: 70 });
  });

  it("sends at the next 10:00 once nothing holds it", () => {
    const before = campaignProgress({ sent: 98, left: ready(565), keepSending: KEEPS, rampUntil: null, dailyLimit: 100, now: new Date("2026-11-28T01:00:00Z") });
    expect(before.next).toMatchObject({ at: "2026-11-28T02:00:00.000Z" });
    const after = campaignProgress({ sent: 168, left: ready(495), keepSending: KEEPS, rampUntil: null, dailyLimit: 100, now: new Date("2026-11-28T03:00:00Z") });
    expect(after.next).toMatchObject({ at: "2026-11-29T02:00:00.000Z" });
  });

  it("counts people resting toward the total, and waits for their rest when nobody else is left", () => {
    const p = campaignProgress({ sent: 10, left: ready(0, 5, "2026-12-01T05:00:00Z"), keepSending: KEEPS, rampUntil: null, dailyLimit: 100, now: new Date("2026-11-28T03:00:00Z") });
    expect(p).toMatchObject({ total: 15, left: 5 });
    expect(p.next).toEqual({ kind: "batch", at: "2026-12-02T02:00:00.000Z", upTo: 5 });
    const mixed = campaignProgress({ sent: 10, left: ready(3, 5, "2026-12-01T05:00:00Z"), keepSending: KEEPS, rampUntil: null, dailyLimit: 100, now: new Date("2026-11-28T03:00:00Z") });
    expect(mixed.next).toMatchObject({ at: "2026-11-29T02:00:00.000Z" });
  });

  it("sizes the batch by the cap, Resend's day less the kept share, and who is left", () => {
    const size = (cap: number, left: number, dailyLimit: number | null) => {
      const p = campaignProgress({ sent: 0, left: ready(left), keepSending: { ...KEEPS, dailyCap: cap }, rampUntil: null, dailyLimit, now: new Date("2026-11-28T03:00:00Z") });
      return p.next.kind === "batch" ? p.next.upTo : null;
    };
    expect(size(100, 565, 100)).toBe(70);
    expect(size(20, 565, 100)).toBe(20);
    expect(size(100, 12, 100)).toBe(12);
    expect(size(100, 565, null)).toBe(100);
    expect(size(100, 565, 30)).toBe(0);
  });

  it("plans no batch when paused, not keeping on, or everyone has it", () => {
    const at = new Date("2026-11-28T03:00:00Z");
    expect(campaignProgress({ sent: 98, left: ready(565), keepSending: PAUSED, rampUntil: null, dailyLimit: 100, now: at }).next).toEqual({ kind: "paused" });
    expect(campaignProgress({ sent: 98, left: ready(565), keepSending: KEEP_SENDING_OFF, rampUntil: null, dailyLimit: 100, now: at }).next).toEqual({ kind: "manual" });
    const done = campaignProgress({ sent: 98, left: ready(0), keepSending: KEEPS, rampUntil: null, dailyLimit: 100, now: at });
    expect(done).toMatchObject({ total: 98, percent: 100, next: { kind: "done", keepsSending: true } });
    expect(campaignProgress({ sent: 0, left: ready(0), keepSending: null, rampUntil: null, dailyLimit: 100, now: at })).toMatchObject({ total: 0, percent: 0 });
  });

  it("never rounds up to 100% while someone is left", () => {
    expect(campaignProgress({ sent: 999, left: ready(1), keepSending: null, rampUntil: null, dailyLimit: null, now: new Date() }).percent).toBe(99);
  });
});

describe("nextBatchLine", () => {
  it("names the day, time and size of the next batch in Singapore time", () => {
    const line = nextBatchLine({ next: { kind: "batch", at: "2026-11-28T02:00:00.000Z", upTo: 70 }, left: 565, total: 663 });
    expect(line).toMatch(/^Next batch Sat.*28 Nov.*10:00.*up\u00a0to\u00a070$/);
  });

  it("says why there is no date", () => {
    expect(nextBatchLine({ next: { kind: "paused" }, left: 5, total: 7 })).toMatch(/^Paused/);
    expect(nextBatchLine({ next: { kind: "manual" }, left: 1565, total: 2000 })).toBe("1,565 left for your next wave");
    expect(nextBatchLine({ next: { kind: "done", keepsSending: true }, left: 0, total: 98 })).toMatch(/newcomers get it at 10:00/);
    expect(nextBatchLine({ next: { kind: "done", keepsSending: false }, left: 0, total: 98 })).toBe("Everyone who can get it has it");
    expect(nextBatchLine({ next: { kind: "done", keepsSending: false }, left: 0, total: 0 })).toBe("Nobody in its audience can get it now");
    expect(nextBatchLine({ next: { kind: "batch", at: "2026-11-28T02:00:00.000Z", upTo: 0 }, left: 5, total: 7 })).toMatch(/^No room/);
  });
});

describe("stillToSend", () => {
  const now = new Date("2026-11-27T03:00:00Z");
  const cand = (customerId: string, over: Partial<CampaignCandidate> = {}): CampaignCandidate => ({
    customerId,
    email: `${customerId}@x.test`,
    firstName: null,
    marketingEmail: "subscribed",
    migrated: true,
    claimedAt: null,
    ordersCount: 0,
    since: "2026-10-10T00:00:00Z",
    suppressed: false,
    own: null,
    locale: "en-US",
    ...over,
  });
  const list = [
    cand("ready"),
    cand("sent", { own: { status: "sent", wave: "w1", sentAt: "2026-11-25T04:18:00Z" } }),
    cand("bounced", { own: { status: "bounced", wave: "w1", sentAt: "2026-11-25T04:18:00Z" }, suppressed: true }),
    cand("failed", { own: { status: "failed", wave: "w1", sentAt: "2026-11-25T04:18:00Z" } }),
    cand("unsubscribed", { marketingEmail: "unsubscribed" }),
    cand("not-subscribed", { marketingEmail: "not_subscribed" }),
    cand("unengaged", { unengaged: true }),
    cand("resting-late", { recentMarketing: ["2026-11-25T00:00:00Z"] }),
    cand("resting-soon", { recentMarketing: ["2026-11-22T00:00:00Z"] }),
    cand("held-out-bucket", { holdoutBucket: 3 }),
  ];

  it("counts who can get it now and who is resting, never who already had it or cannot", () => {
    expect(stillToSend("subscribed", list, { now })).toEqual({ readyNow: 2, resting: 2, restingUntil: "2026-11-29T00:00:00.000Z" });
  });

  it("leaves out the holdout share only while a holdout is on", () => {
    expect(stillToSend("subscribed", list, { now, holdout: true }).readyNow).toBe(1);
  });

  it("counts unengaged people only when the campaign includes them", () => {
    expect(stillToSend("subscribed", list, { now, includeUnengaged: true }).readyNow).toBe(3);
  });
});
