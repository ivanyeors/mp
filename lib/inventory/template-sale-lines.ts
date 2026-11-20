export type TemplateLine = { item_id: number; quantity: number };

export function aggregateSignedQuantities(
  rows: Array<{ item_id: number; quantity_signed: number }>,
): Array<{ item_id: number; quantity_signed: number }> {
  const byId = new Map<number, number>();
  rows.forEach((r) => {
    const id = Number(r.item_id);
    const qty = Number(r.quantity_signed);
    if (!Number.isFinite(id) || id <= 0) return;
    if (!Number.isFinite(qty) || qty === 0) return;
    byId.set(id, (byId.get(id) ?? 0) + qty);
  });
  return Array.from(byId.entries()).map(([item_id, quantity_signed]) => ({ item_id, quantity_signed }));
}

export function combineTemplateSaleLines(
  warehouseLines: TemplateLine[],
  fillingLines: TemplateLine[],
  saleQty: number,
): Array<{ item_id: number; quantity_signed: number }> {
  const qty = Math.max(1, Math.floor(saleQty));
  const rows = [...warehouseLines, ...fillingLines].map((l) => ({
    item_id: l.item_id,
    quantity_signed: -1 * Number(l.quantity) * qty,
  }));
  return aggregateSignedQuantities(rows);
}
