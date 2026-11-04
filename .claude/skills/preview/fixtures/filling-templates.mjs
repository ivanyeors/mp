// A Filling Template (role 'filling') for Premium M, laid out in the x-ray, with
// an Ear Comfort Pad on top of each side Section's middle: what Settings ›
// Inventory › Configure › Premium M opens to. Made-up recipe; the Items are the
// catalog's (fixtures/analytics.mjs): 67 6D S, 68 6D M, 69 3D S, 73 6D Fold S,
// 41 Ear Comfort Pad.

const TEMPLATE_ID = 501;

/** One cell's pieces, top Layer first: [item, ...] → placement rows. */
function cell(section, subSection, items, order) {
  return items.map((itemId, row) => ({
    template_id: TEMPLATE_ID,
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
}

export default function fillingTemplates({ now }) {
  const at = new Date(now.getTime() - 3 * 86400e3).toISOString();
  const filling_template_placements = [
    ...cell("left", "front", [67], 1),
    ...cell("left", "middle", [41, 68], 2),
    ...cell("left", "back", [69, 67], 4),
    ...cell("center", "front", [67], 6),
    ...cell("center", "middle", [67, 73], 7),
    ...cell("center", "back", [69, 67, 67], 9),
    ...cell("right", "front", [67], 12),
    ...cell("right", "middle", [41, 68], 13),
    ...cell("right", "back", [69, 67], 15),
  ];
  return {
    tables: {
      bom_templates: [
        {
          id: TEMPLATE_ID,
          kind: "pillow",
          key: "M",
          role: "filling",
          name: "Side sleeper with ear pads",
          notes: null,
          pillow_kind: null,
          pillow_variant: null,
          is_active: true,
          created_at: at,
          updated_at: at,
        },
      ],
      bom_template_keys: [{ template_id: TEMPLATE_ID, key: "M", created_at: at }],
      filling_template_placements,
    },
  };
}
