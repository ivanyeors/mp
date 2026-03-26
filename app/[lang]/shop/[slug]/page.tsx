"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ShoppingCart, Star, ChevronRight, Package, Check } from "lucide-react";
import ReactMarkdown from "react-markdown";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import { PriceDisplay } from "@/components/shop/price-display";
import { VariantSelector } from "@/components/shop/variant-selector";
import { QuantitySelector } from "@/components/shop/quantity-selector";
import { ProductGrid } from "@/components/shop/product-grid";
import { ProductCard } from "@/components/shop/product-card";

import { PillowCustomizer } from "@/components/shop/pillow-customizer";
import { useCart } from "@/lib/shop/cart-context";
import type { Product, ProductVariant } from "@/lib/types/ecommerce";

// ─── helpers ────────────────────────────────────────────────────────────────

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
  const qty = variant.stock_available ?? variant.stock_quantity ?? 0;
  if (qty <= 0) return "out_of_stock";
  if (qty < 10) return "low_stock";
  return "in_stock";
}

// ─── main component ──────────────────────────────────────────────────────────

export default function ProductDetailPage() {
  const params = useParams();
  const lang = (params?.lang as string) || "en";
  const slug = params?.slug as string;

  const { addItem } = useCart();

  // ── data state ─────────────────────────────────────────────────────────────
  const [product, setProduct] = useState<Product | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── ui state ───────────────────────────────────────────────────────────────
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [mainImageIndex, setMainImageIndex] = useState(0);
  const [addedToCart, setAddedToCart] = useState(false);
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const [stickyBarVisible, setStickyBarVisible] = useState(false);

  // ── refs ───────────────────────────────────────────────────────────────────
  const addToCartRef = useRef<HTMLButtonElement>(null);

  // ── fetch product ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError(null);

    fetch(`/api/shop/products?status=active&limit=100`)
      .then((r) => r.json())
      .then((data) => {
        const rows: Product[] = data.rows ?? [];
        const found = rows.find((p) => p.slug === slug) ?? null;
        if (!found) {
          setError("Product not found.");
          return;
        }
        setProduct(found);
        setSelectedVariant(getDefaultVariant(found));

        // fetch related products
        if (found.category_id) {
          fetch(
            `/api/shop/products?status=active&category_id=${found.category_id}&limit=8`
          )
            .then((r) => r.json())
            .then((rel) => {
              const related: Product[] = (rel.rows ?? []).filter(
                (p: Product) => p.id !== found.id
              );
              setRelatedProducts(related.slice(0, 4));
            })
            .catch(() => {});
        }
      })
      .catch(() => setError("Failed to load product."))
      .finally(() => setLoading(false));
  }, [slug]);

  // ── intersection observer for sticky bar ────────────────────────────────────
  useEffect(() => {
    const btn = addToCartRef.current;
    if (!btn) return;
    const observer = new IntersectionObserver(
      ([entry]) => setStickyBarVisible(!entry.isIntersecting),
      { threshold: 0, rootMargin: "0px 0px -64px 0px" }
    );
    observer.observe(btn);
    return () => observer.disconnect();
  }, [product]);

  // ── add to cart ─────────────────────────────────────────────────────────────
  const handleAddToCart = useCallback(() => {
    if (!product || !selectedVariant) return;
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
  }, [product, selectedVariant, quantity, lang, mainImageIndex, addItem]);

  // ── loading / error ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="container mx-auto px-4 py-16 flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <div className="w-10 h-10 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <p>Loading product…</p>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="container mx-auto px-4 py-16 flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Package className="w-16 h-16 text-muted-foreground" />
        <p className="text-lg text-muted-foreground">{error ?? "Product not found."}</p>
        <Button asChild variant="outline">
          <Link href={`/${lang}/shop`}>Back to Shop</Link>
        </Button>
      </div>
    );
  }

  const title = getTitle(product, lang);
  const description = getDescription(product, lang);
  const body = getBody(product, lang);
  const categoryName = getCategoryName(product, lang);
  const images = (product.images ?? []).sort((a, b) => a.position - b.position);
  const stockStatus = getStockStatus(selectedVariant);
  const isOutOfStock = stockStatus === "out_of_stock";

  return (
    <>
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* ── PRODUCT SECTION ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
          {/* ── LEFT: Image Gallery ─────────────────────────────────────── */}
          <div className="flex flex-col gap-4">
            {/* Main image */}
            <div className="relative aspect-square rounded-lg overflow-hidden bg-muted">
              {images.length > 0 ? (
                <Image
                  src={images[mainImageIndex]?.url ?? images[0].url}
                  alt={images[mainImageIndex]?.alt_text ?? title}
                  fill
                  className="object-cover"
                  priority
                  sizes="(max-width: 1024px) 100vw, 50vw"
                />
              ) : (
                <div className="flex items-center justify-center w-full h-full text-muted-foreground">
                  <Package className="w-24 h-24 opacity-30" />
                </div>
              )}

              {product.featured && (
                <div className="absolute top-3 left-3">
                  <Badge>Featured</Badge>
                </div>
              )}
            </div>

            {/* Thumbnail strip */}
            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {images.slice(0, 5).map((img, idx) => (
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

          {/* ── RIGHT: Product Info ──────────────────────────────────────── */}
          <div className="flex flex-col gap-5">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
              <Link href={`/${lang}`} className="hover:text-foreground transition-colors">
                Home
              </Link>
              <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
              <Link href={`/${lang}/shop`} className="hover:text-foreground transition-colors">
                Shop
              </Link>
              {product.category && (
                <>
                  <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
                  <Link
                    href={`/${lang}/shop?category=${product.category.slug}`}
                    className="hover:text-foreground transition-colors"
                  >
                    {categoryName}
                  </Link>
                </>
              )}
              <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="text-foreground truncate max-w-[180px]">{title}</span>
            </nav>

            {/* Title */}
            <h1 className="text-2xl lg:text-3xl font-bold leading-tight">{title}</h1>

            {/* Price */}
            <div className="text-xl">
              <PriceDisplay
                price={selectedVariant?.price ?? 0}
                compareAtPrice={selectedVariant?.compare_at_price ?? null}
                currency={selectedVariant?.currency ?? "USD"}
              />
            </div>

            {/* Star rating placeholder */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className="w-4 h-4 text-amber-400 fill-amber-400"
                  />
                ))}
              </div>
              <span className="text-sm text-muted-foreground">(No reviews yet)</span>
            </div>

            {/* Short description */}
            {description && (
              <p className="text-muted-foreground leading-relaxed">{description}</p>
            )}

            {/* Tags */}
            {product.tags && product.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {product.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}

            {/* Variant selector */}
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

            {/* Stock indicator */}
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

            {/* Quantity selector */}
            {!isOutOfStock && (
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">Qty:</span>
                <QuantitySelector
                  value={quantity}
                  onChange={setQuantity}
                  min={1}
                  max={
                    selectedVariant?.track_inventory
                      ? (selectedVariant.stock_available ?? selectedVariant.stock_quantity ?? 99)
                      : 99
                  }
                />
              </div>
            )}

            {/* CTA row */}
            <div className="flex flex-col gap-3">
              {(product.product_type === "pillow" || product.product_type === "bolster") && (
                <Button
                  size="lg"
                  className="w-full"
                  onClick={() => setCustomizerOpen(true)}
                >
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
                {addedToCart ? (
                  <>
                    <Check className="w-5 h-5" />
                    Added!
                  </>
                ) : (
                  <>
                    <ShoppingCart className="w-5 h-5" />
                    {isOutOfStock ? "Out of Stock" : "Add to Cart"}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* ── BELOW FOLD ──────────────────────────────────────────────────── */}
        <div className="mt-12 lg:mt-16 space-y-12">
          {/* Tabs */}
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

            <TabsContent value="description" className="pt-6">
              {body ? (
                <ReactMarkdown className="prose prose-neutral dark:prose-invert max-w-none">
                  {body}
                </ReactMarkdown>
              ) : description ? (
                <p className="text-muted-foreground leading-relaxed">{description}</p>
              ) : (
                <p className="text-muted-foreground">No description available.</p>
              )}
            </TabsContent>

            <TabsContent value="specifications" className="pt-6">
              <div className="rounded-lg border p-6 text-muted-foreground text-sm space-y-3">
                <p>Specifications coming soon.</p>
                {selectedVariant && (
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-2 max-w-sm">
                    {selectedVariant.sku && (
                      <>
                        <dt className="font-medium text-foreground">SKU</dt>
                        <dd>{selectedVariant.sku}</dd>
                      </>
                    )}
                    {selectedVariant.weight_grams != null && (
                      <>
                        <dt className="font-medium text-foreground">Weight</dt>
                        <dd>{selectedVariant.weight_grams}g</dd>
                      </>
                    )}
                    {product.product_type && (
                      <>
                        <dt className="font-medium text-foreground">Type</dt>
                        <dd className="capitalize">{product.product_type}</dd>
                      </>
                    )}
                  </dl>
                )}
              </div>
            </TabsContent>

            <TabsContent value="reviews" className="pt-6">
              <div className="flex flex-col items-center justify-center gap-4 py-12 text-muted-foreground">
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star key={n} className="w-6 h-6 text-muted-foreground/30" />
                  ))}
                </div>
                <p className="text-lg font-medium">No reviews yet</p>
                <p className="text-sm text-center max-w-xs">
                  Be the first to review this product.
                </p>
              </div>
            </TabsContent>
          </Tabs>

          {/* Related Products */}
          {relatedProducts.length > 0 && (
            <section>
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

      {/* ── STICKY BOTTOM BAR ─────────────────────────────────────────────── */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur border-t shadow-lg transition-transform duration-300 ${
          stickyBarVisible ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="container mx-auto px-4 py-3 max-w-7xl flex items-center justify-between gap-4">
          <div className="flex flex-col min-w-0">
            <span className="font-semibold truncate text-sm">{title}</span>
            <PriceDisplay
              price={selectedVariant?.price ?? 0}
              compareAtPrice={selectedVariant?.compare_at_price ?? null}
              currency={selectedVariant?.currency ?? "USD"}
            />
          </div>
          <Button
            size="lg"
            className="flex-shrink-0 gap-2"
            disabled={isOutOfStock}
            onClick={handleAddToCart}
          >
            {addedToCart ? (
              <>
                <Check className="w-5 h-5" />
                Added!
              </>
            ) : (
              <>
                <ShoppingCart className="w-5 h-5" />
                {isOutOfStock ? "Out of Stock" : "Add to Cart"}
              </>
            )}
          </Button>
        </div>
      </div>

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
