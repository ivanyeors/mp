// The Customers list, its Segments, and Customers → Import from Shopify:
// a handful of made-up Customers, some imported from Shopify (one applied
// Import batch), three saved Segments, the Customer overview as a view, and
// `subscribe_migrated_customers` (ADR 0037) worked out from these rows.
// One draft email campaign sends to *Premium buyers* and leaves two Segments
// out (PRD-campaign-audiences slice 06), with the campaign candidates view
// worked out from the same Customers. Every name and email is invented.

// `sizes` and `delivered` (days since the latest purchase arrived; null while
// on its way) feed the purchase filters (PRD-campaign-audiences slice 04).
const PEOPLE = [
  { first: "Aisha", last: "Rahman", tags: ["staff"], stage: "loyal", detail: "repeat_purchases", purchases: 3, bought: ["premium", "mbolster"], sizes: ["M"], delivered: 35, consent: "subscribed", source: "account", imported: false },
  { first: "Ben", last: "Ong", stage: "new", detail: "delivered", purchases: 1, bought: ["premium"], sizes: ["L"], delivered: 10, consent: "not_subscribed", imported: true, said: "no" },
  { first: "Chloe", last: "Tan", stage: "new", detail: "settled", purchases: 1, bought: ["premium"], sizes: ["M"], delivered: 45, consent: "subscribed", source: "shopify_import", imported: true, said: "yes", recent: [3] },
  { first: "Dev", last: "Nair", stage: "at_risk", detail: "lapsed", purchases: 1, bought: ["basic"], sizes: ["S"], delivered: 790, consent: "not_subscribed", imported: true, said: "no" },
  { first: "Elena", last: "Goh", stage: "lead", detail: null, purchases: 0, bought: [], sizes: [], delivered: null, consent: "not_subscribed", imported: true, said: "no" },
  { first: "Farid", last: "Yusof", stage: "lost", detail: null, purchases: 1, bought: ["premium"], sizes: ["XL"], delivered: 200, consent: "unsubscribed", source: "unsubscribe_link", imported: true, said: "no" },
  { first: "Grace", last: "Lee", stage: "loyal", detail: "repeat_purchases", purchases: 2, bought: ["premium", "accessory"], sizes: ["M"], delivered: 50, consent: "not_subscribed", imported: true, said: "no" },
  { first: "Hui Min", last: "Chua", stage: "new", detail: "awaiting_delivery", purchases: 1, bought: ["premium"], sizes: ["S"], delivered: null, consent: "subscribed", source: "checkout", imported: false },
];

const BATCH = "00000000-0000-4000-8000-00000000b001";
const SEGMENT = "00000000-0000-4000-8000-00000000c001";
const STAFF_SEGMENT = "00000000-0000-4000-8000-00000000c002";
const RECENT_SEGMENT = "00000000-0000-4000-8000-00000000c003";
const CAMPAIGN = "00000000-0000-4000-8000-00000000e001";

export default function crm({ now }) {
  const ago = (days) => new Date(now.getTime() - days * 86_400_000).toISOString();
  const customers = PEOPLE.map((p, i) => ({
    id: `00000000-0000-4000-8000-0000000c0${String(i + 1).padStart(3, "0")}`,
    email: `${p.first.toLowerCase().replace(/\s/g, "")}.${p.last.toLowerCase()}@example.com`,
    first_name: p.first,
    last_name: p.last,
    phone: null,
    tags: p.tags ?? [],
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
        {
          id: STAFF_SEGMENT,
          name: "Staff and test accounts",
          filters: { tags: "staff" },
          filters_version: 2,
          created_at: ago(4),
          updated_at: ago(4),
          archived_at: null,
        },
        {
          id: RECENT_SEGMENT,
          name: "Delivered in the last 14 days",
          filters: { delivered: "within:14" },
          filters_version: 2,
          created_at: ago(3),
          updated_at: ago(3),
          archived_at: null,
        },
      ],
      email_campaigns: [
        {
          id: CAMPAIGN,
          name: "December cooling launch",
          subject: "Sleep cooler this December",
          preheader: "Our FibreCool covers are back, in every size.",
          body: "Our FibreCool covers are back in every size, for the warm nights ahead.",
          content: null,
          greeting: true,
          button_label: null,
          button_target: null,
          button_url: null,
          audience: "segment",
          segment_id: SEGMENT,
          exclude_segment_ids: [STAFF_SEGMENT, RECENT_SEGMENT],
          created_by_profile_id: null,
          created_at: ago(2),
          updated_at: ago(1),
          locked_at: null,
          archived_at: null,
        },
      ],
    },
    views: {
      // 20261021100000_email_campaigns.sql: one row per Customer, as a campaign's plan reads them;
      // `marketing_recent` (20261031130000) rests Chloe, emailed 3 days ago.
      marketing_campaign_candidates: (t) =>
        (t.customers ?? []).map((c) => {
          const m = (t.migrated_customers ?? []).find((r) => r.customer_id === c.id);
          const p = PEOPLE.find((x) => c.email.startsWith(`${x.first.toLowerCase().replace(/\s/g, "")}.`));
          return {
            customer_id: c.id,
            email: c.email,
            first_name: c.first_name,
            locale: "en-US",
            marketing_email: c.marketing_email,
            migrated: Boolean(m),
            claimed_at: m?.claimed_at ?? null,
            orders_count: c.total_orders,
            since: m?.imported_at ?? c.created_at,
            suppressed: false,
            campaign_sends: {},
            marketing_recent: (p?.recent ?? []).map(ago),
          };
        }),
      admin_customer_overview: (t) =>
        (t.customers ?? []).map((c) => {
          const i = PEOPLE.findIndex((p) => c.email.startsWith(`${p.first.toLowerCase().replace(/\s/g, "")}.`));
          const p = PEOPLE[i] ?? { stage: "lead", detail: null, purchases: 0, bought: [], sizes: [], delivered: null, imported: false };
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
            pillow_sizes: p.sizes,
            last_delivered_at: p.delivered == null ? null : ago(p.delivered),
            lifecycle_statuses: [p.stage, p.detail].filter(Boolean),
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
