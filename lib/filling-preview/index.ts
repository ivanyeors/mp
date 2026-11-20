export type FillingItemMeta = {
  name: string;
  subtype: string | null;
  size: string | null;
};

export type FillingPreviewLine = { variant: string; qty: number };

const humanize = (value: string) =>
  value
    .split(/[\s_-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export function fillingVariantLabel(item: FillingItemMeta, fallbackSize?: string): string {
  const variant = humanize((item.subtype ?? item.name).trim() || "filling");
  const sizeLabel = item.size ?? fallbackSize;
  return sizeLabel ? `${variant} ${sizeLabel}` : variant;
}

export function formatFillingPreview(
  lines: Array<{ item_id: number; quantity: number }>,
  itemsById: ReadonlyMap<number, FillingItemMeta>,
  fallbackSize?: string,
): FillingPreviewLine[] {
  return lines
    .filter((l) => l.quantity > 0)
    .map((l) => {
      const item = itemsById.get(l.item_id);
      return {
        variant: item ? fillingVariantLabel(item, fallbackSize) : `Item #${l.item_id}`,
        qty: l.quantity,
      };
    });
}
