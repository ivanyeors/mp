import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/csv";
import {
  buildCustomerPurchasesReport,
  customerNameOf,
  customerPurchasesCsv,
  saleTypeOf,
  textCell,
  type PlatformLedgerFact,
  type PlatformSaleFact,
} from "../customer-purchases";
import { parseReportPeriod } from "../period";

const parsed = parseReportPeriod("2026-10-01", "2026-10-31");
if (!parsed.ok) throw new Error(parsed.error);
const period = parsed.period;

function sale(over: Partial<PlatformSaleFact> = {}): PlatformSaleFact {
  return {
    orderId: "o1",
    orderNumber: "MP-20261005-0001",
    paidAt: "2026-10-05T04:00:00.000Z",
    status: "confirmed",
    currency: "SGD",
    subtotal: 200,
    discount: 20,
    shipping: 10,
    tax: 17.1,
    total: 207.1,
    paymentReference: "pi_1",
    customerName: "Tan Wei Ling",
    saleType: "Shop",
    ...over,
  };
}

function ledger(over: Partial<PlatformLedgerFact> = {}): PlatformLedgerFact {
  return {
    orderNumber: "MP-20260928-0007",
    type: "refund",
    amount: -40,
    currency: "SGD",
    createdAt: "2026-10-10T02:00:00.000Z",
    stripeObjectId: "re_1",
    metadataKind: null,
    customerName: "Lim Ah Kow",
    saleType: "Customisation",
    orderStatus: "partially_refunded",
    ...over,
  };
}

function build(input: Partial<Parameters<typeof buildCustomerPurchasesReport>[0]> = {}) {
  return buildCustomerPurchasesReport({
    period,
    generatedAt: "2026-11-01T01:00:00.000Z",
    platformSales: [],
    platformLedger: [],
    shopifySales: [],
    shopifyRefunds: [],
    ...input,
  });
}

describe("customer purchases report", () => {
  it("dates sales by paid_at and refunds by when the money moved, on Singapore days", () => {
    const report = build({
      platformSales: [
        sale(),
        // 23:30 UTC on 30 Sep is 07:30 on 1 Oct in Singapore: in.
        sale({ orderId: "o2", orderNumber: "MP-B", paidAt: "2026-09-30T23:30:00.000Z" }),
        // 16:30 UTC on 31 Oct is 00:30 on 1 Nov in Singapore: out.
        sale({ orderId: "o3", orderNumber: "MP-C", paidAt: "2026-10-31T16:30:00.000Z" }),
      ],
      // The refund is for a September sale; it counts in October, when it was paid out.
      platformLedger: [ledger()],
    });
    expect(report.rows.map((r) => [r.kind, r.reference])).toEqual([
      ["sale", "MP-B"],
      ["sale", "MP-20261005-0001"],
      ["refund", "MP-20260928-0007"],
    ]);
  });

  it("totals sales, GST, refunds and net per currency", () => {
    const report = build({
      platformSales: [sale(), sale({ orderId: "o2", orderNumber: "MP-B", total: 100, tax: 8.26 })],
      platformLedger: [ledger()],
      shopifySales: [
        {
          shopifyOrderId: "9001",
          name: "#1042",
          paidAt: "2026-10-12T05:00:00.000Z",
          currency: "SGD",
          totalPrice: 59.9,
          financialStatus: "paid",
        },
      ],
      shopifyRefunds: [
        { shopifyRefundId: "77", orderName: "#1001", amount: 15, currency: "SGD", refundedAt: "2026-10-20T05:00:00.000Z" },
      ],
    });
    expect(report.totals).toEqual([
      { currency: "SGD", saleCount: 3, sales: 367, tax: 25.36, refunds: -55, net: 312 },
    ]);
    expect(report.byChannel.platform).toEqual([
      { currency: "SGD", saleCount: 2, sales: 307.1, tax: 25.36, refunds: -40, net: 267.1 },
    ]);
    expect(report.byChannel.shopify).toEqual([
      { currency: "SGD", saleCount: 1, sales: 59.9, tax: 0, refunds: -15, net: 44.9 },
    ]);
  });

  it("takes refunds, lost disputes and adjustments from the ledger, and skips charges and fees", () => {
    const report = build({
      platformLedger: [
        ledger({ type: "charge", amount: 207.1, stripeObjectId: "pi_1" }),
        ledger({ type: "fee", amount: -20, stripeObjectId: "dp_1:fee" }),
        ledger({ type: "dispute_loss", amount: -100, stripeObjectId: "dp_1" }),
        ledger({ type: "adjustment", amount: 40, stripeObjectId: "re_1:failed", metadataKind: "refund_reversal" }),
        ledger({ type: "adjustment", amount: 5, stripeObjectId: null }),
        ledger({ type: "dispute_hold", amount: -100, stripeObjectId: "dp_2" }),
      ],
    });
    expect(report.rows.map((r) => [r.kind, r.amount])).toEqual([
      ["dispute_loss", -100],
      ["refund_reversed", 40],
      ["adjustment", 5],
    ]);
  });

  it("writes one CSV whose Amount column sums to the net, signed and without symbols", () => {
    const report = build({ platformSales: [sale()], platformLedger: [ledger()] });
    const csv = customerPurchasesCsv(report);
    expect(csv.startsWith("﻿")).toBe(true);
    const [header, ...rows] = parseCsv(csv);
    expect(header[0]).toBe("Date (SGT)");
    const amountAt = header.indexOf("Amount");
    expect(rows.map((r) => r[amountAt])).toEqual(["207.10", "-40.00"]);
    expect(rows[0].slice(0, 6)).toEqual(["2026-10-05", "12:00", "Sale", "Mpillow", "Shop", "MP-20261005-0001"]);
    expect(rows[0][header.indexOf("GST")]).toBe("17.10");
    expect(rows[1][header.indexOf("GST")]).toBe("");
    const sum = rows.reduce((t, r) => t + Number(r[amountAt]), 0);
    expect(sum.toFixed(2)).toBe(report.totals[0].net.toFixed(2));
  });

  it("neutralises spreadsheet formulas in text a customer typed", () => {
    expect(textCell("=HYPERLINK(\"x\")")).toBe("'=HYPERLINK(\"x\")");
    expect(textCell("+65 9123")).toBe("'+65 9123");
    expect(textCell("Tan Wei Ling")).toBe("Tan Wei Ling");
    const csv = customerPurchasesCsv(build({ platformSales: [sale({ customerName: "@SUM(A1:A9)" })] }));
    const [header, row] = parseCsv(csv);
    expect(row[header.indexOf("Customer")]).toBe("'@SUM(A1:A9)");
  });

  it("names the sale type from the Order's lines", () => {
    expect(saleTypeOf([{ sku: "RESULT-M-premium", kind: "goods", service_key: null }])).toBe("Customisation");
    expect(
      saleTypeOf([
        { sku: "RESULT-M-premium", kind: "goods", service_key: null },
        { sku: "SVC-MEASURE", kind: "service", service_key: "measurement_premium" },
      ]),
    ).toBe("Customisation");
    expect(saleTypeOf([{ sku: "SVC-READJ", kind: "service", service_key: "readjustment" }])).toBe("Re-adjustment");
    expect(saleTypeOf([{ sku: "SVC-X", kind: "service", service_key: "other" }])).toBe("Service");
    expect(saleTypeOf([{ sku: "NECK-S", kind: "goods", service_key: null }])).toBe("Shop");
    expect(saleTypeOf([])).toBe("Shop");
  });

  it("names the customer, falling back to the shipping recipient", () => {
    expect(customerNameOf({ first_name: "Wei Ling", last_name: "Tan" }, null)).toBe("Wei Ling Tan");
    expect(customerNameOf(null, { recipient: " Ahmad " })).toBe("Ahmad");
    expect(customerNameOf({ first_name: null, last_name: null }, {})).toBe("");
  });
});
