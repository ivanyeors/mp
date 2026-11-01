// The Customers list, its Segments, and Customers → Import from Shopify:
// a handful of made-up Customers, some imported from Shopify (one applied
// Import batch), three saved Segments, the Customer overview as a view, and
// `subscribe_migrated_customers` (ADR 0039) worked out from these rows.
// One draft email campaign sends to *Premium buyers* and leaves two Segments
// out (PRD-campaign-audiences slice 06), with the campaign candidates view
// worked out from the same Customers; another, *Pillow check-up*, says *Your
// pillow* and offers the studio and an Mbolster, for slice 09's fit checks.
// *November care tips* has about 600 made-up sends, each with a stage at send
// and a seeded click and purchase, and a holdout on for six days (slice 11's
// Results tab). Every name and email is invented.

// `sizes` and `delivered` (days since the latest purchase arrived; null while
// on its way) feed the purchase filters (PRD-campaign-audiences slice 04).
// `ship` (ISO-2, null for Unknown) and `lang` feed the reach filters (slice 05);
// `points` is their balance.
const PEOPLE = [
  { first: "Aisha", last: "Rahman", tags: ["staff"], stage: "loyal", detail: "repeat_purchases", purchases: 3, bought: ["premium", "mbolster"], sizes: ["M"], delivered: 35, consent: "subscribed", source: "account", imported: false, ship: "SG", points: 1200 },
  { first: "Ben", last: "Ong", stage: "new", detail: "delivered", purchases: 1, bought: ["premium"], sizes: ["L"], delivered: 10, consent: "not_subscribed", imported: true, said: "no", ship: "SG" },
  { first: "Chloe", last: "Tan", stage: "new", detail: "settled", purchases: 1, bought: ["premium"], sizes: ["M"], delivered: 45, consent: "subscribed", source: "shopify_import", imported: true, said: "yes", recent: [3], ship: "SG" },
  { first: "Dev", last: "Nair", stage: "at_risk", detail: "lapsed", purchases: 1, bought: ["basic"], sizes: ["S"], delivered: 790, consent: "not_subscribed", imported: true, said: "no", ship: "MY", lang: "zh-CN" },
  { first: "Elena", last: "Goh", stage: "lead", detail: null, purchases: 0, bought: [], sizes: [], delivered: null, consent: "not_subscribed", imported: true, said: "no", ship: null },
  { first: "Farid", last: "Yusof", stage: "lost", detail: null, purchases: 1, bought: ["premium"], sizes: ["XL"], delivered: 200, consent: "unsubscribed", source: "unsubscribe_link", imported: true, said: "no", ship: "SG" },
  { first: "Grace", last: "Lee", stage: "loyal", detail: "repeat_purchases", purchases: 2, bought: ["premium", "accessory"], sizes: ["M"], delivered: 50, consent: "not_subscribed", imported: true, said: "no", ship: null },
  { first: "Hui Min", last: "Chua", stage: "new", detail: "awaiting_delivery", purchases: 1, bought: ["premium"], sizes: ["S"], delivered: null, consent: "subscribed", source: "checkout", imported: false, ship: "SG", lang: "zh-CN" },
  // Slice 09's fit checks: Jun ships to Malaysia and bought 9 days ago; Kavya's country is unknown, and she has no pillow here.
  { first: "Jun", last: "Wei", stage: "new", detail: "delivered", purchases: 1, bought: ["basic"], sizes: ["M"], delivered: 3, consent: "subscribed", source: "checkout", imported: false, ship: "MY", lastBought: 9 },
  { first: "Kavya", last: "Iyer", stage: "lead", detail: null, purchases: 0, bought: [], sizes: [], delivered: null, consent: "subscribed", source: "account", imported: false, ship: null },
  // Slice 12: Lapsed and subscribed, and clicked none of her last six campaigns. Stated, not drawn
  // from six made-up campaigns, so the campaign list stays as it was.
  { first: "Lina", last: "Koh", stage: "at_risk", detail: "lapsed", purchases: 1, bought: ["premium"], sizes: ["M"], delivered: 900, consent: "subscribed", source: "shopify_import", imported: true, said: "yes", ship: "SG", unengaged: true },
];

const BATCH = "00000000-0000-4000-8000-00000000b001";
const SEGMENT = "00000000-0000-4000-8000-00000000c001";
const STAFF_SEGMENT = "00000000-0000-4000-8000-00000000c002";
const RECENT_SEGMENT = "00000000-0000-4000-8000-00000000c003";
const CAMPAIGN = "00000000-0000-4000-8000-00000000e001";
// A campaign already sent (PRD-campaign-audiences slice 08): Chloe clicked it, Farid left from its link.
const SENT_CAMPAIGN = "00000000-0000-4000-8000-00000000e002";
// A block campaign that says *Your pillow* and offers the studio and an Mbolster (slice 09's fit checks).
const CHECKUP_CAMPAIGN = "00000000-0000-4000-8000-00000000e003";
// Slice 10: *November care tips* keeps sending (three went today); *Second purchase* the daily run paused.
const SECOND_CAMPAIGN = "00000000-0000-4000-8000-00000000e004";
const OFF = { keep_sending: false, keep_sending_daily_cap: 20, keep_sending_paused_at: null, keep_sending_paused_reason: null, keep_sending_segments: null, holdout_at: null };

/** A seeded generator, so every run draws the same sample results. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Slice 11: *November care tips*'s made-up sends, to made-up Customer ids (no
 * Customer row: the Results tab counts the ledger), and what each did next.
 * w1 went 45 days ago (its 30 days are over), w2 12 days ago, then a daily
 * Wave on each of the last five days, the holdout keeping two back from each.
 */
function resultSends(ago) {
  const draw = rng(11);
  const stageOf = (r) => (r < 0.35 ? "lead" : r < 0.65 ? "new" : r < 0.85 ? "loyal" : "at_risk");
  const sgDate = (days) => new Date(Date.parse(ago(days)) + 8 * 3_600_000).toISOString().slice(0, 10);
  const plan = [
    ...Array.from({ length: 240 }, () => ({ wave: "w1", days: 45, held: false })),
    ...Array.from({ length: 260 }, () => ({ wave: "w2", days: 12, held: false })),
    ...[5, 4, 3, 2, 1].flatMap((d) =>
      Array.from({ length: 20 }, (_, k) => ({ wave: `daily-${sgDate(d)}`, days: d - 0.01 * k, held: k % 10 === 4 })),
    ),
  ];
  const outcomes = new Map();
  const rows = plan.map((x, n) => {
    const id = `00000000-0000-4000-8000-0000000a${String(n + 1).padStart(4, "0")}`;
    const stage = stageOf(draw());
    const clicked = !x.held && draw() < (stage === "loyal" ? 0.2 : 0.12);
    const buyRate = { lead: 0.02, new: 0.04, loyal: 0.08, at_risk: 0.03 }[stage] * (x.held ? 0.7 : 1) * (clicked ? 2.5 : 1);
    const bought = draw() < buyRate;
    outcomes.set(id, {
      bought,
      spent: bought ? Math.round(150 + draw() * 300) : 0,
      afterClick: bought && clicked,
      unsubscribed: !x.held && !clicked && draw() < 0.01,
    });
    return {
      id,
      customer_id: `00000000-0000-4000-8000-0000000d${String(n + 1).padStart(4, "0")}`,
      template: `campaign:${SENT_CAMPAIGN}`,
      campaign_id: SENT_CAMPAIGN,
      wave: x.wave,
      status: x.held ? "held_out" : "sent",
      provider_message_id: x.held ? null : `re_result_${n}`,
      sent_at: ago(x.days),
      attempts: 1,
      last_error: null,
      bounced_at: null,
      complained_at: !x.held && n === 77 ? ago(x.days - 0.5) : null,
      click_token_hash: null,
      first_clicked_at: clicked ? ago(x.days - 0.2) : null,
      clicks: clicked ? 1 : 0,
      stage_at_send: stage,
    };
  });
  return { rows, outcomes };
}

/** `email_campaign_send_outcomes`, from the ledger and the sample outcomes: one row per send that went or was held out. */
function outcomesOf(t, outcomes) {
  const left = new Set(
    (t.customer_consent_events ?? []).filter((ev) => ev.to_state === "unsubscribed" && ev.source === "unsubscribe_link").map((ev) => ev.campaign_send_id),
  );
  const monthAgo = Date.now() - 30 * 86_400_000;
  return (t.customer_campaign_sends ?? [])
    .filter((s) => s.campaign_id && ["sent", "bounced", "complained", "held_out"].includes(s.status))
    .map((s) => {
      const o = outcomes.get(s.id) ?? { bought: false, spent: 0, afterClick: false, unsubscribed: false };
      return {
        send_id: s.id,
        campaign_id: s.campaign_id,
        held_out: s.status === "held_out",
        stage_at_send: s.stage_at_send ?? null,
        sent_at: s.sent_at,
        clicked: Boolean(s.first_clicked_at),
        complained: Boolean(s.complained_at),
        unsubscribed: left.has(s.id) || o.unsubscribed,
        synthetic_left: o.unsubscribed,
        purchases: o.bought ? 1 : 0,
        spent: o.spent,
        bought_after_click: o.afterClick,
        counting: Date.parse(s.sent_at) > monthAgo,
      };
    });
}

/** When they last bought, in days, or null: as the overview's `last_purchase_at`. */
const lastBoughtDays = (p) => (p.purchases ? (p.lastBought ?? (p.stage === "at_risk" ? 800 : 40)) : null);

export default function crm({ now }) {
  const ago = (days) => new Date(now.getTime() - days * 86_400_000).toISOString();
  // Today's kept-sending Wave, as the daily job labels it: Singapore's date.
  const keptToday = `daily-${new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10)}`;
  const results = resultSends(ago);
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
          ...OFF,
        },
        {
          id: SENT_CAMPAIGN,
          name: "November care tips",
          subject: "Three ways to keep your pillow fresh",
          preheader: "Washing, airing and when to re-adjust.",
          body: "Washing, airing and when to re-adjust: three short tips for your pillow.",
          content: null,
          greeting: true,
          button_label: null,
          button_target: null,
          button_url: null,
          audience: "subscribed",
          segment_id: null,
          exclude_segment_ids: [],
          created_by_profile_id: null,
          created_at: ago(48),
          updated_at: ago(46),
          locked_at: ago(46),
          archived_at: null,
          ...OFF,
          keep_sending: true,
          // Slice 11: holding 10% out since six days ago.
          holdout_at: ago(6),
        },
        {
          id: SECOND_CAMPAIGN,
          name: "Second purchase",
          subject: "Pair your pillow with an Mbolster",
          preheader: "Made to match the pillow you sleep on.",
          body: "Your pillow has had two months to settle. An Mbolster made to match it supports your back and knees.",
          content: null,
          greeting: true,
          button_label: null,
          button_target: null,
          button_url: null,
          audience: "segment",
          segment_id: SEGMENT,
          exclude_segment_ids: [STAFF_SEGMENT],
          created_by_profile_id: null,
          created_at: ago(12),
          updated_at: ago(1),
          locked_at: ago(10),
          archived_at: null,
          ...OFF,
          keep_sending: true,
          keep_sending_daily_cap: 10,
          keep_sending_paused_at: ago(0.2),
          keep_sending_paused_reason: "its Segment “Premium buyers” changed since keep sending was turned on",
          keep_sending_segments: { [SEGMENT]: { filters: { bought: "premium" }, filters_version: 2 } },
        },
        {
          id: CHECKUP_CAMPAIGN,
          name: "Pillow check-up",
          subject: "A check-up for {your_pillow}",
          preheader: "A free re-adjustment, at the studio.",
          body: "",
          content: {
            v: 1,
            blocks: [
              { id: "title", type: "heading", level: 1, text: "A check-up for {your_pillow}" },
              {
                id: "words",
                type: "text",
                paragraphs: [
                  {
                    kind: "p",
                    runs: [{ text: "Pillows settle over the first months. Come in for a free re-adjustment at the studio, and we will set it to how you sleep now." }],
                  },
                ],
              },
              {
                id: "book",
                type: "buttons",
                buttons: [
                  { label: "Book a fitting", target: "book_fitting", style: "primary" },
                  { label: "Pair it with an Mbolster", target: "customise_mbolster", style: "secondary" },
                ],
              },
            ],
            fallbacks: {},
          },
          greeting: true,
          button_label: null,
          button_target: null,
          button_url: null,
          audience: "subscribed",
          segment_id: null,
          exclude_segment_ids: [],
          created_by_profile_id: null,
          created_at: ago(1),
          updated_at: ago(1),
          locked_at: null,
          archived_at: null,
          ...OFF,
        },
      ],
      customer_campaign_sends: [
        {
          id: "00000000-0000-4000-8000-00000000f001",
          customer_id: customers[5].id,
          template: `campaign:${SENT_CAMPAIGN}`,
          campaign_id: SENT_CAMPAIGN,
          wave: "w1",
          status: "sent",
          provider_message_id: "re_sample_1",
          sent_at: ago(45),
          stage_at_send: "new",
          attempts: 1,
          last_error: null,
          bounced_at: null,
          complained_at: null,
          click_token_hash: "b".repeat(64),
          first_clicked_at: null,
          clicks: 0,
        },
        {
          id: "00000000-0000-4000-8000-00000000f002",
          customer_id: customers[2].id,
          template: `campaign:${SENT_CAMPAIGN}`,
          campaign_id: SENT_CAMPAIGN,
          wave: "w2",
          status: "sent",
          provider_message_id: "re_sample_2",
          sent_at: ago(3),
          stage_at_send: "new",
          attempts: 1,
          last_error: null,
          bounced_at: null,
          complained_at: null,
          click_token_hash: "c".repeat(64),
          first_clicked_at: ago(2.9),
          clicks: 2,
        },
        // Slice 10: today's kept-sending Wave of *November care tips*, and *Second purchase*'s first wave.
        ...[0, 1, 3].map((i, n) => ({
          id: `00000000-0000-4000-8000-00000000f1${String(n).padStart(2, "0")}`,
          customer_id: customers[i].id,
          template: `campaign:${SENT_CAMPAIGN}`,
          campaign_id: SENT_CAMPAIGN,
          wave: keptToday,
          status: "sent",
          provider_message_id: `re_kept_${n}`,
          sent_at: ago(0.01),
          stage_at_send: ["loyal", "new", "at_risk"][n],
          attempts: 1,
          last_error: null,
          bounced_at: null,
          complained_at: null,
          click_token_hash: String(n).repeat(64),
          first_clicked_at: null,
          clicks: 0,
        })),
        ...[4, 6].map((i, n) => ({
          id: `00000000-0000-4000-8000-00000000f2${String(n).padStart(2, "0")}`,
          customer_id: customers[i].id,
          template: `campaign:${SECOND_CAMPAIGN}`,
          campaign_id: SECOND_CAMPAIGN,
          wave: "w1",
          status: "sent",
          provider_message_id: `re_second_${n}`,
          sent_at: ago(10),
          stage_at_send: ["lead", "loyal"][n],
          attempts: 1,
          last_error: null,
          bounced_at: null,
          complained_at: null,
          click_token_hash: String(n + 5).repeat(64),
          first_clicked_at: null,
          clicks: 0,
        })),
        ...results.rows,
      ],
      customer_consent_events: [
        {
          id: 1,
          customer_id: customers[5].id,
          channel: "email",
          from_state: "subscribed",
          to_state: "unsubscribed",
          source: "unsubscribe_link",
          created_at: customers[5].marketing_email_updated_at,
          campaign_send_id: "00000000-0000-4000-8000-00000000f001",
        },
      ],
    },
    views: {
      // 20261021100000_email_campaigns.sql: one row per Customer, as a campaign's plan reads them;
      // `marketing_recent` (20261031144935) rests Chloe, emailed 3 days ago.
      marketing_campaign_candidates: (t) =>
        (t.customers ?? []).map((c) => {
          const m = (t.migrated_customers ?? []).find((r) => r.customer_id === c.id);
          const p = PEOPLE.find((x) => c.email.startsWith(`${x.first.toLowerCase().replace(/\s/g, "")}.`));
          return {
            customer_id: c.id,
            email: c.email,
            first_name: c.first_name,
            locale: p?.lang ?? "en-US",
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
      // Each wave of each campaign email, as the pause rule and the Waves table read them.
      customer_campaign_wave_stats: (t) => {
        const groups = new Map();
        for (const s of t.customer_campaign_sends ?? []) {
          const key = `${s.template}\u0000${s.wave}`;
          groups.set(key, [...(groups.get(key) ?? []), s]);
        }
        return [...groups.values()].map((rows) => {
          const handed = rows.filter((s) => ["sent", "bounced", "complained"].includes(s.status));
          return {
            template: rows[0].template,
            wave: rows[0].wave,
            handed: handed.length,
            bounced: rows.filter((s) => s.bounced_at).length,
            complained: rows.filter((s) => s.complained_at).length,
            failed: rows.filter((s) => s.status === "failed").length,
            pending: rows.filter((s) => s.status === "pending").length,
            last_sent_at: handed.map((s) => s.sent_at).sort().at(-1) ?? null,
            held_out: rows.filter((s) => s.status === "held_out").length,
          };
        });
      },
      // 20261031162653: each campaign's numbers, with purchases after it and the held out.
      email_campaign_stats: (t) =>
        (t.email_campaigns ?? []).map((e) => {
          const sends = (t.customer_campaign_sends ?? []).filter((s) => s.campaign_id === e.id);
          const handed = sends.filter((s) => ["sent", "bounced", "complained"].includes(s.status));
          const ids = new Set(sends.map((s) => s.id));
          const left = (t.customer_consent_events ?? []).filter(
            (ev) => ids.has(ev.campaign_send_id) && ev.to_state === "unsubscribed" && ev.source === "unsubscribe_link",
          );
          const out = outcomesOf(t, results.outcomes).filter((o) => o.campaign_id === e.id && !o.held_out);
          return {
            campaign_id: e.id,
            handed: handed.length,
            bounced: sends.filter((s) => s.bounced_at).length,
            complained: sends.filter((s) => s.complained_at).length,
            failed: sends.filter((s) => s.status === "failed").length,
            pending: sends.filter((s) => s.status === "pending").length,
            waves: new Set(sends.map((s) => s.wave)).size,
            first_sent_at: handed.map((s) => s.sent_at).sort()[0] ?? null,
            last_sent_at: handed.map((s) => s.sent_at).sort().at(-1) ?? null,
            link_clicks: 0,
            clicked: sends.filter((s) => s.first_clicked_at).length,
            clicks: sends.reduce((n, s) => n + (s.clicks ?? 0), 0),
            unsubscribed: new Set(left.map((ev) => ev.customer_id)).size + out.filter((o) => o.synthetic_left).length,
            bought: out.filter((o) => o.purchases > 0).length,
            bought_after_click: out.filter((o) => o.bought_after_click).length,
            bought_total: out.reduce((n, o) => n + o.spent, 0),
            counting: out.filter((o) => o.counting).length,
            held_out: sends.filter((s) => s.status === "held_out").length,
          };
        }),
      // 20261031162653: by cohort and stage at send.
      email_campaign_stage_results: (t) => {
        const out = outcomesOf(t, results.outcomes);
        const since = new Map();
        for (const o of out) if (o.held_out && (!since.has(o.campaign_id) || o.sent_at < since.get(o.campaign_id))) since.set(o.campaign_id, o.sent_at);
        const tagged = [
          ...out.map((o) => ({ ...o, cohort: o.held_out ? "held_out" : "sent" })),
          ...out.filter((o) => !o.held_out && since.has(o.campaign_id) && o.sent_at >= since.get(o.campaign_id)).map((o) => ({ ...o, cohort: "sent_since_holdout" })),
        ];
        const groups = new Map();
        for (const o of tagged) {
          const key = `${o.campaign_id}|${o.cohort}|${o.stage_at_send ?? "unknown"}`;
          groups.set(key, [...(groups.get(key) ?? []), o]);
        }
        return [...groups.entries()].map(([key, rows]) => {
          const [campaign_id, cohort, stage] = key.split("|");
          return {
            campaign_id,
            cohort,
            stage,
            people: rows.length,
            clicked: rows.filter((o) => o.clicked).length,
            unsubscribed: rows.filter((o) => o.unsubscribed).length,
            complained: rows.filter((o) => o.complained).length,
            bought: rows.filter((o) => o.purchases > 0).length,
            bought_after_click: rows.filter((o) => o.bought_after_click).length,
            bought_total: rows.reduce((n, o) => n + o.spent, 0),
            counting: rows.filter((o) => o.counting).length,
          };
        });
      },
      // 20261031144619: each pillow line, for *Your pillow* (slice 09): one a Customer, of their Tier and first size.
      customer_purchase_lines: (t) =>
        (t.customers ?? []).flatMap((c) => {
          const p = PEOPLE.find((x) => c.email.startsWith(`${x.first.toLowerCase().replace(/\s/g, "")}.`));
          const tier = p?.bought.find((b) => b === "premium" || b === "basic");
          if (!p || !tier) return [];
          return [
            {
              customer_id: c.id,
              order_id: `${c.id.slice(0, -3)}0d1`,
              order_item_id: `${c.id.slice(0, -3)}1d1`,
              paid_at: ago(lastBoughtDays(p) ?? 40),
              product_type: "pillow",
              tier,
              size: p.sizes[0] ?? null,
            },
          ];
        }),
      admin_customer_overview: (t) =>
        (t.customers ?? []).map((c) => {
          const i = PEOPLE.findIndex((p) => c.email.startsWith(`${p.first.toLowerCase().replace(/\s/g, "")}.`));
          const p = PEOPLE[i] ?? { stage: "lead", detail: null, purchases: 0, bought: [], sizes: [], delivered: null, imported: false };
          const m = (t.migrated_customers ?? []).find((r) => r.customer_id === c.id);
          const sent = (t.customer_campaign_sends ?? []).filter(
            (x) => x.customer_id === c.id && x.campaign_id && ["sent", "bounced", "complained"].includes(x.status),
          );
          const lastSent = sent.map((x) => x.sent_at).sort().at(-1) ?? null;
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
            points_available: p.points ?? 0,
            claim_bonus_at: null,
            open_followups: 0,
            paid_orders: p.purchases,
            first_paid_at: p.purchases ? ago(300) : null,
            last_paid_at: p.purchases ? ago(lastBoughtDays(p)) : null,
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
            last_campaign_sent_at: lastSent,
            purchases: p.purchases,
            last_purchase_at: p.purchases ? ago(lastBoughtDays(p)) : null,
            lifecycle_stage: p.stage,
            lifecycle_detail: p.detail,
            lifecycle_undated: false,
            attended_bookings: 0,
            pillow_sizes: p.sizes,
            last_delivered_at: p.delivered == null ? null : ago(p.delivered),
            lifecycle_statuses: [p.stage, p.detail].filter(Boolean),
            // Slice 05: where they are, what they read, and what campaigns reached them.
            ship_country: p.ship ?? null,
            locale: p.lang ?? "en-US",
            campaigns_sent: [...new Set(sent.map((x) => x.campaign_id))],
            campaigns_clicked: [...new Set(sent.filter((x) => x.first_clicked_at).map((x) => x.campaign_id))],
            last_emailed_at: lastSent ?? "-infinity",
            // Slice 12: the sunset rule's answer, stated per person above.
            unengaged: p.unengaged === true,
          };
        }),
    },
    rpc: {
      // 20261031144524_consent_by_default.sql, counting only.
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
