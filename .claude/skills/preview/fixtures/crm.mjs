// The Customers list, its Segments, and Customers → Import from Shopify:
// a handful of made-up Customers, some imported from Shopify (one applied
// Import batch), one saved Segment, the Customer overview as a view, and
// `subscribe_migrated_customers` (ADR 0037) worked out from these rows.
// Every name and email is invented.

const PEOPLE = [
  { first: "Aisha", last: "Rahman", stage: "loyal", detail: "repeat_purchases", purchases: 3, bought: ["premium", "mbolster"], consent: "subscribed", source: "account", imported: false },
  { first: "Ben", last: "Ong", stage: "new", detail: "delivered", purchases: 1, bought: ["premium"], consent: "not_subscribed", imported: true, said: "no" },
  { first: "Chloe", last: "Tan", stage: "new", detail: "settled", purchases: 1, bought: ["premium"], consent: "subscribed", source: "shopify_import", imported: true, said: "yes" },
  { first: "Dev", last: "Nair", stage: "at_risk", detail: "lapsed", purchases: 1, bought: ["basic"], consent: "not_subscribed", imported: true, said: "no" },
  { first: "Elena", last: "Goh", stage: "lead", detail: null, purchases: 0, bought: [], consent: "not_subscribed", imported: true, said: "no" },
  { first: "Farid", last: "Yusof", stage: "lost", detail: null, purchases: 1, bought: ["premium"], consent: "unsubscribed", source: "unsubscribe_link", imported: true, said: "no" },
  { first: "Grace", last: "Lee", stage: "loyal", detail: "repeat_purchases", purchases: 2, bought: ["premium", "accessory"], consent: "not_subscribed", imported: true, said: "no" },
  { first: "Hui Min", last: "Chua", stage: "new", detail: "awaiting_delivery", purchases: 1, bought: ["premium"], consent: "subscribed", source: "checkout", imported: false },
];

const BATCH = "00000000-0000-4000-8000-00000000b001";
const SEGMENT = "00000000-0000-4000-8000-00000000c001";

export default function crm({ now }) {
  const ago = (days) => new Date(now.getTime() - days * 86_400_000).toISOString();
  const customers = PEOPLE.map((p, i) => ({
    id: `00000000-0000-4000-8000-0000000c0${String(i + 1).padStart(3, "0")}`,
    email: `${p.first.toLowerCase().replace(/\s/g, "")}.${p.last.toLowerCase()}@example.com`,
    first_name: p.first,
    last_name: p.last,
    phone: null,
    tags: [],
    total_orders: p.purchases,
    total_spent: p.purchases * 189,
    marketing_email: p.consent,
    marketing_email_source: p.source ?? null,
    marketing_email_updated_at: p.source ? ago(20 + i) : null,
    created_at: ago(400 - i * 30),
    updated_at: ago(i + 1),
  }));
  const migrated = PEOPLE.flatMap((p, i) =>
    p.imported
      ? [{
          customer_id: customers[i].id,
          batch_id: BATCH,
          created_by_import: true,
          email_marketing_at_export: p.said,
          exported_at: ago(12).slice(0, 10),
          imported_at: ago(11),
          shopify_orders_count: p.purchases,
          shopify_amount_spent: p.purchases * 189,
          claimed_at: null,
        }]
      : [],
  );

  return {
    tables: {
      customers,
      migrated_customers: migrated,
      customer_import_batches: [
        {
          id: BATCH,
          source: "shopify_customers_csv",
          file_name: "customers_export.csv",
          file_sha256: "a".repeat(64),
          rows_total: migrated.length,
          rows_done: migrated.length,
          with_addresses: true,
          created: migrated.length,
          merged: 0,
          already_imported: 0,
          skipped: {},
          applied_at: ago(11),
          rolled_back_at: null,
          created_at: ago(11),
        },
      ],
      customer_segments: [
        {
          id: SEGMENT,
          name: "Premium buyers",
          filters: { bought: "premium" },
          filters_version: 1,
          created_at: ago(5),
          updated_at: ago(5),
          archived_at: null,
        },
      ],
    },
    views: {
      admin_customer_overview: (t) =>
        (t.customers ?? []).map((c) => {
          const i = PEOPLE.findIndex((p) => c.email.startsWith(`${p.first.toLowerCase().replace(/\s/g, "")}.`));
          const p = PEOPLE[i] ?? { stage: "lead", detail: null, purchases: 0, bought: [], imported: false };
          const m = (t.migrated_customers ?? []).find((r) => r.customer_id === c.id);
          return {
            ...c,
            has_account: false,
            account_linked_at: null,
            account_last_seen_at: null,
            from_shopify: Boolean(m),
            created_by_import: m?.created_by_import ?? null,
            imported_at: m?.imported_at ?? null,
            claimed_at: null,
            shopify_orders_count: m?.shopify_orders_count ?? null,
            shopify_amount_spent: m?.shopify_amount_spent ?? null,
            account_providers: [],
            has_phone: false,
            phone_valid: false,
            claim_link_first_clicked_at: null,
            points_available: 0,
            claim_bonus_at: null,
            open_followups: 0,
            paid_orders: p.purchases,
            first_paid_at: p.purchases ? ago(300) : null,
            last_paid_at: p.purchases ? ago(p.stage === "at_risk" ? 800 : 40) : null,
            bought: p.bought,
            last_readjusted_at: null,
            search_text: `${c.first_name} ${c.last_name} ${c.email}`.toLowerCase(),
            review_requested_at: null,
            review_link_clicked_at: null,
            google_review_rating: null,
            google_reviewed_at: null,
            shop_reviews_count: 0,
            shop_review_avg_rating: null,
            review_rating: null,
            last_campaign_sent_at: null,
            purchases: p.purchases,
            last_purchase_at: p.purchases ? ago(p.stage === "at_risk" ? 800 : 40) : null,
            lifecycle_stage: p.stage,
            lifecycle_detail: p.detail,
            lifecycle_undated: false,
            attended_bookings: 0,
          };
        }),
    },
    rpc: {
      // 20261031090000_consent_by_default.sql, counting only.
      subscribe_migrated_customers: ({ p_unsubscribed = [] }, { tables }) => {
        const list = new Set(p_unsubscribed.map((e) => String(e).trim().toLowerCase()).filter(Boolean));
        const byId = new Map((tables.customers ?? []).map((c) => [c.id, c]));
        const imported = (tables.migrated_customers ?? []).map((m) => byId.get(m.customer_id)).filter(Boolean);
        const listed = (tables.customers ?? []).filter((c) => list.has(c.email.toLowerCase()));
        return {
          imported: imported.length,
          already_subscribed: imported.filter((c) => c.marketing_email === "subscribed" && !list.has(c.email)).length,
          to_subscribe: imported.filter((c) => c.marketing_email === "not_subscribed" && !list.has(c.email)).length,
          stay_unsubscribed: imported.filter((c) => c.marketing_email === "unsubscribed").length,
          listed: list.size,
          listed_customers: listed.length,
          to_unsubscribe: listed.filter((c) => c.marketing_email !== "unsubscribed" && c.marketing_email_source !== "account").length,
        };
      },
    },
  };
}
