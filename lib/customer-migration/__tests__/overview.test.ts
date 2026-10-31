import { describe, expect, it } from "vitest";
import {
  migratedExtrasFromRow,
  migratedFactsFromRow,
  migrationSummaryFromRow,
  percentOf,
  signedUpPercent,
} from "@/lib/customer-migration/overview";

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
        clicked: "4",
        claim_bonuses: "3",
        migrated_points_spent: "1500",
        points_orders: 1,
        points_revenue: "180.50",
        emailed: "5",
        emails_bounced: "1",
        emails_complained: 0,
        stage_imported: "1",
        stage_imported_unreachable: "1",
        stage_emailed: 0,
        stage_emailed_unreachable: 0,
        stage_clicked: "1",
        stage_clicked_unreachable: 0,
        stage_signed_up: 0,
        stage_claim_bonus: "2",
        stage_ordered: 1,
      }),
    ).toEqual({
      imported: 5,
      created: 3,
      matched: 2,
      signedUp: 3,
      signedUpBeforeImport: 1,
      batchesApplied: 1,
      clicked: 4,
      claimBonuses: 3,
      migratedPointsSpent: 1500,
      pointsOrders: 1,
      pointsRevenue: 180.5,
      emailed: 5,
      emailsBounced: 1,
      emailsComplained: 0,
      stages: {
        imported: { here: 1, unreachable: 1 },
        emailed: { here: 0, unreachable: 0 },
        clicked: { here: 1, unreachable: 0 },
        signed_up: { here: 0, unreachable: 0 },
        claim_bonus: { here: 2, unreachable: 0 },
        ordered: { here: 1, unreachable: 0 },
      },
    });
  });

  it("reads no row as zeros, so the card stays hidden", () => {
    expect(migrationSummaryFromRow(null)).toEqual({
      imported: 0,
      created: 0,
      matched: 0,
      signedUp: 0,
      signedUpBeforeImport: 0,
      batchesApplied: 0,
      clicked: 0,
      claimBonuses: 0,
      migratedPointsSpent: 0,
      pointsOrders: 0,
      pointsRevenue: 0,
      emailed: 0,
      emailsBounced: 0,
      emailsComplained: 0,
      stages: {
        imported: { here: 0, unreachable: 0 },
        emailed: { here: 0, unreachable: 0 },
        clicked: { here: 0, unreachable: 0 },
        signed_up: { here: 0, unreachable: 0 },
        claim_bonus: { here: 0, unreachable: 0 },
        ordered: { here: 0, unreachable: 0 },
      },
    });
  });
});

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

  it("is a whole percent for the card's Clicked share, and 0 of nobody", () => {
    expect(percentOf(1, 3)).toBe(33);
    expect(percentOf(1, 0)).toBe(0);
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
