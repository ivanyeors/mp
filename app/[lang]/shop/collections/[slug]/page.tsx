"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/shop/product-card";
import { ProductGrid } from "@/components/shop/product-grid";
import { useI18n } from "@/lib/i18n/use-i18n";
import { withLocale } from "@/lib/i18n/routing";
import { ChevronLeft } from "lucide-react";
import type { Collection, Product } from "@/lib/types/ecommerce";

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="rounded-lg bg-muted animate-pulse aspect-[3/4]" />
      ))}
    </div>
  );
}

export default function CollectionPage() {
  const { m, locale } = useI18n();
  const params = useParams<{ lang: string; slug: string }>();
  const slug = params?.slug ?? "";

  const [collection, setCollection] = useState<Collection | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingCollection, setLoadingCollection] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const shopHref = withLocale("/shop", locale);

  // Fetch collection by slug
  useEffect(() => {
    if (!slug) return;
    setLoadingCollection(true);
    fetch("/api/shop/collections?active=true")
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) return;
        const found = (data.rows as Collection[]).find((c) => c.slug === slug);
        if (!found) {
          setNotFound(true);
        } else {
          setCollection(found);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoadingCollection(false));
  }, [slug]);

  // Fetch products for the collection once we have its id
  useEffect(() => {
    if (!collection) return;
    setLoadingProducts(true);

    // First get the ordered product_ids from the join table
    fetch(`/api/shop/collections/${collection.id}/products`)
      .then((r) => r.json())
      .then(async (data) => {
        if (!data.ok || !data.product_ids?.length) {
          setProducts([]);
          return;
        }
        // Fetch all active products and filter client-side by id
        // (avoids needing a dedicated bulk-by-ids endpoint)
        const res = await fetch(
          `/api/shop/products?status=active&limit=100`
        );
        const all = await res.json();
        if (!all.ok) return;
        const idSet = new Set<string>(data.product_ids as string[]);
        const ordered = (data.product_ids as string[])
          .map((id: string) =>
            (all.rows as Product[]).find((p) => p.id === id)
          )
          .filter((p): p is Product => p !== undefined && idSet.has(p.id));
        setProducts(ordered);
      })
      .catch(() => {})
      .finally(() => setLoadingProducts(false));
  }, [collection]);

  const loading = loadingCollection || loadingProducts;

  // Collection title & description for the active locale
  const collectionTitle =
    collection?.content?.[locale]?.title ??
    collection?.content?.["en-US"]?.title ??
    slug;
  const collectionDescription =
    collection?.content?.[locale]?.description ??
    collection?.content?.["en-US"]?.description ??
    "";

  if (notFound && !loadingCollection) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4 text-center">
        <p className="text-2xl font-semibold">Collection not found</p>
        <Button asChild variant="outline">
          <Link href={shopHref}>
            <ChevronLeft className="mr-1 h-4 w-4" />
            {m.shop.cart.continueShopping}
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Back link */}
      <div>
        <Link
          href={shopHref}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          {m.shop.title}
        </Link>
      </div>

      {/* Hero */}
      {loadingCollection ? (
        <div className="w-full rounded-xl bg-muted animate-pulse h-48 sm:h-64" />
      ) : collection ? (
        <div className="relative w-full overflow-hidden rounded-xl bg-muted">
          {collection.image_url ? (
            <div className="relative h-48 sm:h-72 w-full">
              <Image
                src={collection.image_url}
                alt={collectionTitle}
                fill
                className="object-cover"
                sizes="(max-width: 1280px) 100vw, 1280px"
                priority
              />
              <div className="absolute inset-0 bg-black/40" />
              <div className="absolute inset-0 flex flex-col justify-end p-6 sm:p-10">
                <h1 className="text-3xl sm:text-4xl font-bold text-white leading-tight">
                  {collectionTitle}
                </h1>
                {collectionDescription && (
                  <p className="mt-2 max-w-xl text-sm sm:text-base text-white/80">
                    {collectionDescription}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="px-6 py-10 sm:px-10 sm:py-14">
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
                {collectionTitle}
              </h1>
              {collectionDescription && (
                <p className="mt-3 max-w-xl text-muted-foreground">
                  {collectionDescription}
                </p>
              )}
            </div>
          )}
        </div>
      ) : null}

      {/* Product grid / states */}
      {loading ? (
        <SkeletonGrid />
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
          <p className="text-xl font-medium text-muted-foreground">
            {m.shop.noProducts}
          </p>
          <Button asChild variant="outline">
            <Link href={shopHref}>
              <ChevronLeft className="mr-1 h-4 w-4" />
              {m.shop.cart.continueShopping}
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {products.length} {products.length === 1 ? "product" : "products"}
          </p>
          <ProductGrid>
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </ProductGrid>
        </>
      )}
    </div>
  );
}
