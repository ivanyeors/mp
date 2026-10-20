import { describe, expect, it } from "vitest";
import { migratedFactsFromRow, migrationSummaryFromRow, signedUpPercent } from "@/lib/customer-migration/overview";

/** The Migration card's and the From Shopify card's read models (migration slice 12). */

describe("migrationSummaryFromRow", () => {
  it("reads the view's one row, counts arriving as bigint strings", () => {
    expect(
      migrationSummaryFromRow({
        imported: "5",
        imported_created: "3",
        imported_matched: "2",
        signed_up: 3,
        signed_up_before_import: 1,
        batches_applied: "1",
      }),
    ).toEqual({ imported: 5, created: 3, matched: 2, signedUp: 3, signedUpBeforeImport: 1, batchesApplied: 1 });
  });

  it("reads no row as zeros, so the card stays hidden", () => {
    expect(migrationSummaryFromRow(null)).toEqual({
      imported: 0,
      created: 0,
      matched: 0,
      signedUp: 0,
      signedUpBeforeImport: 0,
      batchesApplied: 0,
    });
  });
});

describe("signedUpPercent", () => {
  it("is s / N as a whole percent, and 0 with nobody imported", () => {
    expect(signedUpPercent({ imported: 3, signedUp: 1 })).toBe(33);
    expect(signedUpPercent({ imported: 8, signedUp: 7 })).toBe(88);
    expect(signedUpPercent({ imported: 0, signedUp: 0 })).toBe(0);
  });
});

describe("migratedFactsFromRow", () => {
  const row = {
    created_by_import: true,
    imported_at: "2026-10-21T02:00:00Z",
    claimed_at: null,
    shopify_orders_count: 2,
    shopify_amount_spent: "300.00",
    shopify_tags: null,
    shopify_note: "  ",
    email_marketing_at_export: "no" as const,
    exported_at: "2026-10-20",
    batch_id: "b1",
    customer_import_batches: { id: "b1", file_name: "export.csv", applied_at: null, rolled_back_at: null },
  };

  it("reads numeric spend, and empty tags and a blank note as none", () => {
    expect(migratedFactsFromRow(row)).toMatchObject({
      createdByImport: true,
      shopifyAmountSpent: 300,
      shopifyTags: [],
      shopifyNote: null,
      emailMarketingAtExport: "no",
      batch: { id: "b1", fileName: "export.csv", appliedAt: null, rolledBackAt: null },
    });
  });

  it("keeps the batch id when the batch row is not embedded", () => {
    expect(migratedFactsFromRow({ ...row, customer_import_batches: null }).batch).toEqual({
      id: "b1",
      fileName: "",
      appliedAt: null,
      rolledBackAt: null,
    });
  });
});
