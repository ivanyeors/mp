import { describe, expect, it } from "vitest";
import { migratedExtrasFromRow, migratedFactsFromRow } from "@/lib/customer-migration/overview";

/** The From Shopify card's read models (migration slice 12). */

describe("migratedExtrasFromRow (migration slice 06, PRD-loyalty-points slice 06)", () => {
  it("takes the first click and the Claim bonus from the overview", () => {
    expect(
      migratedExtrasFromRow({ claim_link_first_clicked_at: "2026-10-22T01:00:00Z", claim_bonus_at: "2026-10-22T02:00:00Z" }),
    ).toEqual({ claimLinkFirstClickedAt: "2026-10-22T01:00:00Z", claimBonusAt: "2026-10-22T02:00:00Z" });
  });

  it("shows no bonus without one, and no click when the link was never opened", () => {
    expect(migratedExtrasFromRow({ claim_link_first_clicked_at: null, claim_bonus_at: null })).toEqual({
      claimLinkFirstClickedAt: null,
      claimBonusAt: null,
    });
    // A failed overview read leaves the rows out rather than guessing.
    expect(migratedExtrasFromRow(null)).toEqual({ claimLinkFirstClickedAt: null, claimBonusAt: null });
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
      claimLinkFirstClickedAt: null,
      claimBonusAt: null,
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
