// Results the Rules Engine can and cannot evaluate. The published Premium graph
// reads the three sleep answers, as production's has since v2/v4 (Oct 2026), so
// a Result saved without them shows its detail page with no suggestion and the
// answers it lacks. Every person and answer here is made up.

const SHOULDER_BANDS = [
  { id: "b-xs", minCm: null, maxCm: 36.01, label: "XS" },
  { id: "b-s", minCm: 36.01, maxCm: 40.01, label: "S" },
  { id: "b-m", minCm: 40.01, maxCm: 46.01, label: "M" },
  { id: "b-l", minCm: 46.01, maxCm: 52.01, label: "L" },
  { id: "b-xl", minCm: 52.01, maxCm: null, label: "XL" },
];

function premiumGraph() {
  const nodes = [
    { id: "in-shoulder", type: "input", inputKey: "shoulder_length_cm" },
    { id: "rng-shoulder", type: "range", inputKey: "shoulder_length_cm", bands: SHOULDER_BANDS },
    { id: "in-sleep", type: "input", inputKey: "sleep_position" },
    { id: "in-pain", type: "input", inputKey: "sleep_pain_areas" },
    { id: "in-bolster", type: "input", inputKey: "uses_bolster" },
    { id: "fb", type: "fallback", size: "M", templateId: null },
  ];
  const edges = [{ id: "e-in-sh", source: "in-shoulder", target: "rng-shoulder" }];
  for (const band of SHOULDER_BANDS) {
    nodes.push({ id: `sz-${band.label}`, type: "size-output", size: band.label });
    edges.push({ id: `e-sh-${band.label}`, source: "rng-shoulder", target: `sz-${band.label}`, handle: band.id });
  }
  return { nodes, edges };
}

// A custom mix laid out in the x-ray (made up), for the Results that carry their
// own Filling configuration: 55 6D L, 70 3D Round S, 67 6D S, 73 6D Fold S,
// 62 Cervical Neck Support M, 69 3D S (the catalog's Items, fixtures/analytics.mjs).
function savedMix(resultId) {
  const cell = (section, subSection, items, order) =>
    items.map((itemId, row) => ({
      result_id: resultId,
      section,
      sub_section: subSection,
      slot: row + 1,
      item_id: itemId,
      qty: 1,
      row_index: row,
      insert_order: order + (items.length - 1 - row),
      offset_x_mm: null,
      offset_y_mm: null,
    }));
  return [
    ...cell("left", "front", [55], 1),
    ...cell("left", "middle", [55, 70], 2),
    ...cell("left", "back", [70], 4),
    ...cell("center", "front", [67], 5),
    ...cell("center", "middle", [67, 73, 62], 6),
    ...cell("center", "back", [69, 67], 9),
    ...cell("right", "front", [55], 11),
    ...cell("right", "middle", [55, 70], 12),
    ...cell("right", "back", [70], 14),
  ];
}

export default function results({ now }) {
  const at = (hoursAgo) => new Date(now.getTime() - hoursAgo * 3_600_000).toISOString();
  const answersBase = {
    gender: "female",
    ageGroup: "35-44",
    bedFirmness: "medium-soft",
    acidReflux: "no",
    earDiscomfortSideSleep: "no",
    bloodPressureLevel: "normal",
    shoulderLength: "43.18",
    neckToBack: "10.16",
    headToBack: "20.32",
    neckLength: "8.89",
    notes: "",
  };
  return {
    tables: {
      // Made-up MSRPs for the two Results' sizes, so the Assignment card can price
      // them. Premium M and L are pillow_products 8 and 9 in analytics.mjs.
      product_prices: [
        { key: "product:pillow:8:linen", kind: "pillow", product_id: 8, variant: "linen", msrp: 320, currency: "SGD" },
        { key: "product:pillow:9:linen", kind: "pillow", product_id: 9, variant: "linen", msrp: 340, currency: "SGD" },
      ],
      rule_graphs: [
        {
          id: "00000000-0000-4000-b100-000000000001",
          flow: "premium-mpillow",
          version: 4,
          status: "published",
          graph: premiumGraph(),
          created_at: at(24 * 12),
          updated_at: at(24 * 12),
          published_at: at(24 * 12),
        },
      ],
      mp_config_responses: [
        {
          // Saved in store before the sleep answers were kept.
          id: "00000000-0000-4000-b200-000000000001",
          data: { ...answersBase, name: "Mei Lin Tan" },
          is_final: true,
          status: "held",
          source: "manual",
          product_type: "pillow",
          suggested_size: "M",
          suggested_tier: "premium",
          measured_by_type: "by_user",
          created_at: at(1),
          updated_at: at(1),
        },
        {
          // Saved with them: the rules run and suggest a size.
          id: "00000000-0000-4000-b200-000000000002",
          data: {
            ...answersBase,
            name: "Arjun Nair",
            gender: "male",
            shoulderLength: "47.5",
            sleepPositionType: ["side-and-back"],
            sleepPainAreas: ["lower-back"],
            usesBolster: "no",
          },
          is_final: true,
          status: "held",
          source: "manual",
          product_type: "pillow",
          suggested_size: "L",
          suggested_tier: "premium",
          measured_by_type: "by_user",
          created_at: at(2),
          updated_at: at(2),
        },
        {
          // A Draft Result: answers typed into the configurator, not submitted yet.
          id: "00000000-0000-4000-b200-000000000003",
          data: {
            ...answersBase,
            name: "Wei Jie Lim",
            gender: "male",
            ageGroup: "25-34",
            sleepPositionType: ["side-and-back"],
            sleepPainAreas: ["neck"],
            usesBolster: "no",
          },
          is_final: false,
          status: null,
          source: "manual",
          product_type: null,
          created_at: at(0.5),
          updated_at: at(0.5),
        },
        {
          // Submitted with a mix Staff laid out: the x-ray opens on it, not on a template.
          id: "00000000-0000-4000-b200-000000000004",
          data: {
            ...answersBase,
            name: "Priya Raman",
            sleepPositionType: ["side-and-back"],
            sleepPainAreas: ["neck"],
            usesBolster: "no",
          },
          is_final: true,
          status: "held",
          source: "staff_assisted",
          product_type: "pillow",
          suggested_size: "M",
          suggested_tier: "premium",
          measured_by_type: "staff",
          filling_fingerprint: "preview-saved-mix",
          filling_template_id: null,
          created_at: at(3),
          updated_at: at(3),
        },
        {
          // Assigned and waiting on payment: the mix shows read-only.
          id: "00000000-0000-4000-b200-000000000005",
          data: { ...answersBase, name: "Daniel Koh", gender: "male" },
          is_final: true,
          status: "assigned",
          source: "online_purchase",
          product_type: "pillow",
          suggested_size: "M",
          suggested_tier: "premium",
          assigned_size: "M",
          assigned_tier: "premium",
          final_amount: 320,
          currency: "SGD",
          measured_by_type: "by_user",
          filling_fingerprint: "preview-assigned-mix",
          filling_template_id: null,
          created_at: at(26),
          updated_at: at(4),
        },
        // PRD-results-to-customer: three Drafts that stopped part-way (made up).
        {
          // A guest online: their first question's email made them a Lead (Elena Goh, crm.mjs).
          id: "00000000-0000-4000-b200-000000000006",
          data: {
            name: "Elena Goh",
            gender: "female",
            ageGroup: "35-44",
            bedFirmness: "medium-soft",
            acidReflux: "no",
            earDiscomfortSideSleep: "no",
            bloodPressureLevel: "normal",
            sleepPositionType: ["side-and-back"],
            sleepPainAreas: ["neck"],
            usesBolster: "no",
            configurator: "full",
          },
          is_final: false,
          status: null,
          source: "manual",
          customer_email: "elena.goh@example.com",
          created_at: at(30),
          updated_at: at(29),
        },
        {
          // Measured in the studio, a name and nothing else: nobody to follow up yet.
          id: "00000000-0000-4000-b200-000000000007",
          data: {
            ...answersBase,
            name: "Rahul Menon",
            gender: "male",
            ageGroup: "45-54",
            sleepPositionType: ["back"],
            sleepPainAreas: ["shoulder"],
            usesBolster: "no",
            neckToBack: "",
            headToBack: "",
            neckLength: "",
          },
          is_final: false,
          status: null,
          source: "manual",
          measured_by_type: "staff",
          measured_by_staff_id: "00000000-0000-4000-8000-0000000000a5",
          created_at: at(6),
          updated_at: at(5),
        },
        {
          // A returning customer (Ben Ong, crm.mjs) measuring someone he is with.
          id: "00000000-0000-4000-b200-000000000008",
          data: {
            ...answersBase,
            name: "Siew Lan Ong",
            ageGroup: "65-plus",
            sleepPositionType: ["side-and-back"],
            sleepPainAreas: ["neck"],
            usesBolster: "no",
          },
          is_final: false,
          status: null,
          source: "manual",
          customer_id: "00000000-0000-4000-8000-0000000c0002",
          customer_email: "ben.ong@example.com",
          measured_by_type: "by_user",
          created_at: at(50),
          updated_at: at(48),
        },
      ],
      result_filling_placements: [
        ...savedMix("00000000-0000-4000-b200-000000000004"),
        ...savedMix("00000000-0000-4000-b200-000000000005"),
      ],
    },
  };
}
