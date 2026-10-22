import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const recordAdminAction = vi.fn<(input: unknown) => Promise<void>>(async () => {});
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction: (input: unknown) => recordAdminAction(input) }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));

import { parseCsv } from "@/lib/csv";
import { setEmailTransport, type EmailTransport, type OutgoingEmail } from "@/lib/email";
import type { AdminContext } from "@/lib/auth/admin";
import { buildCustomerPurchasesReport } from "../customer-purchases";
import { parseReportPeriod } from "../period";
import {
  AUDIT_ACTION,
  MAX_RECIPIENTS,
  customerPurchasesFilename,
  parseNote,
  parseRecipients,
  sendCustomerPurchasesReport,
} from "../send";

const parsed = parseReportPeriod("2026-10-01", "2026-10-31");
if (!parsed.ok) throw new Error(parsed.error);

const report = buildCustomerPurchasesReport({
  period: parsed.period,
  generatedAt: "2026-11-01T01:00:00.000Z",
  platformSales: [
    {
      orderId: "o1",
      orderNumber: "MP-20261005-0001",
      paidAt: "2026-10-05T04:00:00.000Z",
      status: "confirmed",
      currency: "SGD",
      subtotal: 200,
      discount: 0,
      shipping: 0,
      tax: 16.51,
      total: 200,
      paymentReference: "pi_1",
      customerName: "Tan Wei Ling",
      saleType: "Shop",
    },
  ],
  platformLedger: [],
  shopifySales: [],
  shopifyRefunds: [],
});

const actor = { memberId: "m1", userId: "u1", email: "ops@mpillow.com" } as AdminContext;

class FakeTransport implements EmailTransport {
  readonly name = "fake";
  sent: OutgoingEmail[] = [];
  constructor(private readonly failFor: string[] = []) {}
  async send(email: OutgoingEmail) {
    if (this.failFor.includes(email.to)) throw new Error("mailbox unavailable");
    this.sent.push(email);
    return { id: `fake_${this.sent.length}` };
  }
}

beforeEach(() => recordAdminAction.mockClear());
afterEach(() => setEmailTransport(null));

describe("finance report recipients", () => {
  it("lower-cases, trims and de-duplicates", () => {
    expect(parseRecipients([" Accounts@Firm.sg ", "accounts@firm.sg", "ops@mpillow.com"])).toEqual({
      ok: true,
      recipients: ["accounts@firm.sg", "ops@mpillow.com"],
    });
  });

  it("refuses none, too many, and anything that is not an address", () => {
    expect(parseRecipients([]).ok).toBe(false);
    expect(parseRecipients(["not-an-email"])).toEqual({ ok: false, error: "One of the addresses is not an email address" });
    expect(parseRecipients(["a@b.sg\r\nBcc: x@y.z"]).ok).toBe(false);
    const many = Array.from({ length: MAX_RECIPIENTS + 1 }, (_, i) => `p${i}@firm.sg`);
    expect(parseRecipients(many).ok).toBe(false);
    expect(parseRecipients("a@b.sg").ok).toBe(false);
  });

  it("keeps a note short and drops an empty one", () => {
    expect(parseNote("  ")).toBeNull();
    expect(parseNote(42)).toBeNull();
    expect(parseNote("x".repeat(5000))?.length).toBe(2000);
  });
});

describe("sending a finance report", () => {
  it("sends each recipient their own email with the CSV, replying to the sender, and audits it", async () => {
    const transport = new FakeTransport();
    setEmailTransport(transport);
    const outcome = await sendCustomerPurchasesReport({
      actor,
      report,
      recipients: ["accounts@firm.sg", "boss@mpillow.com"],
      note: "For the GST return",
    });

    expect(outcome).toEqual({ sent: ["accounts@firm.sg", "boss@mpillow.com"], failed: [] });
    expect(transport.sent.map((e) => e.to)).toEqual(["accounts@firm.sg", "boss@mpillow.com"]);
    const email = transport.sent[0];
    expect(email.replyTo).toBe("ops@mpillow.com");
    expect(email.subject).toBe("Customer purchases report · October 2026");
    expect(email.text).toContain("For the GST return");
    // Intl separates the code from the amount with a no-break space.
    expect(email.text).toMatch(/Net received: SGD\s200\.00/);
    expect(email.attachments).toHaveLength(1);
    expect(email.attachments?.[0].filename).toBe(customerPurchasesFilename(report));
    expect(email.attachments?.[0].filename).toBe("customer-purchases-2026-10.csv");
    const [, row] = parseCsv(email.attachments![0].content);
    expect(row).toContain("MP-20261005-0001");

    expect(recordAdminAction).toHaveBeenCalledTimes(1);
    expect(recordAdminAction.mock.calls[0][0]).toMatchObject({
      action: AUDIT_ACTION,
      entityType: "finance_report",
      entityId: "customer-purchases:2026-10",
      after: { sent: ["accounts@firm.sg", "boss@mpillow.com"], failed: [], period: { from: "2026-10-01", to: "2026-10-31" } },
    });
  });

  it("a failing address does not stop the others, and is reported and audited", async () => {
    setEmailTransport(new FakeTransport(["bad@firm.sg"]));
    const outcome = await sendCustomerPurchasesReport({
      actor,
      report,
      recipients: ["bad@firm.sg", "accounts@firm.sg"],
      note: null,
    });
    expect(outcome).toEqual({
      sent: ["accounts@firm.sg"],
      failed: [{ email: "bad@firm.sg", error: "mailbox unavailable" }],
    });
    expect(recordAdminAction.mock.calls[0][0]).toMatchObject({ after: { failed: ["bad@firm.sg"] } });
  });
});
