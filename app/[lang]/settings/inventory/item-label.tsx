type InventoryItemLike = {
  category: string;
  name: string | null | undefined;
  size: string | null | undefined;
  subtype: string | null | undefined;
};

const CATEGORY_TITLES: Record<string, string> = {
  cover: "Covers",
  pillow_case: "Pillow Cases",
  pillow_protector: "Pillow Protectors",
  bolster_case: "Bolster Cases",
  bolster_protector: "Bolster Protectors",
  filling: "Fillings",
  packaging: "Packaging",
  accessories: "Accessories",
  other: "Other",
};

const humanizeText = (value: string): string =>
  value
    .split(/[\s_-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const normalizeNameOrFallback = (value: string | null | undefined, fallbackCategory?: string): string => {
  if (!value) {
    return fallbackCategory ? humanizeText(fallbackCategory) : "Item";
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    return fallbackCategory ? humanizeText(fallbackCategory) : "Item";
  }
  if (/[_-]/.test(trimmed)) {
    return humanizeText(trimmed);
  }
  if (trimmed === trimmed.toLowerCase()) {
    return humanizeText(trimmed);
  }
  return trimmed;
};

export const getInventoryCategoryTitle = (category: string): string =>
  CATEGORY_TITLES[category as keyof typeof CATEGORY_TITLES] ?? humanizeText(category);

export const getInventoryVariantName = (item: InventoryItemLike): string => {
  const trimmedSubtype = item.subtype?.trim();
  if (item.category === "filling") {
    const nameLabel = normalizeNameOrFallback(item.name, "filling");
    if (nameLabel) return nameLabel;
    if (trimmedSubtype) return normalizeNameOrFallback(trimmedSubtype, "filling");
    return "Filling";
  }
  return normalizeNameOrFallback(item.name, item.category);
};

export const getInventorySizeLabel = (item: InventoryItemLike): string | null => {
  const raw = item.size?.trim();
  if (!raw || raw === "-") {
    return null;
  }
  return raw;
};

export const getInventoryItemLabelParts = (item: InventoryItemLike) => {
  const variant = getInventoryVariantName(item);
  const categoryTitle = getInventoryCategoryTitle(item.category);
  const sizeLabel = getInventorySizeLabel(item);
  return { variant, categoryTitle, sizeLabel };
};

export const getInventoryItemDisplayLabel = (item: InventoryItemLike): string => {
  const { variant, categoryTitle, sizeLabel } = getInventoryItemLabelParts(item);
  return sizeLabel ? `${variant} ${categoryTitle} (${sizeLabel})` : `${variant} ${categoryTitle}`;
};

type InventoryItemLabelProps<T extends InventoryItemLike = InventoryItemLike> = {
  item: T;
  className?: string;
};

export function InventoryItemLabel<T extends InventoryItemLike>({ item, className }: InventoryItemLabelProps<T>) {
  const { variant, categoryTitle, sizeLabel } = getInventoryItemLabelParts(item);
  const baseClass = "flex flex-wrap items-center gap-2 text-sm leading-tight";
  const wrapperClass = className ? `${baseClass} ${className}` : baseClass;
  return (
    <div className={wrapperClass}>
      <span className="font-semibold leading-none">{variant}</span>
      <span className="leading-none">{categoryTitle}</span>
      {sizeLabel ? (
        <span className="inline-flex items-center rounded-full border border-border bg-muted/60 px-2 py-0.5 text-xs font-medium leading-none">
          {sizeLabel}
        </span>
      ) : null}
    </div>
  );
}

export type { InventoryItemLike };



