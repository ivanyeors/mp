"use client";

import Image from "next/image";
import Link from "next/link";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PriceDisplay } from "@/components/shop/price-display";
import { ProductRatingBadge } from "@/components/shop/review-stars";
import { useCart } from "@/lib/shop/cart-context";
import { useIsMobile } from "@/hooks/use-mobile";
import { shopCardPrice } from "@/lib/ecommerce/shop-card-price";
import { cn } from "@/lib/utils";
import { withLocale } from "@/lib/i18n/routing";
import { configuratorPath } from "@/lib/ecommerce/configurator-path";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import type { Product, ProductVariant } from "@/lib/types/ecommerce";

/** Locale-prefixed: an unprefixed link answers with a redirect. */
function getProductHref(product: Product, locale: Locale): string {
  return withLocale(configuratorPath(product.product_type) ?? `/shop/${product.slug}`, locale);
}

interface ProductCardProps {
  product: Product & {
    variants?: ProductVariant[];
    images?: { url: string; alt_text?: string | null }[];
  };
  locale?: string;
  reviewAggregate?: { average: number; count: number };
}

export function ProductCard({ product, locale = "en-US", reviewAggregate }: ProductCardProps) {
  const { addItem } = useCart();
  const isMobile = useIsMobile();

  const content =
    product.content?.[locale] ?? product.content?.["en-US"] ?? null;
  const title = content?.title ?? product.slug;

  const activeVariants = (product.variants ?? []).filter((v) => v.is_active);

  const isOutOfStock =
    activeVariants.length > 0 &&
    activeVariants.every((v) => (v.stock_available ?? 0) <= 0);

  const hasSale = activeVariants.some(
    (v) => v.compare_at_price != null && v.compare_at_price > v.price
  );

  const sortedByPrice = [...activeVariants].sort((a, b) => a.price - b.price);
  const cheapestVariant = sortedByPrice[0] ?? null;
  // The price an email's products block shows for this product too (one rule).
  const shown = shopCardPrice(product.variants ?? []);

  const primaryImage = product.images?.[0] ?? null;
  const imageUrl = primaryImage?.url ?? null;
  const imageAlt = primaryImage?.alt_text ?? title;

  const isCustomizable = product.product_type === "pillow" || product.product_type === "bolster";
  const canQuickAdd = !isCustomizable && !isOutOfStock && cheapestVariant;

  function handleQuickAdd(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!cheapestVariant) return;

    addItem({
      variantId: cheapestVariant.id,
      productId: product.id,
      productSlug: product.slug,
      productTitle: title,
      variantTitle: cheapestVariant.title,
      imageUrl: imageUrl,
      price: cheapestVariant.price,
      compareAtPrice: cheapestVariant.compare_at_price,
      currency: cheapestVariant.currency,
      quantity: 1,
    });

    if (!isMobile) {
      toast(
        <div className="flex items-center gap-3">
          {imageUrl && (
            <Image src={imageUrl} alt={title} width={40} height={40} className="h-10 w-10 rounded-md object-cover" unoptimized />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium">Added to cart</p>
            <p className="text-xs text-muted-foreground truncate">{title}</p>
          </div>
        </div>,
        { duration: 3000 }
      );
    }
  }

  const href = getProductHref(product, isSupportedLocale(locale) ? locale : DEFAULT_LOCALE);

  return (
    <div
      className={cn(
        "group relative rounded-xl overflow-hidden border border-border bg-card",
        "shadow-sm transition-shadow duration-200 hover:shadow-md",
      )}
    >
      {/* Image area */}
      <Link href={href} className="block relative aspect-square w-full overflow-hidden bg-muted">
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
          {isCustomizable && (
            <Badge variant="secondary" className="text-xs">
              Customize
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

        {/* Quick add button */}
        {canQuickAdd && (
          <Button
            size="icon"
            variant="secondary"
            className="absolute bottom-2 right-2 h-9 w-9 rounded-full opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 focus-visible:opacity-100 focus-visible:translate-y-0 max-md:opacity-100 max-md:translate-y-0 transition-all duration-200 shadow-md"
            onClick={handleQuickAdd}
            aria-label={`Quick add ${title} to cart`}
          >
            <Plus className="size-4" />
          </Button>
        )}
      </Link>

      {/* Content */}
      <Link href={href} className="block p-3">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium leading-snug line-clamp-2 text-foreground">
            {title}
          </p>

          {!isCustomizable && reviewAggregate ? (
            <ProductRatingBadge aggregate={reviewAggregate} size={12} />
          ) : null}

          {shown ? (
            <div className="text-sm">
              {shown.from ? (
                <span className="text-muted-foreground text-xs mr-1">From</span>
              ) : null}
              <PriceDisplay
                price={shown.price}
                compareAtPrice={shown.compareAt}
                currency={shown.currency}
                className="text-sm"
              />
            </div>
          ) : null}
        </div>
      </Link>
    </div>
  );
}
