"use client";

import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { PriceDisplay } from "@/components/shop/price-display";
import { cn } from "@/lib/utils";
import type { Product, ProductVariant } from "@/lib/types/ecommerce";

function getProductHref(product: Product): string {
  if (product.product_type === "pillow") return `/mp-maker?product=pillow`;
  if (product.product_type === "bolster") return `/mp-maker?product=bolster`;
  return `/shop/${product.slug}`;
}

interface ProductCardProps {
  product: Product & {
    variants?: ProductVariant[];
    images?: { url: string; alt_text?: string | null }[];
  };
  locale?: string;
}

export function ProductCard({ product, locale = "en-US" }: ProductCardProps) {
  const content =
    product.content?.[locale] ?? product.content?.["en-US"] ?? null;
  const title = content?.title ?? product.slug;

  const activeVariants = (product.variants ?? []).filter((v) => v.is_active);

  const isOutOfStock =
    activeVariants.length > 0 &&
    activeVariants.every((v) => v.stock_quantity <= 0);

  const hasSale = activeVariants.some(
    (v) => v.compare_at_price != null && v.compare_at_price > v.price
  );

  // Determine min price variant (active, lowest price)
  const sortedByPrice = [...activeVariants].sort((a, b) => a.price - b.price);
  const cheapestVariant = sortedByPrice[0] ?? null;

  const currency = cheapestVariant?.currency ?? "MYR";
  const minPrice = cheapestVariant?.price ?? 0;
  const minCompareAtPrice = cheapestVariant?.compare_at_price ?? null;

  // Primary image: variant-specific first, then product-level
  const primaryImage = product.images?.[0] ?? null;
  const imageUrl = primaryImage?.url ?? null;
  const imageAlt = primaryImage?.alt_text ?? title;

  return (
    <Link
      href={getProductHref(product)}
      className={cn(
        "group block rounded-xl overflow-hidden border border-border bg-card",
        "shadow-sm transition-shadow duration-200 hover:shadow-md",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      )}
    >
      {/* Image area */}
      <div className="relative aspect-square w-full overflow-hidden bg-muted">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={imageAlt}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className={cn(
              "object-cover transition-transform duration-300",
              "group-hover:scale-105"
            )}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-muted text-muted-foreground text-sm">
            No image
          </div>
        )}

        {/* Badges — top-left */}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {hasSale && (
            <Badge variant="destructive" className="text-xs">
              Sale
            </Badge>
          )}
        </div>

        {/* Out of stock overlay */}
        {isOutOfStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[2px]">
            <span className="rounded-full bg-background/90 px-3 py-1 text-xs font-medium text-muted-foreground border border-border">
              Out of Stock
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3 flex flex-col gap-1">
        <p className="text-sm font-medium leading-snug line-clamp-2 text-foreground">
          {title}
        </p>

        {cheapestVariant ? (
          <div className="text-sm">
            {activeVariants.length > 1 ? (
              <span className="text-muted-foreground text-xs mr-1">From</span>
            ) : null}
            <PriceDisplay
              price={minPrice}
              compareAtPrice={minCompareAtPrice}
              currency={currency}
              className="text-sm"
            />
          </div>
        ) : null}
      </div>
    </Link>
  );
}
