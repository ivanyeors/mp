import { describe, expect, it } from "vitest";
import type { CampaignWaveStats, SendAllowance } from "@/lib/customer-migration/campaign-ledger";
import { formatAdminWeekdayTime } from "@/lib/format/admin-date";
import {
  allowanceMeters,
  allowanceSummary,
  boardTally,
  checkBoard,
  defaultWaveSize,
  nextStepAfterWave,
  rampUntil,
  RAMP_WAIT_MS,
  sendingRows,
  sendSteps,
  waitingSummary,
  waveRows,
} from "../send-flow";

const allowance = (over: Partial<SendAllowance> = {}): SendAllowance => ({
  remaining: 62,
  binding: "daily",
  limits: { daily: 100, monthly: 3000 },
  used: { daily: 38, monthly: 140 },
  roomAt: null,
  ...over,
});
const ROOM_AT = "2026-10-27T07:40:00.000Z";
const used = allowance({ remaining: 0, used: { daily: 100, monthly: 400 }, roomAt: ROOM_AT });

describe("the send limit, in words", () => {
  it("meters today and this month", () => {
    expect(allowanceMeters(allowance())).toEqual([
      { label: "Today", used: 38, limit: 100, left: 62, percent: 38, text: "38 of 100 sent · 62 left" },
      { label: "This month", used: 140, limit: 3000, left: 2860, percent: 5, text: "140 of 3,000 sent · 2,860 left" },
    ]);
  });

  it("says what can go now, or when room opens again", () => {
    expect(allowanceSummary(allowance())).toBe("62 emails can go now.");
    expect(allowanceSummary(used)).toBe(`Today's 100 are used: room again from ${formatAdminWeekdayTime(ROOM_AT)}.`);
    expect(allowanceSummary(allowance({ remaining: 0, binding: "monthly", roomAt: null }))).toBe(
      "This month's 3,000 are used: room again once the oldest send is 31 days old.",
    );
  });

  it("starts the wave size at today's room, and at 50 for a first wave", () => {
    expect(defaultWaveSize(allowance(), true, 1000)).toBe(50);
    expect(defaultWaveSize(allowance({ remaining: 20 }), true, 1000)).toBe(20);
    expect(defaultWaveSize(allowance(), false, 1000)).toBe(62);
    expect(defaultWaveSize(used, false, 1000)).toBe(1);
    expect(defaultWaveSize(null, false, 1000)).toBe(100);
  });
});

describe("sendingRows", () => {
  const sender = { from: "Mpillow <hello@hello.mpillow.com>", replyTo: "support@mpillow.com" };
  const ok = (key: string) => ({ key, ok: true, detail: `${key} detail` });

  it("names what is set up, and never a key", () => {
    const rows = sendingRows([ok("transport"), ok("from"), ok("reply_to"), ok("site"), ok("reports")], sender);
    expect(rows.map((r) => r.title)).toEqual([
      "Resend connected",
      "Sending from Mpillow <hello@hello.mpillow.com>",
      "Replies go to support@mpillow.com",
      "Links point at the live site",
      "Bounce and spam reports on",
    ]);
    expect(rows.every((r) => r.fix === null)).toBe(true);
    expect(rows[0].detail).toBe("The key is kept in Vercel and is never shown here.");
  });

  it("shows the sending domain's answer from Resend as it came", () => {
    const refused = { key: "domain", ok: false, detail: "Resend has no domain custom.mpillow.com" };
    expect(sendingRows([refused], sender)).toEqual([{ ...refused, title: "Sending domain in Resend", fix: null }]);
  });

  it("says what to set in Vercel for each one that fails", () => {
    const bad = (key: string) => ({ key, ok: false, detail: `${key} is missing` });
    const rows = sendingRows(
      [bad("transport"), bad("from"), bad("reply_to"), bad("site"), bad("reports")],
      { from: null, replyTo: null },
      "https://custom.mpillow.com/",
    );
    expect(rows.map((r) => [r.title, r.detail])).toEqual([
      ["Resend not connected", "transport is missing"],
      ["No sending address", "from is missing"],
      ["No inbox for replies", "reply_to is missing"],
      ["Links do not point at a live site", "site is missing"],
      ["Bounce and spam reports off", "reports is missing"],
    ]);
    expect(rows[0].fix).toMatch(/^Add CAMPAIGN_RESEND_API_KEY, marked Sensitive, in Vercel .*, then redeploy\. Never name it RESEND_API_KEY/);
    expect(rows[1].fix).toContain("CAMPAIGN_EMAIL_FROM");
    expect(rows[2].fix).toContain("SUPPORT_EMAIL");
    expect(rows[4].fix).toContain("https://custom.mpillow.com/api/email/resend-webhook for email.bounced and email.complained");
  });
});

describe("sendSteps", () => {
  const base = { dirty: false, locked: false, lastTest: null, checks: [], allowance: allowance(), resume: false };

  it("ticks what is done; the test is advice", () => {
    const steps = sendSteps(base);
    expect(steps.map((s) => [s.key, s.done, s.advisory])).toEqual([
      ["saved", true, false],
      ["test", false, true],
      ["email", true, false],
      ["checks", true, false],
      ["room", true, false],
    ]);
    expect(steps[4]).toMatchObject({ label: "62 emails can go today", detail: "38 of 100 sent in the last 24 hours, tests included." });
    expect(steps[1].detail).toBe("Recommended: send yourself a test and read it on your phone first.");
  });

  it("names a failing check, but not the send limit, which has its own step, nor a pause Staff resumed", () => {
    const checks = [
      { key: "unsubscribe_route", ok: false, detail: "x" },
      { key: "pause", ok: false, detail: "y" },
      { key: "send_limit", ok: false, detail: "z" },
    ];
    expect(sendSteps({ ...base, checks, allowance: used }).find((s) => s.key === "checks")!.detail).toBe(
      "One-click unsubscribe works, Bounces and spam reports are low.",
    );
    const resumed = sendSteps({ ...base, checks: checks.slice(1), allowance: used, resume: true });
    expect(resumed.find((s) => s.key === "checks")!.done).toBe(true);
    expect(resumed.find((s) => s.key === "room")).toMatchObject({ done: false, label: "Room to send today" });
  });

  it("lists the email's own checks as one step, each failure with its block, then its advice, which holds nothing", () => {
    const issue = (blockId: string | null, text: string) => ({ blockId, text, what: text });
    const alt = { key: "alt", ok: false, advisory: false, detail: "Block 1, Image: no alt text", issues: [issue("img", "Block 1, Image: no alt text")] };
    const links = { key: "links", ok: false, advisory: false, detail: "x", issues: [issue("cta", "Block 3, Buttons: the button goes to http://x.test")] };
    const size = { key: "size", ok: true, advisory: false, detail: "40.0 KB as sent", issues: [] };
    const preview = { key: "preview_line", ok: false, advisory: true, detail: "y", issues: [issue(null, "Recommended: write a preview line")] };
    const checks = [{ key: "transport", ok: true, detail: "Resend" }, alt, links, size, { key: "send_limit", ok: true, detail: "room" }];

    const steps = sendSteps({ ...base, checks, advice: [preview] });
    const email = steps.find((s) => s.key === "email")!;
    expect(email).toMatchObject({ label: "The email", done: false, advisory: false, detail: "2 things to fix before it can go:" });
    expect(email.items).toEqual([
      { text: "Block 1, Image: no alt text", blockId: "img", advisory: false },
      { text: "Block 3, Buttons: the button goes to http://x.test", blockId: "cta", advisory: false },
      { text: "Recommended: write a preview line", blockId: null, advisory: true },
    ]);
    expect(steps.find((s) => s.key === "checks")).toMatchObject({ done: true });

    const fixed = sendSteps({ ...base, checks: [size], advice: [preview] }).find((s) => s.key === "email")!;
    expect(fixed).toMatchObject({ done: true, detail: "Nothing in it holds the wave." });
    expect(fixed.items).toEqual([{ text: "Recommended: write a preview line", blockId: null, advisory: true }]);
    expect(sendSteps({ ...base, checks: [size] }).find((s) => s.key === "email")).toEqual({
      key: "email",
      label: "The email",
      done: true,
      advisory: false,
      state: "pass",
      detail: "Its links, images, size and words are all fine.",
      needs: null,
      fromReady: true,
    });
    expect(fixed.state).toBe("advice");
    expect(sendSteps({ ...base, checks: null }).find((s) => s.key === "email")).toMatchObject({ done: false, detail: "Checking…" });
  });

  it("asks to save first, and records the test", () => {
    const steps = sendSteps({ ...base, dirty: true, lastTest: { sent: 2, at: ROOM_AT } });
    expect(steps[0]).toMatchObject({ done: false, detail: "Save your changes before sending." });
    expect(steps[1]).toMatchObject({ done: true, detail: `Sent to 2 addresses at ${formatAdminWeekdayTime(ROOM_AT)}. Check the inbox and the spam folder.` });
  });

  it("waits the test on what a test send needs, and only that", () => {
    const failing = (key: string) => ({ key, ok: false, detail: "no" });
    const test = (checks: { key: string; ok: boolean; detail: string }[], lastTest: { sent: number; at: string } | null = null) =>
      sendSteps({ ...base, checks, lastTest }).find((s) => s.key === "test")!;
    expect(test([failing("transport"), failing("domain")])).toMatchObject({
      state: "waiting",
      detail: "A test can go once Resend and the sending domain pass.",
      needs: "Needs Resend, the sending address, the sending domain, a reply inbox and room in the plan",
    });
    expect(test([failing("unsubscribe_route"), failing("pause")])).toMatchObject({ state: "advice", done: false });
    expect(test([failing("transport")], { sent: 1, at: ROOM_AT })).toMatchObject({ state: "pass", done: true });
    expect(sendSteps(base).filter((s) => s.fromReady).map((s) => s.key)).toEqual(["email", "checks", "room"]);
  });
});

describe("checkBoard", () => {
  const ok = (key: string) => ({ key, ok: true, detail: `${key} ok` });
  const no = (key: string, detail = `${key} failed`) => ({ key, ok: false, detail });
  const setup = ["transport", "from", "domain", "reply_to", "site", "unsubscribe_route", "unsubscribe_secret", "pause", "send_limit"];
  const states = (b: ReturnType<typeof checkBoard>) => Object.fromEntries(b.attention.map((r) => [r.key, r.state]));

  it("waits a check on the one it needs, rather than crossing both", () => {
    const board = checkBoard(setup.map((k) => (k === "transport" ? no(k) : k === "domain" ? no(k, "not checked: Resend and the sending address are not both set up") : ok(k))));
    expect(states(board)).toEqual({ transport: "fail", domain: "waiting" });
    const domain = board.attention.find((r) => r.key === "domain")!;
    expect(domain).toMatchObject({ detail: "Checked once Resend passes.", needs: "Needs Resend and the sending address", nested: true });
    expect(board.headline).toBe("2 checks hold the wave");
    expect(boardTally(board.tally)).toBe("1 to fix · 1 waiting · 7 passed");
  });

  it("crosses the domain itself when what it needs passes", () => {
    const board = checkBoard(setup.map((k) => (k === "domain" ? no(k, "Resend has not verified mail.mpillow.com") : ok(k))));
    expect(states(board)).toEqual({ domain: "fail" });
    expect(board.attention[0]).toMatchObject({ detail: "Resend has not verified mail.mpillow.com", nested: false });
  });

  it("draws each check under the one it needs, by area, in the passed list", () => {
    const board = checkBoard(["unsubscribe_secret", "transport", "domain", "from", "unsubscribe_route"].map(ok));
    expect(board.passed.map((g) => [g.label, g.rows.map((r) => `${r.nested ? "  " : ""}${r.key}`)])).toEqual([
      ["Sending setup", ["transport", "from", "  domain"]],
      ["Unsubscribe", ["unsubscribe_route", "  unsubscribe_secret"]],
    ]);
    expect(board.headline).toBe("Every check passes");
  });

  it("says what the pause rule relies on, from either side", () => {
    const ready = checkBoard([ok("pause")]);
    expect(ready.passed[0].rows[0].needs).toBe("Relies on bounce and spam reports");
    const sending = checkBoard([ok("transport"), ok("reports")]);
    expect(sending.passed[0].rows.find((r) => r.key === "reports")!.feeds).toBe("The pause rule relies on this");
    expect(sending.passed[0].rows.find((r) => r.key === "transport")!.feeds).toBe("The sending domain relies on this");
  });

  it("shows a paused wave Staff chose to send anyway as overridden, and how to do that before", () => {
    const pause = no("pause", "the last wave (w1) 3 of 70 bounced (4.3%, over 2%); look into who bounced or complained before sending more");
    expect(checkBoard([pause], { override: false }).attention[0]).toMatchObject({
      state: "fail",
      fix: "Once you have looked into them, you can tick “send anyway” in the Send card.",
    });
    const sent = checkBoard([pause], { override: true });
    expect(sent.attention[0]).toMatchObject({ state: "override", fix: "Sending anyway, as you ticked in the Send card." });
    expect(sent.headline).toBe("Every check passes or is overridden");
    expect(checkBoard([pause]).attention[0]).toMatchObject({ state: "fail", fix: null });
  });

  it("lists advice after what holds the wave, and keeps a Sending row's own words and fix", () => {
    const board = checkBoard(
      [{ key: "transport", ok: false, detail: "not set", title: "Resend not connected", fix: "Add CAMPAIGN_RESEND_API_KEY" }, ok("from")],
      { advice: [{ key: "image_words", ok: false, detail: "Recommended: more words", issues: [] }] },
    );
    expect(board.attention.map((r) => [r.key, r.state, r.title, r.fix])).toEqual([
      ["transport", "fail", "Resend not connected", "Add CAMPAIGN_RESEND_API_KEY"],
      ["image_words", "advice", "Words beside the images", null],
    ]);
    expect(board.attention[1].area).toBe("email");
    expect(boardTally(board.tally)).toBe("1 to fix · 1 passed · 1 recommended");
  });
});

describe("waitingSummary", () => {
  it("says how many go now and how many wait, and how long the plan takes", () => {
    expect(waitingSummary({ selected: 62, waiting: 250, limitedBy: "daily", dailyLimit: 100 })).toBe(
      "62 people go in this wave, all today's room allows; the other 250 wait for later waves (about 3 more days at 100 a day).",
    );
    expect(waitingSummary({ selected: 50, waiting: 20, limitedBy: null, dailyLimit: 100 })).toBe(
      "50 people go in this wave; the other 20 wait for later waves.",
    );
    expect(waitingSummary({ selected: 1, waiting: 0, limitedBy: null, dailyLimit: 100 })).toBe(
      "1 person goes in this wave: that is everyone who can get it.",
    );
  });
});

describe("nextStepAfterWave", () => {
  const base = { sent: 62, failed: 0, stoppedByStaff: false, waiting: 238, allowance: used, rampUntil: null };

  it("waits for room, then retries what failed", () => {
    expect(nextStepAfterWave(base)).toBe(
      `The plan's room is used up for now: come back after ${formatAdminWeekdayTime(ROOM_AT)} to send the next wave.`,
    );
    expect(nextStepAfterWave({ ...base, failed: 2 })).toMatch(/ The 2 failed sends can go again: tick "Retry the failed sends only"\.$/);
  });

  it("waits out the first wave's 48 hours while there is room", () => {
    expect(nextStepAfterWave({ ...base, allowance: allowance(), rampUntil: ROOM_AT })).toBe(
      `Wait until ${formatAdminWeekdayTime(ROOM_AT)} before the next wave, and look at its bounces and spam reports first.`,
    );
    expect(nextStepAfterWave({ ...base, allowance: allowance() })).toBe("238 more can get it. 62 emails can go now.");
  });

  it("knows when it is done, or stopped", () => {
    expect(nextStepAfterWave({ ...base, waiting: 0 })).toBe("Everyone who can get this campaign has it now.");
    expect(nextStepAfterWave({ ...base, stoppedByStaff: true })).toBe(
      "You stopped the wave. Whoever it had not reached yet goes in the next one.",
    );
  });
});

describe("waveRows", () => {
  const wave = (over: Partial<CampaignWaveStats>): CampaignWaveStats => ({
    template: "campaign:x",
    wave: "w1",
    handed: 50,
    bounced: 0,
    complained: 0,
    failed: 0,
    pending: 0,
    lastSentAt: "2026-10-20T02:00:00.000Z",
    ...over,
  });

  it("judges each wave as the pause rule does, oldest first", () => {
    const rows = waveRows([
      wave({ wave: "w3", handed: 1000, complained: 1, lastSentAt: "2026-10-24T02:00:00.000Z" }),
      wave({ wave: "w1", bounced: 1 }),
      wave({ wave: "w2", handed: 100, bounced: 3, lastSentAt: "2026-10-22T02:00:00.000Z" }),
      wave({ wave: "w4", handed: 500, complained: 1, lastSentAt: "2026-10-25T02:00:00.000Z" }),
      wave({ wave: "w5", handed: 0, failed: 4, lastSentAt: null }),
    ]);
    expect(rows.map((r) => [r.wave, r.bouncedPercent, r.spamPercent, r.state, r.stateText])).toEqual([
      ["w1", "2.0%", "0.0%", "ok", "Under the lines"],
      ["w2", "3.0%", "0.0%", "over_bounce", "Over 2% bounced"],
      ["w3", "0.0%", "0.1%", "ok", "Under the lines"],
      ["w4", "0.0%", "0.2%", "over_spam", "Over 0.1% spam"],
      ["w5", "—", "—", "not_sent", "Nothing delivered"],
    ]);
  });

  it("leaves out a wave the holdout kept everyone back from (slice 11)", () => {
    const rows = waveRows([wave({ wave: "w1" }), wave({ wave: "daily-2026-11-01", handed: 0, lastSentAt: null })]);
    expect(rows.map((r) => r.wave)).toEqual(["w1"]);
  });
});

describe("rampUntil", () => {
  const sent = "2026-10-25T02:00:00.000Z";
  const first = { template: "campaign:x", wave: "w1", handed: 50, bounced: 0, complained: 0, failed: 0, pending: 0, lastSentAt: sent };

  it("is 48 hours after the first wave, while it is the only one", () => {
    const at = Date.parse(sent);
    expect(rampUntil([first], at + 3600_000)).toBe(new Date(at + RAMP_WAIT_MS).toISOString());
    expect(rampUntil([first], at + RAMP_WAIT_MS)).toBeNull();
    expect(rampUntil([first, { ...first, wave: "w2" }], at + 3600_000)).toBeNull();
    expect(rampUntil([], at)).toBeNull();
  });
});
