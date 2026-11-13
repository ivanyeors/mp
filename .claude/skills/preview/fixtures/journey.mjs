// Sample Visits for Admin Panel → Analytics → Visits by channel, and for the
// "How they found us" card on a Customer. Every Visitor, Visit and click id is
// made up, seeded so each run draws the same tables. Dates are the last 120
// days, so the default three-month range is full.
//
// Converted Visits name Orders from fixtures/analytics.mjs (`ord_0052` on are
// its last three months), so the funnel's revenue is those Orders' totals.
//
// Scenarios: "empty-sales" has no Orders, so no Visit converts. "entry-told"
// adds a Result on which the sample Customer said how they heard of us.

import { POINTS_CUSTOMER } from "./points.mjs";

function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// weight, the Entry source fields a Visit from there carries, share that open a
// configurator, share that pay.
const SOURCES = [
  [22, { entry_source: "www.google.com", referrer_host: "www.google.com" }, 0.3, 0.03],
  [9, { entry_source: "www.google.com", referrer_host: "www.google.com", entry_click_id_kind: "gclid" }, 0.42, 0.05],
  [20, { entry_source: "Direct" }, 0.22, 0.035],
  [8, { entry_source: "l.instagram.com", referrer_host: "l.instagram.com", entry_app: "instagram", entry_click_id_kind: "fbclid" }, 0.26, 0.012],
  [7, { entry_source: "ig", entry_medium: "paid_social", entry_campaign: "neck-pain-nov", entry_app: "instagram", entry_click_id_kind: "fbclid" }, 0.4, 0.03],
  [5, { entry_source: "Direct", entry_app: "instagram" }, 0.2, 0.01],
  [4, { entry_source: "lm.facebook.com", referrer_host: "lm.facebook.com", entry_app: "facebook", entry_click_id_kind: "fbclid" }, 0.2, 0.015],
  [3, { entry_source: "facebook", entry_medium: "paid_social", entry_campaign: "neck-pain-nov", entry_click_id_kind: "fbclid" }, 0.33, 0.025],
  [6, { entry_source: "Direct", entry_app: "tiktok" }, 0.18, 0.006],
  [3, { entry_source: "Direct", entry_app: "tiktok", entry_click_id_kind: "ttclid" }, 0.3, 0.02],
  [4, { entry_source: "chatgpt.com", referrer_host: "chatgpt.com" }, 0.45, 0.05],
  [1, { entry_source: "www.perplexity.ai", referrer_host: "www.perplexity.ai" }, 0.4, 0.03],
  [4, { entry_source: "email_campaign", entry_medium: "email", entry_campaign: "november-news" }, 0.35, 0.06],
  [2, { entry_source: "honeycombers.com", referrer_host: "honeycombers.com" }, 0.3, 0.02],
  [1, { entry_source: "www.youtube.com", referrer_host: "www.youtube.com" }, 0.2, 0.01],
  [1, { entry_source: "www.bing.com", referrer_host: "www.bing.com" }, 0.3, 0.02],
];
const LANDINGS = ["/", "/", "/mp-config", "/shop", "/blog/how-to-choose-a-pillow", "/mbolster-config"];
const TOTAL_WEIGHT = SOURCES.reduce((t, [w]) => t + w, 0);

const uuid = (kind, n) => `00000000-0000-4000-${kind}-${String(n).padStart(12, "0")}`;

export default function journey({ scenario, now }) {
  const r = rng(113);
  const ago = (days) => new Date(now.getTime() - days * 86400e3).toISOString();
  const pick = () => {
    let x = r() * TOTAL_WEIGHT;
    for (const s of SOURCES) if ((x -= s[0]) < 0) return s;
    return SOURCES[0];
  };
  const blank = {
    entry_medium: null,
    entry_campaign: null,
    referrer_host: null,
    entry_content: null,
    entry_term: null,
    entry_click_id_kind: null,
    entry_click_id: null,
    entry_app: null,
    country: "SG",
    ended_at: null,
    drop_off_path: null,
    drop_off_section: null,
    converted_order_id: null,
  };

  const analytics_visitors = [];
  const analytics_visits = [];
  const analytics_events = [];
  let nextOrder = 52;
  let event = 1;
  const addVisit = (id, visitorId, days, fields, landing, configurator) => {
    const started_at = ago(days);
    analytics_visits.push({ ...blank, id, visitor_id: visitorId, started_at, landing_path: landing, ...fields });
    const view = (path) =>
      analytics_events.push({ id: uuid("e000", event++), visit_id: id, visitor_id: visitorId, type: "page_view", path, section_id: null, occurred_at: started_at });
    view(landing);
    if (configurator && !/config/.test(landing)) view("/mp-config");
  };

  for (let n = 1; n <= 1400; n++) {
    const [, fields, toConfigurator, toOrder] = pick();
    const visitorId = uuid("a000", n);
    const days = r() * 120;
    const landing = LANDINGS[Math.floor(r() * LANDINGS.length)];
    const pays = scenario !== "empty-sales" && days < 85 && nextOrder <= 147 && r() < toOrder;
    const converted_order_id = pays ? `ord_${String(nextOrder++).padStart(4, "0")}` : null;
    analytics_visitors.push({
      id: visitorId,
      ga_client_id: null,
      customer_id: null,
      email: pays ? `customer${n}@example.com` : null,
      created_at: ago(days),
      merged_at: pays ? ago(days) : null,
    });
    // Two in five buyers had come before, from somewhere else: their first touch.
    if (pays && r() < 0.4) {
      const [, earlier] = pick();
      addVisit(uuid("b100", n), visitorId, days + 3 + r() * 30, earlier, "/", false);
    }
    addVisit(uuid("b000", n), visitorId, days, { ...fields, converted_order_id }, landing, pays || r() < toConfigurator);
  }

  // The sample Customer (fixtures/points.mjs): found us through an Instagram ad
  // in the app's browser, came back on a laptop from a Google search and bought.
  const app = uuid("a000", 9001);
  const laptop = uuid("a000", 9002);
  analytics_visitors.push(
    { id: app, ga_client_id: null, customer_id: null, email: "mei.tan@example.test", created_at: ago(64), merged_at: ago(64) },
    { id: laptop, ga_client_id: null, customer_id: POINTS_CUSTOMER, email: "mei.tan@example.test", created_at: ago(61), merged_at: ago(30) },
  );
  addVisit(uuid("b000", 9001), app, 64, { entry_source: "ig", entry_medium: "paid_social", entry_campaign: "neck-pain-sep", entry_app: "instagram", entry_click_id_kind: "fbclid" }, "/mp-config", true);
  addVisit(uuid("b000", 9002), laptop, 61, { entry_source: "Direct" }, "/", false);
  addVisit(uuid("b000", 9003), laptop, 30, { entry_source: "www.google.com", referrer_host: "www.google.com", converted_order_id: "pts-order-m1" }, "/shop", true);
  addVisit(uuid("b000", 9004), laptop, 9, { entry_source: "email_campaign", entry_medium: "email", entry_campaign: "november-news" }, "/shop", false);

  const tables = { analytics_visitors, analytics_visits, analytics_events };
  if (scenario === "entry-told") {
    tables.mp_config_responses = [
      {
        id: uuid("c000", 1),
        data: { name: "Mei Tan" },
        is_final: true,
        status: "cancelled",
        source: "online_purchase",
        product_type: "pillow",
        customer_id: POINTS_CUSTOMER,
        customer_email: "mei.tan@example.test",
        discovery_source: "friend-family",
        discovery_source_other: null,
        created_at: ago(64),
        updated_at: ago(64),
      },
    ];
  }
  return { tables };
}
