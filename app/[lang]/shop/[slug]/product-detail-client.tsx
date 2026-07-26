"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { ShoppingCart, Package, Check, Truck, ShieldCheck, RotateCcw } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

import { Button } from "@/components/ui/button";
import { MobileStickyActionBar } from "@/components/ui/mobile-sticky-action-bar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import { PriceDisplay } from "@/components/shop/price-display";
import { VariantSelector } from "@/components/shop/variant-selector";
import { QuantitySelector } from "@/components/shop/quantity-selector";
import { ProductGrid } from "@/components/shop/product-grid";
import { ProductCard } from "@/components/shop/product-card";

import { PillowCustomizer } from "@/components/shop/pillow-customizer";
import { ProductReviews, ReviewStars, useApprovedReviews } from "./product-reviews";
import { useCart } from "@/lib/shop/cart-context";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  buildProductSpecifications,
  hasSpecifications,
  SPEC_FIELDS,
} from "@/lib/shop/product-specifications";
import type { Product, ProductVariant } from "@/lib/types/ecommerce";

function getTitle(product: Product, lang: string): string {
  return (
    product.content?.[lang]?.title ||
    product.content?.["en"]?.title ||
    Object.values(product.content ?? {})[0]?.title ||
    product.slug
  );
}

function getDescription(product: Product, lang: string): string {
  return (
    product.content?.[lang]?.description ||
    product.content?.["en"]?.description ||
    Object.values(product.content ?? {})[0]?.description ||
    ""
  );
}

function getBody(product: Product, lang: string): string {
  return (
    product.content?.[lang]?.body ||
    product.content?.["en"]?.body ||
    Object.values(product.content ?? {})[0]?.body ||
    ""
  );
}

function getCategoryName(product: Product, lang: string): string {
  if (!product.category) return "Shop";
  return (
    product.category.content?.[lang]?.name ||
    product.category.content?.["en"]?.name ||
    Object.values(product.category.content ?? {})[0]?.name ||
    "Shop"
  );
}

function getDefaultVariant(product: Product): ProductVariant | null {
  const active = product.variants?.filter((v) => v.is_active) ?? [];
  return active[0] ?? product.variants?.[0] ?? null;
}

function getStockStatus(variant: ProductVariant | null): "in_stock" | "low_stock" | "out_of_stock" {
  if (!variant) return "out_of_stock";
  if (!variant.track_inventory) return "in_stock";
  const qty = variant.stock_available ?? 0;
  if (qty <= 0) return "out_of_stock";
  if (qty < 10) return "low_stock";
  return "in_stock";
}

interface ProductDetailClientProps {
  product: Product;
  relatedProducts: Product[];
  lang: string;
  answerLede?: string | null;
  /** Server-rendered Page FAQ (after tabs). Null/empty when surface has no visible items. */
  pageFaq?: React.ReactNode;
}

export function ProductDetailClient({
  product,
  relatedProducts,
  lang,
  answerLede,
  pageFaq,
}: ProductDetailClientProps) {
  const { addItem } = useCart();
  const isMobile = useIsMobile();

  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(
    getDefaultVariant(product)
  );
  const [quantity, setQuantity] = useState(1);
  const [mainImageIndex, setMainImageIndex] = useState(0);
  const [addedToCart, setAddedToCart] = useState(false);
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const [stickyBarVisible, setStickyBarVisible] = useState(false);

  const {
    reviews,
    average: reviewAverage,
    count: reviewCount,
    loading: reviewsLoading,
  } = useApprovedReviews(product.id);

  const addToCartRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const btn = addToCartRef.current;
    if (!btn) return;
    const observer = new IntersectionObserver(
      ([entry]) => setStickyBarVisible(!entry.isIntersecting),
      { threshold: 0, rootMargin: "0px 0px -64px 0px" }
    );
    observer.observe(btn);
    return () => observer.disconnect();
  }, []);

  const handleAddToCart = useCallback(() => {
    if (!selectedVariant) return;
    const title = getTitle(product, lang);
    const images = product.images ?? [];
    const imageUrl =
      selectedVariant.image_url ||
      images.find((img) => img.variant_id === selectedVariant.id)?.url ||
      images[mainImageIndex]?.url ||
      null;

    addItem({
      variantId: selectedVariant.id,
      productId: product.id,
      productSlug: product.slug,
      productTitle: title,
      variantTitle: selectedVariant.title,
      imageUrl,
      price: selectedVariant.price,
      compareAtPrice: selectedVariant.compare_at_price,
      currency: selectedVariant.currency,
      quantity,
    });

    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 2000);

    if (!isMobile) {
      toast(
        <div className="flex items-center gap-3">
          {imageUrl && (
            <Image src={imageUrl} alt={title} width={48} height={48} className="h-12 w-12 rounded-md object-cover" unoptimized />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium">Added to cart</p>
            <p className="text-xs text-muted-foreground truncate">{title}</p>
          </div>
        </div>,
        { duration: 4000 }
      );
    }
  }, [product, selectedVariant, quantity, lang, mainImageIndex, addItem, isMobile]);

  const title = getTitle(product, lang);
  const description = getDescription(product, lang);
  const body = getBody(product, lang);
  const categoryName = getCategoryName(product, lang);
  const images = (product.images ?? []).sort((a, b) => a.position - b.position);
  const stockStatus = getStockStatus(selectedVariant);
  const isOutOfStock = stockStatus === "out_of_stock";
  const specifications = buildProductSpecifications(product, selectedVariant);

  return (
    <>
      <div className="container mx-auto px-4 py-8 max-w-7xl pb-[calc(var(--mobile-bottom-clearance)+7rem+env(safe-area-inset-bottom,0px))] md:pb-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
          {/* LEFT: Image Gallery */}
          <div className="flex flex-col gap-4" id="gallery" data-section="gallery">
            {images.length > 0 ? (
              <>
                {/* Desktop: single main image driven by the thumbnails below. */}
                <div className="relative aspect-square rounded-lg overflow-hidden bg-muted max-md:hidden">
                  <Image
                    src={images[mainImageIndex]?.url ?? images[0].url}
                    alt={images[mainImageIndex]?.alt_text ?? title}
                    fill
                    className="object-cover"
                    priority
                    sizes="50vw"
                  />
                  {product.featured && (
                    <div className="absolute top-3 left-3">
                      <Badge>Featured</Badge>
                    </div>
                  )}
                </div>

                {/* Mobile: native horizontal swipe + snap over the full image
                    set. Default touch-action so a single-finger drag pans the
                    snap track (advances images).
                    ponytail: no pinch-zoom — the site viewport meta
                    (user-scalable=false) locks zoom globally, so a per-slide
                    touch-action:pinch-zoom bought nothing and disabled the swipe
                    pan. Upgrade to a transform-on-gesture handler if true
                    unbounded zoom is ever required. */}
                <div className="relative aspect-square rounded-lg overflow-hidden bg-muted md:hidden">
                  <div className="flex h-full snap-x snap-mandatory overflow-x-auto">
                    {images.map((img, idx) => (
                      <div
                        key={img.id}
                        className="relative h-full w-full flex-shrink-0 snap-center"
                      >
                        <Image
                          src={img.url}
                          alt={img.alt_text ?? `${title} ${idx + 1}`}
                          fill
                          className="object-cover"
                          priority={idx === 0}
                          sizes="100vw"
                        />
                      </div>
                    ))}
                  </div>
                  {product.featured && (
                    <div className="absolute top-3 left-3">
                      <Badge>Featured</Badge>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="relative aspect-square rounded-lg overflow-hidden bg-muted">
                <div className="flex items-center justify-center w-full h-full text-muted-foreground">
                  <Package className="w-24 h-24 opacity-30" />
                </div>
              </div>
            )}

            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1 max-md:hidden">
                {images.map((img, idx) => (
                  <button
                    key={img.id}
                    onClick={() => setMainImageIndex(idx)}
                    className={`relative flex-shrink-0 w-16 h-16 rounded-md overflow-hidden border-2 transition-colors ${
                      mainImageIndex === idx
                        ? "border-primary"
                        : "border-transparent hover:border-muted-foreground/40"
                    }`}
                    aria-label={`View image ${idx + 1}`}
                  >
                    <Image
                      src={img.url}
                      alt={img.alt_text ?? `${title} thumbnail ${idx + 1}`}
                      fill
                      className="object-cover"
                      sizes="64px"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* RIGHT: Product Info */}
          <div className="flex flex-col gap-5" id="buy-box" data-section="buy-box">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link href={`/${lang}`}>Home</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link href={`/${lang}/shop`}>Shop</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                {product.category ? (
                  <>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbLink asChild>
                        <Link href={`/${lang}/shop?category=${product.category.slug}`}>
                          {categoryName}
                        </Link>
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                  </>
                ) : null}
                <BreadcrumbSeparator />
                <BreadcrumbItem className="min-w-0">
                  <BreadcrumbPage className="truncate max-w-[180px]" title={title}>
                    {title}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>

            <h1 className="text-2xl lg:text-3xl font-bold leading-tight">{title}</h1>

            {answerLede ? (
              <p className="text-base leading-relaxed text-muted-foreground">{answerLede}</p>
            ) : null}

            <div className="text-xl">
              <PriceDisplay
                price={selectedVariant?.price ?? 0}
                compareAtPrice={selectedVariant?.compare_at_price ?? null}
                currency={selectedVariant?.currency ?? "SGD"}
              />
            </div>

            <div className="flex items-center gap-2">
              <ReviewStars rating={reviewCount > 0 ? reviewAverage : 0} size={16} />
              <span className="text-sm text-muted-foreground">
                {reviewsLoading
                  ? "Loading reviews…"
                  : reviewCount > 0
                    ? `${reviewAverage.toFixed(1)} (${reviewCount} review${reviewCount === 1 ? "" : "s"})`
                    : "(No reviews yet)"}
              </span>
            </div>

            {description && (
              <p className="text-muted-foreground leading-relaxed">{description}</p>
            )}

            {product.tags && product.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {product.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}

            {(product.variants?.length ?? 0) > 1 && (
              <VariantSelector
                variants={product.variants ?? []}
                options={product.options}
                selected={selectedVariant?.id}
                onSelect={(variantId) => {
                  const v = product.variants?.find((x) => x.id === variantId) ?? null;
                  setSelectedVariant(v);
                }}
              />
            )}

            <div className="flex items-center gap-2">
              {stockStatus === "in_stock" && (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />
                  <span className="text-sm font-medium text-green-600 dark:text-green-400">
                    In Stock
                  </span>
                </>
              )}
              {stockStatus === "low_stock" && (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 flex-shrink-0" />
                  <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
                    Low Stock — Order soon
                  </span>
                </>
              )}
              {stockStatus === "out_of_stock" && (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" />
                  <span className="text-sm font-medium text-red-600 dark:text-red-400">
                    Out of Stock
                  </span>
                </>
              )}
            </div>

            {!isOutOfStock && (
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">Qty:</span>
                <QuantitySelector
                  value={quantity}
                  onChange={setQuantity}
                  min={1}
                  max={
                    selectedVariant?.track_inventory
                      ? (selectedVariant.stock_available ?? 99)
                      : 99
                  }
                />
              </div>
            )}

            <div className="flex flex-col gap-3">
              {(product.product_type === "pillow" || product.product_type === "bolster") && (
                <Button size="lg" className="w-full" onClick={() => setCustomizerOpen(true)}>
                  Build Your Pillow
                </Button>
              )}
              <Button
                ref={addToCartRef}
                size="lg"
                className="w-full gap-2"
                disabled={isOutOfStock}
                onClick={handleAddToCart}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {addedToCart ? (
                    <motion.span
                      key="check"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="flex items-center gap-2"
                    >
                      <Check className="w-5 h-5" />
                      Added!
                    </motion.span>
                  ) : (
                    <motion.span
                      key="cart"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="flex items-center gap-2"
                    >
                      <ShoppingCart className="w-5 h-5" />
                      {isOutOfStock ? "Out of Stock" : "Add to Cart"}
                    </motion.span>
                  )}
                </AnimatePresence>
              </Button>
            </div>

            {/* Trust signals */}
            <div className="flex flex-col gap-2 pt-1 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Truck className="size-4 shrink-0" />
                <span>Free shipping over S$150</span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 shrink-0" />
                <span>30-day satisfaction guarantee</span>
              </div>
              <div className="flex items-center gap-2">
                <RotateCcw className="size-4 shrink-0" />
                <span>Easy returns &amp; exchanges</span>
              </div>
            </div>
          </div>
        </div>

        {/* Below fold */}
        <div className="mt-12 lg:mt-16 space-y-12">
          <Tabs defaultValue="description">
            <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent gap-0">
              <TabsTrigger
                value="description"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-3 pt-1"
              >
                Description
              </TabsTrigger>
              <TabsTrigger
                value="specifications"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-3 pt-1"
              >
                Specifications
              </TabsTrigger>
              <TabsTrigger
                value="reviews"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-3 pt-1"
              >
                Reviews
              </TabsTrigger>
            </TabsList>

            <TabsContent value="description" className="pt-6" id="description" data-section="description">
              {body ? (
                <div className="prose prose-neutral dark:prose-invert max-w-none">
                  <ReactMarkdown>{body}</ReactMarkdown>
                </div>
              ) : description ? (
                <p className="text-muted-foreground leading-relaxed">{description}</p>
              ) : (
                <p className="text-muted-foreground">No description available.</p>
              )}
            </TabsContent>

            <TabsContent value="specifications" className="pt-6" id="specifications" data-section="specifications">
              {hasSpecifications(specifications) ? (
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 max-w-2xl">
                  {SPEC_FIELDS.filter(({ key }) => specifications[key]).map(
                    ({ key, label }) => (
                      <div
                        key={key}
                        className="flex justify-between gap-4 border-b py-2 text-sm"
                      >
                        <dt className="font-medium text-foreground">{label}</dt>
                        <dd className="text-muted-foreground text-right">
                          {specifications[key]}
                        </dd>
                      </div>
                    )
                  )}
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No specifications available for this product.
                </p>
              )}
            </TabsContent>

            <TabsContent value="reviews" className="pt-6" id="reviews" data-section="reviews">
              <ProductReviews
                productId={product.id}
                reviews={reviews}
                average={reviewAverage}
                count={reviewCount}
                loading={reviewsLoading}
              />
            </TabsContent>
          </Tabs>

          {pageFaq ? <div id="faq" data-section="faq">{pageFaq}</div> : null}

          {relatedProducts.length > 0 && (
            <section id="related" data-section="related">
              <h2 className="text-xl font-semibold mb-6">You May Also Like</h2>
              <ProductGrid>
                {relatedProducts.map((p) => (
                  <ProductCard key={p.id} product={p} locale={lang} />
                ))}
              </ProductGrid>
            </section>
          )}
        </div>
      </div>

      {/* Mobile sticky Add-to-Cart bar (shared dock clearance). Only mounts
          once the in-panel Add-to-Cart button scrolls out of view. */}
      {stickyBarVisible && (
        <MobileStickyActionBar className="flex items-center justify-between gap-4">
          <div className="flex flex-col min-w-0">
            <span className="font-semibold truncate text-sm">{title}</span>
            <PriceDisplay
              price={selectedVariant?.price ?? 0}
              compareAtPrice={selectedVariant?.compare_at_price ?? null}
              currency={selectedVariant?.currency ?? "SGD"}
            />
          </div>
          <Button
            size="lg"
            className="flex-shrink-0 gap-2"
            disabled={isOutOfStock}
            onClick={handleAddToCart}
          >
            <AnimatePresence mode="wait" initial={false}>
              {addedToCart ? (
                <motion.span
                  key="check"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center gap-2"
                >
                  <Check className="w-5 h-5" />
                  Added!
                </motion.span>
              ) : (
                <motion.span
                  key="cart"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center gap-2"
                >
                  <ShoppingCart className="w-5 h-5" />
                  {isOutOfStock ? "Out of Stock" : "Add to Cart"}
                </motion.span>
              )}
            </AnimatePresence>
          </Button>
        </MobileStickyActionBar>
      )}

      <PillowCustomizer
        open={customizerOpen}
        onOpenChange={setCustomizerOpen}
        onAddToCart={({ variantId, customizationId, customizationSummary, addonPrice, basePrice, currency }) => {
          addItem({
            variantId,
            productId: product.id,
            productSlug: product.slug,
            productTitle: title,
            variantTitle: selectedVariant?.title ?? null,
            imageUrl: product.images?.[0]?.url ?? null,
            price: basePrice,
            compareAtPrice: null,
            currency,
            quantity: 1,
            customizationId,
            customizationSummary,
            addonPrice,
          });
          setCustomizerOpen(false);
        }}
      />
    </>
  );
}
