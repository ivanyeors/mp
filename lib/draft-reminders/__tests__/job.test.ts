import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailTransport, OutgoingEmail } from "@/lib/email/types";
import { reviewFakeDb, type ReviewFakeDb } from "@/lib/aftercare/__tests__/review-request-fake-db";

/**
 * The Draft reminder job (ADR 0050) against an in-memory database: the right
 * reminder on the right day, sent like a campaign (an Unsubscribe link and
 * `List-Unsubscribe`), each claimed in customer_emails so a re-run sends
 * nobody one twice, and nothing at all while the switch is off or no
 * unsubscribe link can be made.
 */

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));

const { runDraftReminders } = await import("@/lib/draft-reminders/server");
const { setEmailTransport } = await import("@/lib/email");

const NOW = new Date("2026-11-20T02:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number, from = NOW) => new Date(from.getTime() - days * DAY).toISOString();
const ORIGIN = "https://custom.mpillow.test";
const DRAFT = "3f2b8c1e-7d4a-4e9b-a1c2-5d6e7f8a9b0c";
const TOKEN = "9b8a7f6e-5d4c-4b3a-8f2e-1d0c9b8a7f6e";
const CUSTOMER = "0f8fad5b-d9cb-469f-a165-70867728950e";

const ENV_KEYS = ["VERCEL_ENV", "AFTERCARE_EMAIL_ALLOWLIST", "UNSUBSCRIBE_SECRET", "SUPPORT_EMAIL"] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
afterAll(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  setEmailTransport(null);
});

let emails: OutgoingEmail[];
const transport: EmailTransport = {
  name: "fake",
  async send(email) {
    emails.push(email);
    return { id: `m${emails.length}` };
  },
};

let db: ReviewFakeDb;

function seed(over: { updatedDaysAgo?: number; marketing?: string | null; data?: Record<string, unknown> } = {}) {
  db = {
    mp_config_responses: [
      {
        id: DRAFT,
        status: null,
        product_type: "pillow",
        source: "online_customization",
        measured_by_type: "by_user",
        customer_email: "wei@example.com",
        access_token: TOKEN,
        data: over.data ?? { name: "Wei Ling", configurator: "full" },
        created_at: ago((over.updatedDaysAgo ?? 1.5) + 0.1),
        updated_at: ago(over.updatedDaysAgo ?? 1.5),
      },
    ],
    customers: [
      { id: CUSTOMER, email: "wei@example.com", marketing_email: over.marketing === undefined ? "subscribed" : over.marketing },
    ],
  };
}

const run = (now = NOW) => runDraftReminders(reviewFakeDb(db), { origin: ORIGIN, now });

beforeEach(() => {
  process.env.VERCEL_ENV = "production";
  process.env.UNSUBSCRIBE_SECRET = "test-unsubscribe-secret";
  process.env.SUPPORT_EMAIL = "Mpillow <support@mpillow.test>";
  emails = [];
  setEmailTransport(transport);
  seed();
});

describe("runDraftReminders", () => {
  it("sends the day's reminder with the continue link, an Unsubscribe link and the one-click headers", async () => {
    const report = await run();
    expect(report.sent).toEqual({ "1d": 1, "1w": 0, "1m": 0 });
    expect(emails).toHaveLength(1);
    const [email] = emails;
    expect(email.to).toBe("wei@example.com");
    expect(email.replyTo).toBe("Mpillow <support@mpillow.test>");
    expect(email.subject).toBe("Your Mpillow answers are saved");
    expect(email.text).toContain(`${ORIGIN}/en-US/mp-config?draft=${DRAFT}&token=${TOKEN}`);
    expect(email.text).toContain("Hi Wei Ling,");
    expect(email.html).toMatch(/\/unsubscribe\?u=/);
    expect(email.headers?.["List-Unsubscribe"]).toMatch(/^<https:\/\/custom\.mpillow\.test\/api\/email\/unsubscribe\?u=.+>, <mailto:support@mpillow\.test\?subject=unsubscribe>$/);
    expect(email.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(db.customer_emails).toEqual([
      expect.objectContaining({ customer_id: CUSTOMER, template: "results.draft_reminder_1d", entity_id: DRAFT, status: "sent" }),
    ]);
  });

  it("sends it once, however often it runs that day", async () => {
    await run();
    const again = await run();
    expect(emails).toHaveLength(1);
    expect(again.sent["1d"]).toBe(0);
    expect(again.skipped.already_sent).toBe(1);
  });

  it("sends the week's and the month's in theirs, then stops", async () => {
    const saved = new Date(Date.parse(db.mp_config_responses[0].updated_at as string));
    const on = (days: number) => new Date(saved.getTime() + days * DAY);
    await run(on(1.2));
    await run(on(8));
    await run(on(31));
    const last = await run(on(38));
    expect(emails.map((e) => e.subject)).toEqual([
      "Your Mpillow answers are saved",
      "Still thinking about your Mpillow?",
      "Your Mpillow answers are still here",
    ]);
    expect(emails[2].text).toContain("This is the last reminder we'll send about it.");
    // Past the month's window the Draft is not even read.
    expect(last.sent).toEqual({ "1d": 0, "1w": 0, "1m": 0 });
    expect(emails).toHaveLength(3);
  });

  it("links a Basic Draft to Basic", async () => {
    seed({ data: { name: "Wei Ling", configurator: "basic" } });
    await run();
    expect(emails[0].subject).toBe("Your Basic Mpillow answers are saved");
    expect(emails[0].text).toContain(`${ORIGIN}/en-US/mp-basic?draft=${DRAFT}`);
  });

  it("sends nothing to a guest who did not agree to marketing emails", async () => {
    seed({ marketing: "not_subscribed" });
    const report = await run();
    expect(emails).toEqual([]);
    expect(report.skipped.no_marketing_consent).toBe(1);
  });

  it("sends nothing once they went on to hold a pillow", async () => {
    db.mp_config_responses.push({
      id: "11111111-2222-4333-8444-555555555555",
      status: "held",
      customer_email: "Wei@Example.com",
      created_at: ago(0.5),
      updated_at: ago(0.5),
    });
    const report = await run();
    expect(emails).toEqual([]);
    expect(report.skipped.went_on_to_buy).toBe(1);
  });

  it("sends nothing to an address a campaign bounced from", async () => {
    db.customer_campaign_sends = [{ customer_id: CUSTOMER, status: "sent", bounced_at: ago(3), complained_at: null }];
    const report = await run();
    expect(emails).toEqual([]);
    expect(report.skipped.suppressed).toBe(1);
  });

  it("sends nothing while switched off", async () => {
    db.site_settings = [{ key: "draft_reminders_enabled", value: "false" }];
    const report = await run();
    expect(report.enabled).toBe(false);
    expect(emails).toEqual([]);
  });

  it("sends nothing while no unsubscribe link can be made", async () => {
    delete process.env.UNSUBSCRIBE_SECRET;
    const report = await run();
    expect(report.blocked).toBe("unsubscribe_not_configured");
    expect(emails).toEqual([]);
  });

  it("sends nothing outside production to an address not allowlisted", async () => {
    process.env.VERCEL_ENV = "preview";
    process.env.AFTERCARE_EMAIL_ALLOWLIST = "";
    const report = await run();
    expect(emails).toEqual([]);
    expect(report.skipped.not_allowed_outside_production).toBe(1);
  });
});
