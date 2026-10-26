// Deterministic origin before anything imports the email shell.
process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { hashClaimToken } from "@/lib/customer-migration/claim-link";
import {
  formatWaveReport,
  MAX_CONSECUTIVE_FAILURES,
  maskEmail,
  runCampaignWave,
  THROTTLE_MS,
  type WaveRequest,
  type WaveSetup,
} from "@/lib/customer-migration/wave-sender";
import type { EmailTransport, OutgoingEmail } from "@/lib/email/types";
import { unsubscribeToken, verifyUnsubscribeToken } from "@/lib/marketing-consent/unsubscribe";
import { emptyWorld, fakeCampaignClient, type CampaignWorld } from "./fake-campaign-db";

/**
 * The wave sender (migration slice 08). Against an in-memory ledger that
 * keeps the unique (Customer, template) key: a dry run sends nothing; the
 * sender refuses Gmail, a From off the campaign subdomain, and a site without
 * the unsubscribe route, before claiming anyone; the same `apply` twice sends
 * nothing the second time; two runs at once never send one person the same
 * template twice; each email carries its own Claim link, the footer link and
 * RFC 8058 headers; a failure is kept and retried only on request; five in a
 * row stop the wave; no run sends past Resend's plan, and the rest of a wave
 * goes out on a later day. assert-08-campaign-sends.sql proves the ledger
 * itself in Postgres, concurrency included.
 */

const ORIGIN = "https://custom.mpillow.com";
const SECRET = "wave-test-secret";

const id = (n: number) => `0c000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ANN = id(1); // buyer, imported 10 Oct
const BEA = id(2); // never bought, imported 15 Oct
const CAL = id(3); // buyer, imported 12 Oct
const DAN = id(4); // buyer, not subscribed
const EVE = id(5); // buyer, unsubscribed
const FAY = id(6); // buyer, already Claimed

function seed(world: CampaignWorld) {
  const subscribed = { marketing_email: "subscribed" };
  world.customers.push(
    { id: ANN, email: "ann@example.com", first_name: "Ann", ...subscribed },
    { id: BEA, email: "bea@example.com", first_name: "Bea", locale: "zh-CN", ...subscribed },
    { id: CAL, email: "cal@example.com", first_name: null, ...subscribed },
    { id: DAN, email: "dan@example.com", first_name: "Dan", marketing_email: "not_subscribed" },
    { id: EVE, email: "eve@example.com", first_name: "Eve", marketing_email: "unsubscribed" },
    { id: FAY, email: "fay@example.com", first_name: "Fay", ...subscribed },
  );
  world.migrated.push(
    { customer_id: ANN, shopify_orders_count: 2, imported_at: "2026-10-10T02:00:00Z" },
    { customer_id: BEA, shopify_orders_count: 0, imported_at: "2026-10-15T02:00:00Z" },
    { customer_id: CAL, shopify_orders_count: 1, imported_at: "2026-10-12T02:00:00Z" },
    { customer_id: DAN, shopify_orders_count: 3, imported_at: "2026-10-12T02:00:00Z" },
    { customer_id: EVE, shopify_orders_count: 3, imported_at: "2026-10-12T02:00:00Z" },
    { customer_id: FAY, shopify_orders_count: 3, imported_at: "2026-10-12T02:00:00Z", claimed_at: "2026-10-16T02:00:00Z" },
  );
  // Points are on and launched, with the seeded Claim bonus: 1,000 points within 3 months.
  Object.assign(world.settings, {
    migration_service_notice_enabled: "false",
    points_enabled: "true",
    points_launch_at: new Date(Date.now() - 86400_000).toISOString(),
    points_claim_bonus: "1000",
    points_claim_bonus_months: "3",
  });
}

/** The site: its one-click route verifies links with `siteSecret`. */
function site({ live = true, siteSecret = SECRET, configured = true } = {}) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (!live || url.pathname !== "/api/email/unsubscribe") return new Response("not found", { status: 404 });
    if (!configured) return Response.json({ ok: false, error: "not_configured" }, { status: 503 });
    const u = url.searchParams.get("u");
    const t = url.searchParams.get("t");
    if (!verifyUnsubscribeToken(u, t, siteSecret)) return Response.json({ ok: false, error: "invalid_link" }, { status: 400 });
    return Response.json({ ok: true });
  });
}

function fakeTransport(opts: { name?: string; failFor?: Set<string>; failAll?: boolean; quotaAfter?: number } = {}) {
  const sent: OutgoingEmail[] = [];
  const transport: EmailTransport = {
    name: opts.name ?? "resend",
    async send(email) {
      if (opts.quotaAfter !== undefined && sent.length >= opts.quotaAfter) {
        throw new Error(
          'Resend send failed (429): {"statusCode":429,"name":"daily_quota_exceeded","message":"You have reached your daily email sending quota."}',
        );
      }
      if (opts.failAll || opts.failFor?.has(email.to)) throw new Error(`Resend send failed (500): ${email.to}`);
      sent.push(email);
      return { id: `re_${sent.length}` };
    },
  };
  return { transport, sent };
}

let world: CampaignWorld;
let sleep: Mock<(ms: number) => Promise<void>>;

beforeEach(() => {
  world = emptyWorld();
  seed(world);
  sleep = vi.fn<(ms: number) => Promise<void>>(async () => undefined);
});

function setup(over: Partial<WaveSetup> = {}): WaveSetup & { sent: OutgoingEmail[] } {
  const { transport, sent } = fakeTransport();
  return {
    admin: fakeCampaignClient(world) as unknown as SupabaseClient,
    transport,
    campaignFrom: "Mpillow <hello@hello.mpillow.com>",
    campaignDomain: "hello.mpillow.com",
    orderFrom: "orders@mpillow.com",
    replyTo: "Mpillow Support <support@mpillow.com>",
    origin: ORIGIN,
    unsubscribeSecret: SECRET,
    fetchImpl: site() as unknown as typeof fetch,
    sleep,
    sent,
    ...over,
  };
}

const announce = (over: Partial<WaveRequest> = {}): WaveRequest => ({
  template: "migration_announcement",
  wave: "w1",
  limit: 10,
  apply: true,
  ...over,
});

const claims = (s: WaveSetup) =>
  (s.admin as unknown as ReturnType<typeof fakeCampaignClient>).rpcCalls.filter((c) => c.name === "claim_campaign_send");

describe("a dry run", () => {
  it("prints the checks, the eligible count and the selection, and sends and writes nothing", async () => {
    const s = setup();
    const report = await runCampaignWave(announce({ apply: false }), s);
    expect(report.ran).toBe(false);
    expect(report.preflight.ready).toBe(true);
    // Buyers first, the most recent import first; never bought last.
    expect(report.audience!.selection.map((c) => c.customerId)).toEqual([CAL, ANN, BEA]);
    expect(report.audience!.excluded).toEqual({ not_subscribed: 1, unsubscribed: 1, claimed: 1 });
    expect(claims(s)).toEqual([]);
    expect(world.sends).toEqual([]);
    expect(s.sent).toEqual([]);

    const text = formatWaveReport(report).join("\n");
    expect(text).toContain("DRY RUN");
    expect(text).toContain("Eligible now: 3 (2 bought on Shopify)");
    expect(text).toContain("ca***@example.com");
    expect(text).not.toContain("cal@example.com");
    expect(text).toContain("--apply would send");
  });

  it("still shows the audience when the campaign is not configured yet (owner decision 4)", async () => {
    const report = await runCampaignWave(announce({ apply: false }), setup({ transport: null, campaignFrom: undefined }));
    expect(report.audience!.eligible).toHaveLength(3);
    expect(report.preflight.ready).toBe(false);
    expect(formatWaveReport(report).join("\n")).toMatch(/FAIL transport: CAMPAIGN_RESEND_API_KEY is not set/);
  });
});

describe("it refuses before sending anything", () => {
  const refused = async (over: Partial<WaveSetup>, key: string, req: Partial<WaveRequest> = {}) => {
    const s = setup(over);
    const before = JSON.stringify(world.sends);
    const report = await runCampaignWave(announce(req), s);
    expect(report.ran).toBe(false);
    expect(report.preflight.checks.find((c) => c.key === key)).toMatchObject({ ok: false });
    expect(claims(s)).toEqual([]);
    expect(JSON.stringify(world.sends)).toBe(before);
    expect(formatWaveReport(report).join("\n")).toContain("REFUSED");
    return report;
  };

  it("Gmail, or any transport but Resend", async () => {
    const gmail = fakeTransport({ name: "gmail" });
    const r = await refused({ transport: gmail.transport }, "transport");
    expect(r.preflight.checks.find((c) => c.key === "transport")!.detail).toMatch(/never the order mailbox/);
    expect(gmail.sent).toEqual([]);
  });

  it("no campaign key at all", async () => {
    await refused({ transport: null }, "transport");
  });

  it("a From that is not on the campaign subdomain", async () => {
    await refused({ campaignFrom: "Mpillow <hello@mpillow.com>" }, "from");
    await refused({ campaignFrom: "Mpillow <sg@gmail.com>" }, "from");
    await refused({ campaignDomain: "mpillow.com", campaignFrom: "hello@mpillow.com" }, "from");
    await refused({ campaignDomain: undefined }, "from");
    // The subdomain the order mailbox sends from is not the campaign's.
    await refused({ orderFrom: "orders@hello.mpillow.com" }, "from");
  });

  it("a site without the unsubscribe route (README, first hazard)", async () => {
    await refused({ fetchImpl: site({ live: false }) as unknown as typeof fetch }, "unsubscribe_route");
    await refused({ fetchImpl: site({ configured: false }) as unknown as typeof fetch }, "unsubscribe_route");
    const down = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    await refused({ fetchImpl: down as unknown as typeof fetch }, "unsubscribe_route");
  });

  it("a site whose UNSUBSCRIBE_SECRET is not this machine's: every link would be dead", async () => {
    await refused({ fetchImpl: site({ siteSecret: "the-production-one" }) as unknown as typeof fetch }, "unsubscribe_secret");
    await refused({ unsubscribeSecret: undefined }, "unsubscribe_secret");
  });

  it("a local or plain-http site", async () => {
    await refused({ origin: "http://localhost:3000" }, "site");
  });

  it("no support inbox for Reply-To", async () => {
    await refused({ replyTo: "mpillow <onboarding@resend.dev>" }, "reply_to");
  });

  it("an offer email while a sign-in would grant no points", async () => {
    world.settings.points_enabled = "false";
    const off = await refused({}, "bonus");
    expect(off.preflight.checks.find((c) => c.key === "bonus")!.detail).toMatch(/promises points.*points are off/);
    world.settings.points_enabled = "true";
    world.settings.points_launch_at = new Date(Date.now() + 86400_000).toISOString();
    await refused({}, "bonus");
    world.settings.points_launch_at = new Date(Date.now() - 86400_000).toISOString();
    world.settings.points_claim_bonus = "0";
    await refused({}, "bonus", { template: "migration_reminder", wave: "r1" });
  });

  it("the service notice while owner decision 3 is unanswered", async () => {
    await refused({}, "service_notice", { template: "migration_service_notice", wave: "n1" });
  });

  it("a malformed wave label", async () => {
    await refused({}, "wave", { wave: "w 1" });
  });

  it("while the latest wave holds a pause condition, unless resumed", async () => {
    // A pilot of 40: one bounce is 2.5%.
    for (let i = 0; i < 40; i++) {
      world.sends.push({
        id: `p${i}`,
        customer_id: `pilot-${i}`,
        template: "migration_announcement",
        wave: "pilot",
        status: i === 0 ? "bounced" : "sent",
        provider_message_id: `re_p${i}`,
        sent_at: "2026-10-18T02:00:00Z",
        attempts: 1,
        last_error: null,
        bounced_at: i === 0 ? "2026-10-18T03:00:00Z" : null,
        complained_at: null,
      });
    }
    const r = await refused({}, "pause");
    expect(r.preflight.checks.find((c) => c.key === "pause")!.detail).toMatch(/1 of 40 bounced \(2\.5%, over 2%\)/);

    const s = setup();
    const resumed = await runCampaignWave(announce({ resume: true }), s);
    expect(resumed.ran).toBe(true);
    expect(s.sent).toHaveLength(3);
  });
});

describe("--apply", () => {
  it("claims each person before sending, and sends each their own email", async () => {
    const s = setup();
    const report = await runCampaignWave(announce(), s);
    expect(report.ran).toBe(true);
    expect(report.sent).toBe(3);
    expect(s.sent.map((e) => e.to)).toEqual(["cal@example.com", "ann@example.com", "bea@example.com"]);
    expect(world.sends.map((r) => [r.customer_id, r.template, r.wave, r.status])).toEqual([
      [CAL, "migration_announcement", "w1", "sent"],
      [ANN, "migration_announcement", "w1", "sent"],
      [BEA, "migration_announcement", "w1", "sent"],
    ]);
    expect(world.sends.map((r) => r.provider_message_id)).toEqual(["re_1", "re_2", "re_3"]);
    expect(sleep).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledWith(THROTTLE_MS);
  });

  it("puts the Claim link, the unsubscribe link and the RFC 8058 headers on every email", async () => {
    const s = setup();
    await runCampaignWave(announce(), s);
    const bea = s.sent.find((e) => e.to === "bea@example.com")!;

    expect(bea.from).toBe("Mpillow <hello@hello.mpillow.com>");
    expect(bea.replyTo).toBe("support@mpillow.com");
    const token = unsubscribeToken(BEA, SECRET)!;
    expect(bea.headers).toEqual({
      "List-Unsubscribe": `<${ORIGIN}/api/email/unsubscribe?u=${BEA}&t=${token}>, <mailto:support@mpillow.com?subject=unsubscribe>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    // The footer link is the confirm page, in the Customer's language.
    expect(bea.html).toContain(`${ORIGIN}/zh-CN/unsubscribe?u=${BEA}&amp;t=${token}`);
    expect(bea.text).toContain(`Unsubscribe: ${ORIGIN}/zh-CN/unsubscribe?u=${BEA}&t=${token}`);

    // One Claim link per email, stored as a hash only, with the campaign's UTMs.
    expect(world.claimLinks).toHaveLength(3);
    const link = /https:\/\/custom\.mpillow\.com\/zh-CN\/account\/welcome\?c=([A-Za-z0-9_-]{43})&utm_source=new_website&utm_medium=email&utm_campaign=migration_announcement/.exec(bea.text);
    expect(link).not.toBeNull();
    const stored = world.claimLinks.find((l) => l.customer_id === BEA)!;
    expect(stored).toEqual({ customer_id: BEA, token_hash: await hashClaimToken(link![1]), template: "migration_announcement" });
    expect(JSON.stringify(world.claimLinks)).not.toContain(link![1]);

    // The Claim bonus and its window, from Discounts → Points; no word of the old platform.
    expect(bea.text).toContain("Sign in within 3 months of this email and we'll add 1,000 points, S$10 off your next shop order.");
    // The terms, in the Customer's language.
    expect(bea.text).toContain(`How points work: ${ORIGIN}/zh-CN/points`);
    expect(`${bea.subject}\n${bea.text}\n${bea.html}`).not.toMatch(/shopify|moved|voucher/i);
    expect(bea.subject).toBe("Your Mpillow account is ready");
  });

  it("sends nothing the second time the same command runs", async () => {
    const first = setup();
    await runCampaignWave(announce({ limit: 2 }), first);
    expect(first.sent).toHaveLength(2);
    // Bea is still eligible, but wave w1 holds its 2: the next ones are w2.
    const again = setup();
    const report = await runCampaignWave(announce({ limit: 2 }), again);
    expect(report.ran).toBe(true);
    expect(again.sent).toEqual([]);
    expect(claims(again)).toEqual([]);
    expect(world.sends).toHaveLength(2);
    expect(report.audience!.eligible.map((c) => c.customerId)).toEqual([BEA]);
    expect(formatWaveReport(report).join("\n")).toContain("Wave w1 already holds 2 of 2; room for 0.");
  });

  it("never sends one person the same template twice, whatever the wave", async () => {
    const first = setup();
    await runCampaignWave(announce({ limit: 2 }), first);
    expect(first.sent.map((e) => e.to)).toEqual(["cal@example.com", "ann@example.com"]);
    const next = setup();
    await runCampaignWave(announce({ wave: "w2", limit: 10 }), next);
    expect(next.sent.map((e) => e.to)).toEqual(["bea@example.com"]);
    expect(new Set(world.sends.map((r) => r.customer_id)).size).toBe(world.sends.length);
  });

  it("two runs at once never send one person the same template twice", async () => {
    const a = setup();
    const b = setup();
    const [ra, rb] = await Promise.all([runCampaignWave(announce(), a), runCampaignWave(announce(), b)]);
    const all = [...a.sent, ...b.sent].map((e) => e.to);
    expect(all.sort()).toEqual(["ann@example.com", "bea@example.com", "cal@example.com"]);
    expect(ra.sent + rb.sent).toBe(3);
    expect(ra.skipped.already_sent ?? 0).toBe(rb.sent);
    expect(world.sends).toHaveLength(3);
  });

  it("re-checks each person at the moment of sending: someone who unsubscribed after selection is skipped", async () => {
    world.onClaim = (customerId) => {
      if (customerId === ANN) world.customers.find((c) => c.id === BEA)!.marketing_email = "unsubscribed";
    };
    const s = setup();
    const report = await runCampaignWave(announce(), s);
    expect(s.sent.map((e) => e.to)).toEqual(["cal@example.com", "ann@example.com"]);
    expect(report.skipped).toEqual({ unsubscribed: 1 });
    expect(world.sends.some((r) => r.customer_id === BEA)).toBe(false);
  });

  it("buyers only leaves out subscribers who never bought", async () => {
    const s = setup();
    await runCampaignWave(announce({ buyersOnly: true }), s);
    expect(s.sent.map((e) => e.to)).toEqual(["cal@example.com", "ann@example.com"]);
  });

  it("marks a failed send failed, and retries it only with --retry-failed, in its own wave", async () => {
    const failing = fakeTransport({ failFor: new Set(["ann@example.com"]) });
    const s = setup({ transport: failing.transport });
    const report = await runCampaignWave(announce(), s);
    expect(report.sent).toBe(2);
    expect(report.failed).toBe(1);
    expect(world.sends.find((r) => r.customer_id === ANN)).toMatchObject({
      status: "failed",
      last_error: expect.stringContaining("Resend send failed (500)"),
    });
    expect(formatWaveReport(report).join("\n")).toMatch(/failed .* an\*\*\*@example.com: Resend send failed/);

    // The same command again: the wave is full, and the failure is not retried.
    const again = setup();
    await runCampaignWave(announce(), again);
    expect(again.sent).toEqual([]);

    // --retry-failed sends only the failure.
    const retry = setup();
    const r = await runCampaignWave(announce({ retryFailed: true }), retry);
    expect(retry.sent.map((e) => e.to)).toEqual(["ann@example.com"]);
    expect(r.audience!.excluded).toEqual({ already_sent: 2, not_subscribed: 1, unsubscribed: 1, claimed: 1 });
    expect(world.sends.find((x) => x.customer_id === ANN)).toMatchObject({ status: "sent", attempts: 2 });
  });

  it(`stops after ${MAX_CONSECUTIVE_FAILURES} failures in a row`, async () => {
    for (let i = 10; i < 20; i++) {
      world.customers.push({ id: id(i), email: `p${i}@example.com`, marketing_email: "subscribed" });
      world.migrated.push({ customer_id: id(i), shopify_orders_count: 1, imported_at: "2026-10-01T00:00:00Z" });
    }
    const down = fakeTransport({ failAll: true });
    const s = setup({ transport: down.transport });
    const report = await runCampaignWave(announce({ limit: 13 }), s);
    expect(report.failed).toBe(MAX_CONSECUTIVE_FAILURES);
    expect(report.stopped).toMatch(/5 sends in a row failed/);
    expect(world.sends).toHaveLength(MAX_CONSECUTIVE_FAILURES);
    expect(world.sends.every((r) => r.status === "failed")).toBe(true);
    expect(formatWaveReport(report).join("\n")).toContain("STOPPED");
  });

  it("sends the reminder once, 7 days after the announcement, with a fresh Claim link", async () => {
    world.sends.push({
      id: "ann-1",
      customer_id: ANN,
      template: "migration_announcement",
      wave: "w1",
      status: "sent",
      provider_message_id: "re_old",
      sent_at: new Date(Date.now() - 8 * 86400_000).toISOString(),
      attempts: 1,
      last_error: null,
      bounced_at: null,
      complained_at: null,
    });
    world.sends.push({ ...world.sends[0], id: "cal-1", customer_id: CAL, provider_message_id: "re_old2", sent_at: new Date(Date.now() - 2 * 86400_000).toISOString() });
    const s = setup();
    const report = await runCampaignWave(announce({ template: "migration_reminder", wave: "r1" }), s);
    expect(s.sent.map((e) => e.to)).toEqual(["ann@example.com"]);
    expect(report.audience!.excluded).toMatchObject({ announcement_too_recent: 1, no_announcement: 1 });
    expect(s.sent[0].subject).toBe("S$10 in points is waiting in your Mpillow account");
    expect(world.claimLinks).toEqual([expect.objectContaining({ customer_id: ANN, template: "migration_reminder" })]);
  });

  it("sends the service notice to the no-consent group only, with no offer, once decision 3 is on", async () => {
    world.settings.migration_service_notice_enabled = "true";
    const s = setup();
    const report = await runCampaignWave(announce({ template: "migration_service_notice", wave: "n1" }), s);
    expect(report.ran).toBe(true);
    expect(s.sent.map((e) => e.to)).toEqual(["dan@example.com"]);
    const notice = s.sent[0];
    expect(notice.subject).toBe("Mpillow has a new website");
    expect(`${notice.text}\n${notice.html}`).not.toMatch(/voucher|discount|SGD|S\$|points?\b|% off|offer|promo|free shipping|shopify|moved/i);
    expect(notice.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(notice.text).toContain(`${ORIGIN}/en-US/appointments?type=readjustment`);
    // An offer check does not apply to it.
    expect(report.preflight.checks.map((c) => c.key)).not.toContain("bonus");
  });
});

describe("the send limit (Resend's free plan: 100 a day, 3,000 a month)", () => {
  const moreBuyers = (n: number) => {
    for (let i = 0; i < n; i++) {
      world.customers.push({ id: id(30 + i), email: `b${i}@example.com`, marketing_email: "subscribed" });
      world.migrated.push({ customer_id: id(30 + i), shopify_orders_count: 1, imported_at: "2026-10-01T00:00:00Z" });
    }
  };
  /** A send of another wave or template, `daysAgo` old. */
  const earlier = (n: number, status: string, daysAgo: number) => {
    for (let i = 0; i < n; i++) {
      world.sends.push({
        id: `e-${status}-${daysAgo}-${i}`,
        customer_id: `earlier-${status}-${daysAgo}-${i}`,
        template: "migration_reminder",
        wave: "r0",
        status,
        provider_message_id: status === "failed" ? null : `re_e_${status}_${daysAgo}_${i}`,
        sent_at: new Date(Date.now() - daysAgo * 86400_000).toISOString(),
        attempts: 1,
        last_error: null,
        bounced_at: status === "bounced" ? new Date().toISOString() : null,
        complained_at: status === "complained" ? new Date().toISOString() : null,
      });
    }
  };
  const limitCheck = (r: { preflight: { checks: { key: string; ok: boolean; detail: string }[] } }) =>
    r.preflight.checks.find((c) => c.key === "send_limit")!;

  it("is the free plan when no limits are given", async () => {
    const report = await runCampaignWave(announce({ apply: false }), setup());
    expect(limitCheck(report)).toEqual({
      key: "send_limit",
      ok: true,
      detail: "0 of 100 sent in the last 24 hours, 0 of 3,000 in the last 31 days: this run sends at most 100",
    });
    expect(report.preflight.budget).toBe(100);
  });

  it("sends no more than the day allows, holds the rest back, and the same command carries on the next day", async () => {
    moreBuyers(5); // 8 eligible
    const limits = { sendLimits: { daily: 3, monthly: 3000 } };

    const dry = await runCampaignWave(announce({ apply: false }), setup(limits));
    expect(dry.audience!.eligible).toHaveLength(8);
    expect(dry.audience!.selection).toHaveLength(3);
    expect(dry.heldBack).toBe(5);
    expect(formatWaveReport(dry).join("\n")).toContain("Held back by the send limit: 5 more. The same command sends them on a later day.");

    const day1 = setup(limits);
    const first = await runCampaignWave(announce(), day1);
    expect(first.sent).toBe(3);
    expect(day1.sent).toHaveLength(3);
    expect(world.sends).toHaveLength(3);

    // The same day: the limit is used up, so it refuses before claiming anyone.
    const again = setup(limits);
    const refused = await runCampaignWave(announce(), again);
    expect(refused.ran).toBe(false);
    expect(limitCheck(refused)).toMatchObject({ ok: false });
    expect(limitCheck(refused).detail).toBe(
      "3 of 3 sent in the last 24 hours, 3 of 3,000 in the last 31 days: the daily limit (CAMPAIGN_DAILY_SEND_LIMIT) is used up; run it again tomorrow",
    );
    expect(claims(again)).toEqual([]);
    expect(again.sent).toEqual([]);

    // A day later, the same command carries the wave on.
    for (const row of world.sends) row.sent_at = new Date(Date.now() - 25 * 3600_000).toISOString();
    const day2 = setup(limits);
    const second = await runCampaignWave(announce(), day2);
    expect(second.sent).toBe(3);
    expect(formatWaveReport(second).join("\n")).toContain("Wave w1 already holds 3 of 10; room for 7.");
    expect(new Set([...day1.sent, ...day2.sent].map((e) => e.to)).size).toBe(6);
    expect(world.sends.every((r) => r.wave === "w1" && r.status === "sent")).toBe(true);
  });

  it("counts every template and wave over 31 days, and what may have gone, but not what failed", async () => {
    earlier(10, "sent", 10);
    earlier(2, "bounced", 10);
    earlier(1, "complained", 10);
    earlier(1, "pending", 10);
    earlier(20, "failed", 10);
    earlier(50, "sent", 40); // outside the month
    const report = await runCampaignWave(announce({ apply: false }), setup({ sendLimits: { daily: 100, monthly: 16 } }));
    expect(limitCheck(report)).toEqual({
      key: "send_limit",
      ok: true,
      detail: "0 of 100 sent in the last 24 hours, 14 of 16 in the last 31 days: this run sends at most 2",
    });
    expect(report.audience!.selection.map((c) => c.customerId)).toEqual([CAL, ANN]);
    expect(report.heldBack).toBe(1);
  });

  it("counts the Email campaigns page's tests, which Resend counts too", async () => {
    world.auditLog = [
      { action: "email_campaign.test", created_at: new Date(Date.now() - 3600_000).toISOString(), after: { sent: 3, failed: 0 } },
      { action: "email_campaign.test", created_at: new Date(Date.now() - 5 * 86400_000).toISOString(), after: { sent: 2, failed: 1 } },
      { action: "email_campaign.test", created_at: new Date(Date.now() - 40 * 86400_000).toISOString(), after: { sent: 3, failed: 0 } },
      { action: "email_campaign.update", created_at: new Date().toISOString(), after: { sent: 50 } },
    ];
    const report = await runCampaignWave(announce({ apply: false }), setup());
    expect(limitCheck(report).detail).toBe(
      "3 of 100 sent in the last 24 hours, 5 of 3,000 in the last 31 days: this run sends at most 97",
    );
  });

  it("refuses while the month is used up", async () => {
    earlier(16, "sent", 3);
    const report = await runCampaignWave(announce(), setup({ sendLimits: { daily: 100, monthly: 16 } }));
    expect(report.ran).toBe(false);
    expect(limitCheck(report).detail).toMatch(
      /the monthly limit \(CAMPAIGN_MONTHLY_SEND_LIMIT\) is used up; run it again once the oldest of them is 31 days old$/,
    );
  });

  it("limits a retry of failed sends too", async () => {
    const failing = setup({ transport: fakeTransport({ failAll: true }).transport });
    await runCampaignWave(announce(), failing);
    expect(world.sends.every((r) => r.status === "failed")).toBe(true);
    const retry = setup({ sendLimits: { daily: 1, monthly: 3000 } });
    const report = await runCampaignWave(announce({ retryFailed: true }), retry);
    expect(retry.sent).toHaveLength(1);
    expect(report.heldBack).toBe(2);
  });

  it("stops at once when Resend says its quota is used up", async () => {
    moreBuyers(5);
    const s = setup({ transport: fakeTransport({ quotaAfter: 2 }).transport });
    const report = await runCampaignWave(announce(), s);
    expect(report.sent).toBe(2);
    expect(report.failed).toBe(1);
    expect(report.stopped).toMatch(/quota is used up/);
    expect(world.sends.map((r) => r.status)).toEqual(["sent", "sent", "failed"]);
    expect(formatWaveReport(report).join("\n")).toContain("STOPPED: Resend's sending quota is used up.");
  });
});

describe("maskEmail", () => {
  it("keeps enough to recognise, and no more", () => {
    expect(maskEmail("wei.ling@example.com")).toBe("we***@example.com");
    expect(maskEmail("a@x.test")).toBe("a***@x.test");
    expect(maskEmail("nonsense")).toBe("***");
  });
});
