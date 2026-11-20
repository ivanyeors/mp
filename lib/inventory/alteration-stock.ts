// ponytail: 1:1 conversion — add a ratio column on items if an alteration ever consumes more or
// less than one base piece.

export type StockItem = { id: number; category: string | null; alteration_of_item_id: number | null };

export type StockInRow = {
  item_id: number;
  quantity_signed: number;
  reason: "receive" | "assemble";
  metadata?: Record<string, number>;
};

export function alterationBaseId(item: StockItem): number | null {
  const base = Number(item.alteration_of_item_id);
  return item.category === "filling" && Number.isFinite(base) && base > 0 ? base : null;
}

export function assertConvertible(quantity: number, baseOnHand: number): void {
  if (quantity > baseOnHand) {
    throw new Error(`Only ${Math.max(0, baseOnHand)} of the base filling on hand, so ${quantity} can't be converted.`);
  }
}

export function stockInRows(item: StockItem, quantity: number, baseOnHand: number): StockInRow[] {
  const baseId = alterationBaseId(item);
  if (baseId === null) return [{ item_id: item.id, quantity_signed: quantity, reason: "receive" }];
  assertConvertible(quantity, baseOnHand);
  return [
    { item_id: item.id, quantity_signed: quantity, reason: "assemble", metadata: { converted_from_item_id: baseId } },
    { item_id: baseId, quantity_signed: -quantity, reason: "assemble", metadata: { converted_to_item_id: item.id } },
  ];
}
