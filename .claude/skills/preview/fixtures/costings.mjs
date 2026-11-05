// Two Premium M Filling Templates for Costings → Products → Premium Mpillow → M,
// one holding a Cervical Neck Support (item 62) and one without, so the
// "Build cost by filling template" cards show both cases. Names and mixes are
// made up; items are the catalog's ids from analytics.mjs.

const piece = (template_id, section, sub_section, slot, item_id) => ({
  template_id,
  section,
  sub_section,
  slot,
  item_id,
  qty: 1,
});

export default function costings() {
  return {
    tables: {
      bom_templates: [
        { id: 201, kind: "pillow", key: "M", name: "Back sleeper + neck support", role: "filling", is_active: true },
        { id: 202, kind: "pillow", key: "M", name: "Side sleeper", role: "filling", is_active: true },
      ],
      bom_template_keys: [
        { template_id: 201, key: "M" },
        { template_id: 202, key: "M" },
      ],
      filling_template_placements: [
        piece(201, "left", "middle", 1, 68),
        piece(201, "center", "front", 1, 62),
        piece(201, "center", "middle", 1, 67),
        piece(201, "right", "middle", 1, 68),
        piece(202, "left", "middle", 1, 68),
        piece(202, "left", "middle", 2, 68),
        piece(202, "center", "middle", 1, 67),
        piece(202, "right", "middle", 1, 68),
        piece(202, "right", "middle", 2, 68),
      ],
    },
  };
}
