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
      ],
    },
  };
}
