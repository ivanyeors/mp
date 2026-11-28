import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { SendAllowance } from "@/lib/customer-migration/campaign-ledger";
import type { SendingStatus } from "@/lib/email-campaigns/sender";

vi.mock("../actions", () => ({
  archiveCampaignAction: vi.fn(),
  checkCampaignReadiness: vi.fn(),
  duplicateCampaign: vi.fn(),
  planCampaignWave: vi.fn(),
  previewCampaign: vi.fn(() => new Promise(() => undefined)),
  saveCampaign: vi.fn(),
  sendCampaignBatchAction: vi.fn(),
  sendCampaignTestAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/settings/campaigns/x",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { SendingStatusCard } = await import("../sending-status-card");
const { SendSummary, sendButtonLabel } = await import("../send-confirm-dialog");
const { WaveTable } = await import("../wave-table");
const { CampaignEditor } = await import("../campaign-editor");
const { FIRST_CAMPAIGN_DRAFT } = await import("@/lib/email-campaigns/rules");

const allowance = (over: Partial<SendAllowance> = {}): SendAllowance => ({
  remaining: 62,
  binding: "daily",
  limits: { daily: 100, monthly: 3000 },
  used: { daily: 38, monthly: 140 },
  roomAt: null,
  ...over,
});
const ok = (key: string, detail = `${key} ok`) => ({ key, ok: true, detail });
const status = (over: Partial<SendingStatus> = {}): SendingStatus => ({
  sender: { from: "Mpillow <hello@hello.mpillow.com>", replyTo: "support@mpillow.com" },
  checks: [ok("transport"), ok("from"), ok("reply_to"), ok("site"), ok("reports")],
  allowance: allowance(),
  allowanceError: null,
  keptToday: 0,
  ...over,
});
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

describe("the Sending card", () => {
  it("starts minimised to one line when all is set up, with today's and this month's room", () => {
    const markup = renderToStaticMarkup(<SendingStatusCard status={status()} origin="https://custom.mpillow.com" keptSending={2} />);
    const html = text(markup);
    expect(html).toContain("Ready to send");
    expect(html).toContain("5 passed");
    expect(html).toContain("Details");
    expect(html).not.toContain("Resend connected");
    expect(html).not.toContain("Sending from");
    expect(html).toContain("Today 38 of 100 This month 140 of 3,000");
    expect(markup).toContain('aria-label="Today: 38 of 100 sent · 62 left"');
    expect(markup).toContain('aria-label="This month: 140 of 3,000 sent · 2,860 left"');
    expect(html).toContain("Kept sending: 2 campaigns at 10:00 · none sent today");
    expect(html).not.toContain("Rest period");
    expect(html).toContain("62 emails can go now.");
    expect(html).toContain("Run every check");
  });

  it("names what to set when something is missing, and when room opens again", () => {
    const html = text(
      renderToStaticMarkup(
        <SendingStatusCard
          status={status({
            checks: [{ key: "transport", ok: false, detail: "CAMPAIGN_RESEND_API_KEY is not set (owner decision 4)" }, ok("from"), ok("reply_to"), ok("site"), { key: "reports", ok: false, detail: "off" }],
            allowance: allowance({ remaining: 0, used: { daily: 100, monthly: 400 }, roomAt: "2026-10-27T07:40:00.000Z" }),
          })}
          origin="https://custom.mpillow.com"
        />,
      ),
    );
    expect(html).toContain("2 things to set up before sending");
    expect(html).toContain("Resend not connected");
    expect(html).toContain("Bounce and spam reports off");
    expect(html).not.toContain("Add CAMPAIGN_RESEND_API_KEY");
    expect(html).not.toContain("Sending from");
    expect(html).toContain("Today's 100 are used: room again from Tue, 27 Oct, 3:40 pm.");
  });

  it("says so when the setup could not be read", () => {
    expect(text(renderToStaticMarkup(<SendingStatusCard status={null} origin="https://custom.mpillow.com" />))).toContain(
      "The sending setup could not be read.",
    );
  });
});

describe("the confirmation", () => {
  it("restates the send, and its button names the count", () => {
    const html = text(
      renderToStaticMarkup(
        <SendSummary
          details={{
            count: 62,
            wave: "w2",
            subject: "Our new website is here",
            from: "Mpillow <hello@hello.mpillow.com>",
            replyTo: "support@mpillow.com",
            audience: "Everyone subscribed to marketing email",
            firstWave: false,
          }}
        />,
      ),
    );
    expect(html).toContain("Email Our new website is here");
    expect(html).toContain("From Mpillow <hello@hello.mpillow.com>");
    expect(html).toContain("Replies go to support@mpillow.com");
    expect(html).toContain("Audience Everyone subscribed to marketing email");
    expect(html).toContain("This wave 62 people (wave w2)");
    expect(sendButtonLabel(62)).toBe("Send to 62 people");
    expect(sendButtonLabel(1)).toBe("Send to 1 person");
  });
});

describe("the waves", () => {
  it("shows each wave against the pause lines, in words", () => {
    const html = text(
      renderToStaticMarkup(
        <WaveTable
          waves={[
            { template: "campaign:x", wave: "w1", handed: 50, bounced: 1, complained: 0, failed: 0, pending: 0, lastSentAt: "2026-10-20T02:00:00.000Z" },
            { template: "campaign:x", wave: "w2", handed: 100, bounced: 3, complained: 0, failed: 2, pending: 0, lastSentAt: "2026-10-22T02:00:00.000Z" },
          ]}
        />,
      ),
    );
    expect(html).toContain("Waves");
    expect(html).toContain("Under the lines");
    expect(html).toContain("Over 2% bounced");
    expect(html).toContain("Sent 100 · bounced 3 (3.0%) · spam 0 (0.0%) · failed 2");
  });

  it("is not shown before the first wave", () => {
    expect(renderToStaticMarkup(<WaveTable waves={[]} />)).toBe("");
  });
});

describe("the Send card", () => {
  it("picks who gets the test from a list of Admin Panel logins, with no box to type an address in", () => {
    const campaign = { ...FIRST_CAMPAIGN_DRAFT, id: "5a1d3c2e-7b4f-4e6a-9c8d-0f1e2d3c4b5a", createdAt: "t", updatedAt: "t", lockedAt: null, archivedAt: null, createdBy: null };
    const html = renderToStaticMarkup(
      <CampaignEditor campaign={campaign} draft={campaign} stats={null} segments={[]} staffEmail="Owner@mpillow.com" testRecipients={["owner@mpillow.com", "amy@mpillow.com"]} />,
    );
    const control = /<(\w+)[^>]*\bid="c-test"[^>]*>/.exec(html);
    expect(control?.[1]).toBe("button");
    expect(control?.[0]).toContain('role="combobox"');
    expect(html).not.toMatch(/<input[^>]*\bid="c-test"/);
    expect(text(html)).toContain("owner@mpillow.com");
    expect(text(html)).not.toContain("separated by commas");
  });

  it("opens on the checklist, with the waves below, and no browser confirm", () => {
    const campaign = {
      ...FIRST_CAMPAIGN_DRAFT,
      id: "5a1d3c2e-7b4f-4e6a-9c8d-0f1e2d3c4b5a",
      createdAt: "2026-10-21T00:00:00Z",
      updatedAt: "2026-10-21T00:00:00Z",
      lockedAt: "2026-10-21T01:00:00Z",
      archivedAt: null,
      createdBy: null,
    };
    const html = text(
      renderToStaticMarkup(
        <CampaignEditor
          campaign={campaign}
          draft={campaign}
          stats={{ handed: 50, bounced: 1, complained: 0, failed: 0, pending: 0, waves: 1, firstSentAt: null, lastSentAt: null, linkClicks: 4, clicked: 7, clicks: 9, unsubscribed: 2, bought: 3, boughtAfterClick: 1, boughtTotal: 640, counting: 50, heldOut: 0 }}
          waves={[{ template: "campaign:x", wave: "w1", handed: 50, bounced: 1, complained: 0, failed: 0, pending: 0, lastSentAt: "2026-10-20T02:00:00.000Z" }]}
          segments={[]}
          staffEmail="owner@mpillow.com"
        />,
      ),
    );
    for (const step of ["Saved", "Test sent", "Every check passes", "Room to send today"]) expect(html).toContain(step);
    expect(html).toContain("Sending has started, so the email is fixed.");
    expect(html).toContain("Waves");
    expect(html).toContain("Check who it goes to");
  });
});
