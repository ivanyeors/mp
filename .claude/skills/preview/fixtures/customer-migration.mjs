// The Shopify migration card on the Customers page: the summary view's one
// row, made up. The default is a campaign a few waves in, so every stage of
// the journey has people; `migration-not-started` is the day after the
// import, before any campaign email, with one customer who already had an
// account.
//
// The stages are the furthest each imported customer has reached, and sum to
// `imported`; the fact columns (emailed, clicked, signed_up, claim_bonuses)
// never exceed the stage they belong to plus the stages after it.

const MID_CAMPAIGN = {
  imported: 2140,
  imported_created: 2093,
  imported_matched: 47,
  signed_up: 391,
  signed_up_before_import: 14,
  batches_applied: 1,
  clicked: 596,
  claim_bonuses: 318,
  migrated_points_spent: 61500,
  points_orders: 58,
  points_revenue: 9874.6,
  emailed: 1612,
  emails_bounced: 41,
  emails_complained: 3,
  stage_imported: 512,
  stage_imported_unreachable: 37,
  stage_emailed: 1027,
  stage_emailed_unreachable: 44,
  stage_clicked: 210,
  stage_clicked_unreachable: 2,
  stage_signed_up: 73,
  stage_claim_bonus: 241,
  stage_ordered: 77,
};

const NOT_STARTED = {
  imported: 2140,
  imported_created: 2139,
  imported_matched: 1,
  signed_up: 1,
  signed_up_before_import: 1,
  batches_applied: 1,
  clicked: 0,
  claim_bonuses: 0,
  migrated_points_spent: 0,
  points_orders: 0,
  points_revenue: 0,
  emailed: 0,
  emails_bounced: 0,
  emails_complained: 0,
  stage_imported: 2139,
  stage_imported_unreachable: 0,
  stage_emailed: 0,
  stage_emailed_unreachable: 0,
  stage_clicked: 0,
  stage_clicked_unreachable: 0,
  stage_signed_up: 1,
  stage_claim_bonus: 0,
  stage_ordered: 0,
};

export default function customerMigration({ scenario }) {
  const row = scenario === "migration-not-started" ? NOT_STARTED : MID_CAMPAIGN;
  return {
    views: {
      admin_customer_migration_summary: () => [row],
    },
  };
}
