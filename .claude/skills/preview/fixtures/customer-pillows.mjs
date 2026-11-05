// The Customer page's Pillow card (ADR 0042 j). Two Filling Templates named in
// the catalog's way, `Type-12` (serving L and XL, as it does in the catalog)
// and `Type-8a` (S and M), so a fitting's configuration type finds them:
//
//  - Mei (points.mjs, fittings.mjs): her latest fitting is M · T12 · M-LN, and
//    Type-12 serves no M, so the card draws it at M and says so.
//    /settings/customers/00000000-0000-4000-8000-0000000000c7
//  - Ben Ong (crm.mjs), from Shopify with no fitting: Sophie linked L · Type-12.
//    /settings/customers/00000000-0000-4000-8000-0000000c0002
//  - Elena Goh (crm.mjs): nothing on record, so the card offers Link.
//    /settings/customers/00000000-0000-4000-8000-0000000c0005
//
// Made-up recipes; the Items are the catalog's (fixtures/analytics.mjs): 55 6D L,
// 57 6D+ L, 67 6D S, 68 6D M, 69 3D S, 73 6D Fold S.

const TYPE_12 = 512;
const TYPE_8A = 514;
const SOPHIE = "00000000-0000-4000-8000-0000000000a5";
const BEN = "00000000-0000-4000-8000-0000000c0002";

/** One cell's pieces, top Layer first. */
function cell(templateId, section, subSection, items, order) {
  return items.map((itemId, row) => ({
    template_id: templateId,
    section,
    sub_section: subSection,
    slot: row + 1,
    item_id: itemId,
    qty: 1,
    row_index: items.length > 1 ? row : null,
    insert_order: order + row,
    offset_x_mm: null,
    offset_y_mm: null,
  }));
}

export default function customerPillows({ now }) {
  const ago = (days) => new Date(now.getTime() - days * 86_400_000).toISOString();
  const template = (id, name, key) => ({
    id,
    kind: "pillow",
    key,
    role: "filling",
    name,
    notes: null,
    pillow_kind: null,
    pillow_variant: null,
    is_active: true,
    created_at: ago(60),
    updated_at: ago(5),
  });
  return {
    tables: {
      bom_templates: [template(TYPE_12, "Type-12", "L"), template(TYPE_8A, "Type-8a", "S")],
      bom_template_keys: [
        { template_id: TYPE_12, key: "L", created_at: ago(60) },
        { template_id: TYPE_12, key: "XL", created_at: ago(60) },
        { template_id: TYPE_8A, key: "S", created_at: ago(60) },
        { template_id: TYPE_8A, key: "M", created_at: ago(60) },
      ],
      filling_template_placements: [
        ...cell(TYPE_12, "left", "front", [55], 1),
        ...cell(TYPE_12, "left", "middle", [57, 55], 2),
        ...cell(TYPE_12, "left", "back", [69], 4),
        ...cell(TYPE_12, "center", "front", [73], 1),
        ...cell(TYPE_12, "center", "middle", [55], 2),
        ...cell(TYPE_12, "center", "back", [69, 67], 3),
        ...cell(TYPE_12, "right", "front", [55], 1),
        ...cell(TYPE_12, "right", "middle", [57, 55], 2),
        ...cell(TYPE_12, "right", "back", [69], 4),
        ...cell(TYPE_8A, "left", "middle", [67, 68], 1),
        ...cell(TYPE_8A, "center", "middle", [68], 1),
        ...cell(TYPE_8A, "center", "back", [69], 2),
        ...cell(TYPE_8A, "right", "middle", [67, 68], 1),
      ],
      customer_pillows: [
        {
          customer_id: BEN,
          pillow_size: "L",
          filling_template_id: TYPE_12,
          linked_by_user_id: null,
          linked_by_profile_id: SOPHIE,
          linked_at: ago(3),
        },
      ],
    },
  };
}
